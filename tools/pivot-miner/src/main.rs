//! Pivot-paraphrase mining over a sentence-aligned EN/EL corpus (OPUS Moses format).
//! Design: experiments/pivot-paraphrase-v1/DESIGN.md. Deterministic, std-only, no model calls.
//!
//!   pivot-miner <corpus-dir> --queries <file>      # one query per line: "<mode>\t<lang>\t<phrase>"
//!     mode: translate | paraphrase ; lang: en | el (the language of the phrase)
//! Output: one JSON object per query on stdout.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, BufRead, Write};

// ---------------------------------------------------------------- tokens

/// Lower case, Greek accents/diaeresis and final sigma folded (so «Κάλεσε» = «καλεσε»).
pub fn fold_char(c: char) -> char {
    match c {
        'ά' => 'α', 'έ' => 'ε', 'ή' => 'η', 'ί' | 'ϊ' | 'ΐ' => 'ι', 'ό' => 'ο', 'ύ' | 'ϋ' | 'ΰ' => 'υ', 'ώ' => 'ω', 'ς' => 'σ',
        _ => c,
    }
}

pub fn tokenize(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in line.chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_alphanumeric() {
            cur.push(fold_char(ch));
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

// ---------------------------------------------------------------- one side of the corpus

pub struct Side {
    vocab: HashMap<String, u32>,
    words: Vec<String>,
    lines: Vec<Vec<u32>>,
    postings: Vec<Vec<u32>>, // word -> sorted, deduplicated line ids
    df_cache: RefCell<HashMap<Vec<u32>, usize>>,
}

impl Side {
    pub fn build<I: IntoIterator<Item = String>>(raw: I) -> Side {
        let mut s = Side { vocab: HashMap::new(), words: Vec::new(), lines: Vec::new(), postings: Vec::new(), df_cache: RefCell::new(HashMap::new()) };
        for (i, line) in raw.into_iter().enumerate() {
            let mut ids = Vec::new();
            for t in tokenize(&line) {
                let next = s.words.len() as u32;
                let id = *s.vocab.entry(t.clone()).or_insert_with(|| {
                    s.words.push(t);
                    s.postings.push(Vec::new());
                    next
                });
                let p = &mut s.postings[id as usize];
                if p.last() != Some(&(i as u32)) {
                    p.push(i as u32);
                }
                ids.push(id);
            }
            s.lines.push(ids);
        }
        s
    }

    pub fn n_lines(&self) -> usize { self.lines.len() }

    pub fn ids(&self, phrase: &str) -> Option<Vec<u32>> {
        let toks = tokenize(phrase);
        if toks.is_empty() { return None; }
        toks.iter().map(|t| self.vocab.get(t).copied()).collect()
    }

    pub fn text(&self, ids: &[u32]) -> String {
        ids.iter().map(|&i| self.words[i as usize].as_str()).collect::<Vec<_>>().join(" ")
    }

    /// Lines whose token sequence contains `ids` contiguously.
    /// Intersects the two rarest words' postings, then verifies contiguity in each remaining line.
    pub fn find(&self, ids: &[u32]) -> Vec<u32> {
        let mut by_len: Vec<&Vec<u32>> = ids.iter().map(|&w| &self.postings[w as usize]).collect();
        by_len.sort_by_key(|p| p.len());
        let candidates: Vec<u32> = if by_len.len() == 1 { by_len[0].clone() } else { intersect(by_len[0], by_len[1]) };
        candidates.into_iter().filter(|&l| contains(&self.lines[l as usize], ids)).collect()
    }

    /// Line-frequency of a phrase (exact; postings length for one word, cached otherwise).
    pub fn df(&self, ids: &[u32]) -> usize {
        if ids.len() == 1 { return self.postings[ids[0] as usize].len(); }
        if let Some(&n) = self.df_cache.borrow().get(ids) { return n; }
        let n = self.find(ids).len();
        self.df_cache.borrow_mut().insert(ids.to_vec(), n);
        n
    }
}

/// Sorted-list intersection, galloping through the longer list.
fn intersect(short: &[u32], long: &[u32]) -> Vec<u32> {
    let mut out = Vec::new();
    let mut lo = 0;
    for &x in short {
        match long[lo..].binary_search(&x) {
            Ok(i) => { out.push(x); lo += i + 1; }
            Err(i) => lo += i,
        }
        if lo >= long.len() { break; }
    }
    out
}

fn contains(hay: &[u32], needle: &[u32]) -> bool {
    needle.len() <= hay.len() && hay.windows(needle.len()).any(|w| w == needle)
}

// ---------------------------------------------------------------- scoring

/// Dunning log-likelihood ratio G² for a 2x2 table.
pub fn g2(a: f64, b: f64, c: f64, d: f64) -> f64 {
    let n = a + b + c + d;
    let term = |o: f64, e: f64| if o > 0.0 && e > 0.0 { o * (o / e).ln() } else { 0.0 };
    let (r1, r2, c1, c2) = (a + b, c + d, a + c, b + d);
    2.0 * (term(a, r1 * c1 / n) + term(b, r1 * c2 / n) + term(c, r2 * c1 / n) + term(d, r2 * c2 / n))
}

#[derive(Clone)]
pub struct Cand {
    pub ids: Vec<u32>,
    pub text: String,
    pub both: usize,
    pub df: usize,
    pub p_t_q: f64,
    pub p_q_t: f64,
    pub g2: f64,
    pub evidence: Vec<u32>,
}

pub struct Params { pub max_n: usize, pub min_count: usize, pub scored: usize, pub keep: usize, pub min_p_q_t: f64 }
pub const PARAMS: Params = Params { max_n: 4, min_count: 3, scored: 300, keep: 25, min_p_q_t: 0.01 };

/// Target-side candidates for a source phrase, ranked by p(t|q)·p(q|t).
pub fn translate(src: &Side, tgt: &Side, query: &[u32], p: &Params) -> (usize, Vec<Cand>) {
    let hits = src.find(query);
    let n_q = hits.len();
    let mut counts: HashMap<Vec<u32>, (usize, Vec<u32>)> = HashMap::new();
    for &l in &hits {
        let line = &tgt.lines[l as usize];
        let mut seen: HashSet<&[u32]> = HashSet::new();
        for n in 1..=p.max_n {
            for w in line.windows(n) {
                if !seen.insert(w) { continue; }
                let g = w.to_vec();
                let e = counts.entry(g).or_insert((0, Vec::new()));
                e.0 += 1;
                if e.1.len() < 3 { e.1.push(l); }
            }
        }
    }
    let mut frequent: Vec<(Vec<u32>, usize, Vec<u32>)> =
        counts.into_iter().filter(|(_, (c, _))| *c >= p.min_count).map(|(g, (c, ev))| (g, c, ev)).collect();
    frequent.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    frequent.truncate(p.scored);
    let total = tgt.n_lines() as f64;
    let mut out: Vec<Cand> = frequent
        .into_iter()
        .map(|(g, c, evidence)| {
            let df = tgt.df(&g).max(c);
            let (a, b, cc) = (c as f64, (n_q - c) as f64, (df - c) as f64);
            let d = (total - a - b - cc).max(0.0);
            Cand { text: tgt.text(&g), ids: g, both: c, df, p_t_q: a / n_q as f64, p_q_t: a / df as f64, g2: g2(a, b, cc, d), evidence }
        })
        .filter(|c| c.p_q_t >= p.min_p_q_t)
        .collect();
    out.sort_by(|a, b| (b.p_t_q * b.p_q_t).partial_cmp(&(a.p_t_q * a.p_q_t)).unwrap().then_with(|| a.ids.cmp(&b.ids)));
    out.truncate(p.keep);
    (n_q, out)
}

/// q (lang A) -> pivots (lang B) -> paraphrases (lang A): score(t2) = Σ_pivot w(pivot|q) · p(t2|pivot) · p(pivot|t2),
/// w ∝ p(pivot|q)·p(q|pivot) over the top specific pivots. A ranking score, not a probability.
pub fn paraphrase(a: &Side, b: &Side, query: &[u32], p: &Params, pivots: usize) -> (usize, Vec<(String, f64, Vec<String>)>) {
    let (n_q, piv) = translate(a, b, query, p);
    // Only pivots specific to the query (p(q|pivot) >= 0.05) carry meaning; "be" for «πρέπει να» does not.
    let piv: Vec<&Cand> = piv.iter().filter(|c| c.p_q_t >= 0.05).take(pivots).collect();
    let norm: f64 = piv.iter().map(|c| c.p_q_t * c.p_t_q).sum();
    let mut agg: HashMap<String, (f64, Vec<String>)> = HashMap::new();
    for pv in piv {
        let w = if norm > 0.0 { pv.p_q_t * pv.p_t_q / norm } else { 0.0 };
        let (_, back) = translate(b, a, &pv.ids, p);
        for t in back {
            let e = agg.entry(t.text.clone()).or_insert((0.0, Vec::new()));
            // Specificity on the way back too, so function words that co-occur with everything sink.
            e.0 += w * t.p_t_q * t.p_q_t;
            if e.1.len() < 3 { e.1.push(pv.text.clone()); }
        }
    }
    let mut out: Vec<(String, f64, Vec<String>)> = agg.into_iter().map(|(k, (s, v))| (k, s, v)).collect();
    out.sort_by(|x, y| y.1.partial_cmp(&x.1).unwrap().then_with(|| x.0.cmp(&y.0)));
    out.truncate(p.keep);
    (n_q, out)
}

// ---------------------------------------------------------------- JSON output (no dependencies)

fn js(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn read_lines(path: &str) -> io::Result<Vec<String>> {
    io::BufReader::new(fs::File::open(path)?).lines().collect()
}

fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).expect("usage: pivot-miner <corpus-dir> --queries <file>");
    let qpath = args.iter().position(|a| a == "--queries").and_then(|i| args.get(i + 1)).expect("--queries <file>");
    let t0 = std::time::Instant::now();
    let en = Side::build(read_lines(&format!("{dir}/Europarl.el-en.en"))?);
    let el = Side::build(read_lines(&format!("{dir}/Europarl.el-en.el"))?);
    assert_eq!(en.n_lines(), el.n_lines(), "line counts differ");
    eprintln!("indexed {} pairs in {:.1}s", en.n_lines(), t0.elapsed().as_secs_f64());
    let stdout = io::stdout();
    let mut w = stdout.lock();
    for q in read_lines(qpath)? {
        let parts: Vec<&str> = q.splitn(3, '\t').collect();
        if parts.len() != 3 || q.starts_with('#') { continue; }
        let (mode, lang, phrase) = (parts[0], parts[1], parts[2]);
        let (src, tgt) = if lang == "el" { (&el, &en) } else { (&en, &el) };
        let Some(ids) = src.ids(phrase) else {
            writeln!(w, "{{\"mode\":{},\"lang\":{},\"query\":{},\"found\":0,\"note\":\"a word of the query is not in the corpus\"}}", js(mode), js(lang), js(phrase))?;
            continue;
        };
        match mode {
            "translate" => {
                let (n_q, cands) = translate(src, tgt, &ids, &PARAMS);
                let items: Vec<String> = cands.iter().map(|c| {
                    let (_, back) = translate(tgt, src, &c.ids, &PARAMS);
                    let rt = back.iter().position(|b| b.ids == ids).map(|r| (r + 1).to_string()).unwrap_or_else(|| "null".into());
                    format!("{{\"text\":{},\"both\":{},\"df\":{},\"pTgivenQ\":{:.4},\"pQgivenT\":{:.4},\"g2\":{:.1},\"roundTripRank\":{},\"evidenceLines\":{:?}}}",
                        js(&c.text), c.both, c.df, c.p_t_q, c.p_q_t, c.g2, rt, c.evidence)
                }).collect();
                writeln!(w, "{{\"mode\":\"translate\",\"lang\":{},\"query\":{},\"found\":{},\"candidates\":[{}]}}", js(lang), js(phrase), n_q, items.join(","))?;
            }
            "paraphrase" => {
                let (n_q, cands) = paraphrase(src, tgt, &ids, &PARAMS, 10);
                let items: Vec<String> = cands.iter().map(|(t, s, via)| format!("{{\"text\":{},\"score\":{:.4},\"via\":[{}]}}", js(t), s, via.iter().map(|v| js(v)).collect::<Vec<_>>().join(","))).collect();
                writeln!(w, "{{\"mode\":\"paraphrase\",\"lang\":{},\"query\":{},\"found\":{},\"candidates\":[{}]}}", js(lang), js(phrase), n_q, items.join(","))?;
            }
            _ => writeln!(w, "{{\"query\":{},\"error\":\"mode must be translate or paraphrase\"}}", js(phrase))?,
        }
    }
    eprintln!("done in {:.1}s", t0.elapsed().as_secs_f64());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_greek_accents_case_and_final_sigma() {
        assert_eq!(tokenize("Κάλεσε την ΑΣΤΥΝΟΜΊΑ, παρακαλώ!"), vec!["καλεσε", "την", "αστυνομια", "παρακαλω"]);
        assert_eq!(tokenize("τους φίλους"), vec!["τουσ", "φιλουσ"]);
        assert_eq!(tokenize("Call the police."), vec!["call", "the", "police"]);
    }

    fn corpus() -> (Side, Side) {
        let en = ["he called the police", "she called the police at night", "they called the police", "the police came", "he called his mother", "the weather is nice"];
        let el = ["κάλεσε την αστυνομία", "τηλεφώνησε στην αστυνομία τη νύχτα", "κάλεσαν την αστυνομία", "ήρθε η αστυνομία", "τηλεφώνησε στη μητέρα του", "ο καιρός είναι καλός"];
        (Side::build(en.iter().map(|s| s.to_string())), Side::build(el.iter().map(|s| s.to_string())))
    }

    #[test]
    fn finds_contiguous_phrases_only() {
        let (en, _) = corpus();
        assert_eq!(en.find(&en.ids("called the police").unwrap()), vec![0, 1, 2]);
        assert!(en.find(&en.ids("police called").unwrap()).is_empty());
        assert!(en.ids("telephoned").is_none());
    }

    #[test]
    fn translation_ranks_the_specific_phrase_first() {
        let (en, el) = corpus();
        let p = Params { max_n: 3, min_count: 1, scored: 100, keep: 10, min_p_q_t: 0.0 };
        let (n, c) = translate(&en, &el, &en.ids("police").unwrap(), &p);
        assert_eq!(n, 4);
        assert_eq!(c[0].text, "αστυνομια"); // in all 4 lines with "police" and only there
        assert_eq!((c[0].both, c[0].df), (4, 4));
    }

    #[test]
    fn paraphrase_through_english_pivot_reaches_the_other_greek_verb() {
        let (en, el) = corpus();
        let p = Params { max_n: 3, min_count: 1, scored: 100, keep: 30, min_p_q_t: 0.0 };
        let (_, c) = paraphrase(&el, &en, &el.ids("αστυνομία").unwrap(), &p, 5);
        assert!(c.iter().any(|(t, _, _)| t == "αστυνομια"));
        let (_, v) = paraphrase(&el, &en, &el.ids("κάλεσε").unwrap(), &p, 5);
        assert!(v.iter().any(|(t, _, _)| t.starts_with("τηλεφωνησε")), "pivot 'called' links κάλεσε and τηλεφώνησε");
    }

    #[test]
    fn intersection_matches_naive() {
        let a = vec![1, 4, 7, 9, 12];
        let b = vec![0, 1, 2, 7, 8, 12, 15];
        assert_eq!(intersect(&a, &b), vec![1, 7, 12]);
        assert!(intersect(&[3], &b).is_empty());
    }

    #[test]
    fn g2_is_zero_under_independence_and_positive_otherwise() {
        assert!(g2(10.0, 10.0, 10.0, 10.0).abs() < 1e-9);
        assert!(g2(10.0, 0.0, 0.0, 10.0) > 20.0);
    }
}
