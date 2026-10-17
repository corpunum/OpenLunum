//! Pivot-paraphrase mining over a sentence-aligned EN/EL corpus (OPUS Moses format).
//! Design: experiments/pivot-paraphrase-v1/DESIGN.md. Deterministic, std-only, no model calls.
//!
//!   pivot-miner <corpus-dir> --queries <file> [--prefix Europarl.el-en] [--max-lines N] [--lemmas-en eng --lemmas-el ell] [--variant-lemmas] [--no-roundtrip]
//!   pivot-miner --classify <unimorph-table> <words-file> [--variant-lemmas]   # word -> lemma class, then exit
//!   # one query per line: "<mode>\t<lang>\t<phrase>"
//!     mode: translate | paraphrase ; lang: en | el (the language of the phrase)
//!     or "pair\t<english phrase>\t<greek phrase>" to check a proposed equivalence
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

// ---------------------------------------------------------------- lemma classes (UniMorph)

/// Folded form -> lemma label, from UniMorph rows `lemma<TAB>form<TAB>features`.
/// A form maps to the smallest of ITS OWN lemmas; a lemma maps to itself. No transitive merging:
/// v1 merged lemmas that shared any form, and chains of shared forms built giant classes in English
/// ("card", "dance", "strip" all became "aba"), which sank the OMW measurement (2026-10-17).
/// Greek particle forms («να καλέσω», «θα καλέσουμε») keep the verb.
pub fn lemma_map<I: IntoIterator<Item = String>>(rows: I) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    let mut lemmas: HashSet<String> = HashSet::new();
    let put = |k: String, v: &String, out: &mut HashMap<String, String>| {
        let e = out.entry(k).or_insert_with(|| v.clone());
        if v < e { *e = v.clone(); }
    };
    for row in rows {
        let f: Vec<&str> = row.split('\t').collect();
        if f.len() < 3 { continue; }
        let mut ft = tokenize(f[1]);
        if ft.len() == 2 && ["θα", "να", "ασ"].contains(&ft[0].as_str()) { ft.remove(0); }
        let (lemma, form) = (tokenize(f[0]).join(" "), ft.join(" "));
        if lemma.is_empty() || form.is_empty() || lemma.contains(' ') || form.contains(' ') { continue; }
        put(form, &lemma, &mut out);
        lemmas.insert(lemma);
    }
    // A word that is itself a lemma keeps its own label, even when it is also a form of another lemma.
    for l in lemmas { out.insert(l.clone(), l); }
    out
}

// ---------------------------------------------------------------- variant lemmas (Greek)

/// Ending classes whose members are interchangeable spellings of the SAME lemma:
/// two lemmas are variants when they are the same stem with one ending swapped for
/// another member of the class (τηλεφωνώ vs τηλεφωνάω: stem τηλεφων-, endings ω vs αω).
/// Pinned from the UniMorph Greek table on 2026-10-17: -ώ vs -άω is the only
/// productive class in the table (82 same-stem pairs); the mechanism accepts any class.
pub fn variant_classes() -> Vec<Vec<&'static str>> {
    vec![vec!["ω", "αω"]]
}

/// Class key of a lemma: when it ends in an ending of a variant class, the key is
/// the shared stem plus the sorted class id; otherwise the lemma itself. Two lemmas
/// share a key exactly when they are the same stem with an ending-class swap —
/// never a transitive chain (v1 merged on any shared form and built giant classes).
pub fn variant_key(lemma: &str, classes: &[Vec<&'static str>]) -> String {
    for class in classes {
        let Some(end) = class.iter().filter(|e| lemma.ends_with(**e)).max_by_key(|e| e.len()) else { continue };
        let stem = &lemma[..lemma.len() - end.len()];
        if stem.is_empty() { continue; }
        let mut id: Vec<&str> = class.to_vec();
        id.sort_unstable();
        return format!("{}\u{1f}{}", stem, id.join("+"));
    }
    lemma.to_string()
}

/// Stats of the merge on a built map: (merged classes = groups of 2+ lemmas sharing a
/// variant key, largest class size). Reported with every run that uses variant mode.
pub fn variant_stats(map: &HashMap<String, String>, classes: &[Vec<&'static str>]) -> (usize, usize) {
    let mut sizes: HashMap<String, usize> = HashMap::new();
    for (k, v) in map.iter().filter(|(k, v)| k == v) {
        *sizes.entry(variant_key(v, classes)).or_insert(0) += 1;
    }
    let merged = sizes.values().filter(|&&n| n >= 2).count();
    let largest = sizes.values().copied().max().unwrap_or(0);
    (merged, largest)
}

/// Merge spelling-variant lemmas into one class: every member of a variant class and
/// every form mapped to a member is remapped to the smallest member of its class.
/// Membership is exact (stem, class) equality, so merging never chains: A~B and B~C
/// does not pull A~C unless A and C are themselves the same stem with swapped endings.
pub fn variant_merge(map: &mut HashMap<String, String>, classes: &[Vec<&'static str>]) {
    let lemmas: HashSet<String> = map.iter().filter(|(k, v)| k == v).map(|(k, _)| k.clone()).collect();
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    for l in lemmas { groups.entry(variant_key(&l, classes)).or_default().push(l); }
    for (_, group) in groups {
        if group.len() < 2 { continue; }
        let target = group.iter().min().cloned().unwrap();
        for f in map.values_mut() { if group.contains(f) { *f = target.clone(); } }
    }
}

// ---------------------------------------------------------------- one side of the corpus

pub struct Side {
    vocab: HashMap<String, u32>,
    words: Vec<String>,
    lines: Vec<Vec<u32>>,
    postings: Vec<Vec<u32>>, // word -> sorted, deduplicated line ids
    df_cache: RefCell<HashMap<Vec<u32>, usize>>,
    sorted_words: Vec<(String, u32)>, // for prefix (stem) lookup
    lemmas: Option<std::rc::Rc<HashMap<String, String>>>, // folded form -> lemma class (lemma mode)
}

impl Side {
    pub fn build<I: IntoIterator<Item = String>>(raw: I) -> Side { Side::build_with(raw, None) }

    /// Tokens of a text in this side's mode: surface forms, or lemma classes when a lemma map is set.
    pub fn tokens(&self, text: &str) -> Vec<String> {
        let t = tokenize(text);
        match &self.lemmas { None => t, Some(m) => t.into_iter().map(|w| m.get(&w).cloned().unwrap_or(w)).collect() }
    }

    pub fn build_with<I: IntoIterator<Item = String>>(raw: I, lemmas: Option<std::rc::Rc<HashMap<String, String>>>) -> Side {
        let mut s = Side { vocab: HashMap::new(), words: Vec::new(), lines: Vec::new(), postings: Vec::new(), df_cache: RefCell::new(HashMap::new()), sorted_words: Vec::new(), lemmas };
        for (i, line) in raw.into_iter().enumerate() {
            let mut ids = Vec::new();
            for t in s.tokens(&line) {
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
        s.sorted_words = s.words.iter().cloned().zip(0u32..).collect();
        s.sorted_words.sort();
        s
    }

    /// Lines containing, in any order, a word starting with each stem (crude inflection-tolerant match).
    /// Stems matching more than `PARAMS.frequent_share` of lines (function words such as «στην») are skipped,
    /// unless every stem is that frequent.
    pub fn find_stems(&self, stems: &[String]) -> Vec<u32> {
        let per: Vec<Vec<u32>> = stems.iter().map(|st| {
            let from = self.sorted_words.partition_point(|(w, _)| w.as_str() < st.as_str());
            let mut lines: Vec<u32> = self.sorted_words[from..].iter().take_while(|(w, _)| w.starts_with(st.as_str()))
                .flat_map(|(_, id)| self.postings[*id as usize].iter().copied()).collect();
            lines.sort_unstable();
            lines.dedup();
            lines
        }).collect();
        let limit = PARAMS.frequent_share * self.n_lines() as f64;
        let content: Vec<&Vec<u32>> = per.iter().filter(|l| (l.len() as f64) <= limit).collect();
        let used: Vec<&Vec<u32>> = if content.is_empty() { per.iter().collect() } else { content };
        let mut acc: Option<Vec<u32>> = None;
        for lines in used { acc = Some(match acc { None => lines.clone(), Some(prev) => intersect(&prev, lines) }); }
        acc.unwrap_or_default()
    }

    pub fn n_lines(&self) -> usize { self.lines.len() }

    pub fn ids(&self, phrase: &str) -> Option<Vec<u32>> {
        let toks = self.tokens(phrase);
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

    /// True when every word of the phrase occurs in more than `share` of all lines.
    pub fn all_frequent(&self, ids: &[u32], share: f64) -> bool {
        let limit = share * self.n_lines() as f64;
        ids.iter().all(|&w| self.postings[w as usize].len() as f64 > limit)
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

/// Stems for inflection-tolerant matching: words of 3 letters or fewer are dropped (articles, prepositions),
/// numbers are kept whole; Greek loses up to 3 final vowels/sigma, English a final -ing/-ed/-es/-s,
/// never below 4 letters. Crude by design; results are labelled stem evidence.
pub fn stems(phrase: &str) -> Vec<String> {
    tokenize(phrase).into_iter().filter(|t| t.chars().count() > 3 || t.chars().all(|c| c.is_ascii_digit())).map(|t| {
        if t.chars().all(|c| c.is_ascii_digit()) { return t; }
        let mut cs: Vec<char> = t.chars().collect();
        let greek = cs.iter().any(|c| ('\u{0370}'..='\u{03ff}').contains(c));
        if greek {
            let mut cut = 0;
            while cut < 3 && cs.len() > 4 && "αεηιουωσ".contains(*cs.last().unwrap()) { cs.pop(); cut += 1; }
        } else {
            for suf in ["ing", "ed", "es", "s"] {
                let sc: Vec<char> = suf.chars().collect();
                if cs.len() >= 4 + sc.len() && cs.ends_with(&sc) { cs.truncate(cs.len() - sc.len()); break; }
            }
        }
        cs.into_iter().collect()
    }).collect()
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

/// `frequent_share`: a candidate made only of words found in more than this share of lines (function words) is dropped.
pub struct Params { pub max_n: usize, pub min_count: usize, pub scored: usize, pub keep: usize, pub min_p_q_t: f64, pub frequent_share: f64 }
pub const PARAMS: Params = Params { max_n: 4, min_count: 3, scored: 300, keep: 25, min_p_q_t: 0.01, frequent_share: 0.03 };

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
        .filter(|c| c.p_q_t >= p.min_p_q_t && !tgt.all_frequent(&c.ids, p.frequent_share))
        .collect();
    out.sort_by(|a, b| (b.p_t_q * b.p_q_t).partial_cmp(&(a.p_t_q * a.p_q_t)).unwrap().then_with(|| a.ids.cmp(&b.ids)));
    out.truncate(p.keep);
    (n_q, out)
}

/// q (lang A) -> pivots (lang B) -> paraphrases (lang A): score(t2) = Σ_pivot w(pivot|q) · p(t2|pivot) · p(pivot|t2),
/// w ∝ p(pivot|q)·p(q|pivot) over the top specific pivots. A ranking score, not a probability.
pub struct Paraphrases { pub found: usize, pub pivots: Vec<(String, f64)>, pub paraphrases: Vec<(String, f64, Vec<String>)>, pub query_variants: Vec<(String, f64)> }

pub fn paraphrase(a: &Side, b: &Side, query: &[u32], p: &Params, pivots: usize) -> Paraphrases {
    let (n_q, piv) = translate(a, b, query, p);
    // Only pivots specific to the query (p(q|pivot) >= 0.05) carry meaning; "be" for «πρέπει να» does not.
    let piv: Vec<&Cand> = piv.iter().filter(|c| c.p_q_t >= 0.05).take(pivots).collect();
    let norm: f64 = piv.iter().map(|c| c.p_q_t * c.p_t_q).sum();
    let mut agg: HashMap<Vec<u32>, (f64, Vec<String>)> = HashMap::new();
    let pivot_list: Vec<(String, f64)> = piv.iter().map(|c| (c.text.clone(), if norm > 0.0 { c.p_q_t * c.p_t_q / norm } else { 0.0 })).collect();
    for pv in piv {
        let w = if norm > 0.0 { pv.p_q_t * pv.p_t_q / norm } else { 0.0 };
        let (_, back) = translate(b, a, &pv.ids, p);
        for t in back {
            let e = agg.entry(t.ids.clone()).or_insert((0.0, Vec::new()));
            // Specificity on the way back too, so function words that co-occur with everything sink.
            e.0 += w * t.p_t_q * t.p_q_t;
            if e.1.len() < 3 { e.1.push(pv.text.clone()); }
        }
    }
    // Fragments or extensions of the query itself ("same time" for "at the same time") are listed apart.
    let overlaps = |g: &[u32]| contains(query, g) || contains(g, query);
    let mut all: Vec<(Vec<u32>, f64, Vec<String>)> = agg.into_iter().map(|(k, (s, v))| (k, s, v)).collect();
    all.sort_by(|x, y| y.1.partial_cmp(&x.1).unwrap().then_with(|| x.0.cmp(&y.0)));
    let query_variants: Vec<(String, f64)> = all.iter().filter(|x| overlaps(&x.0)).take(p.keep).map(|x| (a.text(&x.0), x.1)).collect();
    let paraphrases: Vec<(String, f64, Vec<String>)> = all.into_iter().filter(|x| !overlaps(&x.0)).take(p.keep).map(|x| (a.text(&x.0), x.1, x.2)).collect();
    Paraphrases { found: n_q, pivots: pivot_list, paraphrases, query_variants }
}

/// Stem-level evidence for a proposed equivalence (all stems of each side in the same aligned line).
pub fn pair_stems(en: &Side, el: &Side, e: &[String], g: &[String]) -> (usize, usize, usize, f64) {
    if e.is_empty() || g.is_empty() { return (0, 0, 0, 0.0); }
    let le = en.find_stems(e);
    let lg = el.find_stems(g);
    let both = intersect(&le, &lg).len();
    let n = en.n_lines() as f64;
    let (a, b, c) = (both as f64, (le.len() - both) as f64, (lg.len() - both) as f64);
    (le.len(), lg.len(), both, g2(a, b, c, (n - a - b - c).max(0.0)))
}

/// Evidence for one proposed EN/EL equivalence (for model proposals): line counts and association.
pub fn pair(en: &Side, el: &Side, e: &[u32], g: &[u32]) -> (usize, usize, usize, f64, Vec<u32>) {
    let le = en.find(e);
    let lg: HashSet<u32> = el.find(g).into_iter().collect();
    let both: Vec<u32> = le.iter().copied().filter(|l| lg.contains(l)).collect();
    let n = en.n_lines() as f64;
    let (a, b, c) = (both.len() as f64, (le.len() - both.len()) as f64, (lg.len() - both.len()) as f64);
    (le.len(), lg.len(), both.len(), g2(a, b, c, (n - a - b - c).max(0.0)), both.into_iter().take(3).collect())
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

/// The first `max` lines (both sides are capped alike, so alignment is kept).
fn read_lines(path: &str, max: usize) -> io::Result<Vec<String>> {
    io::BufReader::new(fs::File::open(path)?).lines().take(max).collect()
}

fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let flag = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    // `pivot-miner --classify <unimorph-table> <words-file>`: print "word<TAB>class" for each word, then exit.
    // Lets scorers map words to lemma classes with exactly the miner's own rules.
    let variants = args.iter().any(|a| a == "--variant-lemmas");
    let vc = variant_classes();
    if args.get(1).map(|a| a == "--variant-stats").unwrap_or(false) {
        let m = lemma_map(read_lines(&args[2], usize::MAX)?);
        let (merged, largest) = variant_stats(&m, &vc);
        writeln!(io::stdout().lock(), "{{\"mergedClasses\":{},\"largestClass\":{}}}", merged, largest)?;
        return Ok(());
    }
    if args.get(1).map(|a| a == "--classify").unwrap_or(false) {
        let mut m = lemma_map(read_lines(&args[2], usize::MAX)?);
        if variants { variant_merge(&mut m, &vc); }
        let stdout = io::stdout();
        let mut w = stdout.lock();
        for word in read_lines(&args[3], usize::MAX)? {
            let toks: Vec<String> = tokenize(&word).into_iter().map(|t| m.get(&t).cloned().unwrap_or(t)).collect();
            writeln!(w, "{}\t{}", word, toks.join(" "))?;
        }
        return Ok(());
    }
    let dir = args.get(1).expect("usage: pivot-miner <corpus-dir> --queries <file>");
    let qpath = args.iter().position(|a| a == "--queries").and_then(|i| args.get(i + 1)).expect("--queries <file>");
    let prefix = flag("--prefix").unwrap_or_else(|| "Europarl.el-en".to_string());
    let max_lines: usize = flag("--max-lines").map(|v| v.parse().expect("--max-lines <n>")).unwrap_or(usize::MAX);
    let t0 = std::time::Instant::now();
    // Lemma mode: --lemmas-en / --lemmas-el point at UniMorph tables; both sides and all queries use lemma classes.
    let load = |name: &str| -> io::Result<Option<std::rc::Rc<HashMap<String, String>>>> {
        Ok(match flag(name) {
            Some(path) => {
                let mut m = lemma_map(read_lines(&path, usize::MAX)?);
                if variants { variant_merge(&mut m, &vc); }
                Some(std::rc::Rc::new(m))
            }
            None => None,
        })
    };
    let (lem_en, lem_el) = (load("--lemmas-en")?, load("--lemmas-el")?);
    let no_roundtrip = args.iter().any(|a| a == "--no-roundtrip");
    if let (Some(a), Some(b)) = (&lem_en, &lem_el) { eprintln!("lemma mode: {} EN forms, {} EL forms{}", a.len(), b.len(), if variants { " (variant lemmas merged)" } else { "" }); }
    let en = Side::build_with(read_lines(&format!("{dir}/{prefix}.en"), max_lines)?, lem_en);
    let el = Side::build_with(read_lines(&format!("{dir}/{prefix}.el"), max_lines)?, lem_el);
    assert_eq!(en.n_lines(), el.n_lines(), "line counts differ");
    eprintln!("indexed {} pairs in {:.1}s", en.n_lines(), t0.elapsed().as_secs_f64());
    let stdout = io::stdout();
    let mut w = stdout.lock();
    for q in read_lines(qpath, usize::MAX)? {
        let parts: Vec<&str> = q.splitn(3, '\t').collect();
        if parts.len() != 3 || q.starts_with('#') { continue; }
        let (mode, lang, phrase) = (parts[0], parts[1], parts[2]);
        if mode == "pair" {
            // "pair\t<english phrase>\t<greek phrase>"
            let exact = match (en.ids(lang), el.ids(phrase)) {
                (Some(e), Some(g)) => {
                    let (ne, ng, both, score, ev) = pair(&en, &el, &e, &g);
                    format!("{{\"enLines\":{},\"elLines\":{},\"both\":{},\"g2\":{:.1},\"evidenceLines\":{:?}}}", ne, ng, both, score, ev)
                }
                _ => "null".to_string(),
            };
            let (es, gs) = (stems(lang), stems(phrase));
            let (se, sg, sb, sg2) = pair_stems(&en, &el, &es, &gs);
            writeln!(w, "{{\"mode\":\"pair\",\"en\":{},\"el\":{},\"exact\":{},\"stem\":{{\"enStems\":[{}],\"elStems\":[{}],\"enLines\":{},\"elLines\":{},\"both\":{},\"g2\":{:.1}}}}}",
                js(lang), js(phrase), exact, es.iter().map(|x| js(x)).collect::<Vec<_>>().join(","), gs.iter().map(|x| js(x)).collect::<Vec<_>>().join(","), se, sg, sb, sg2)?;
            continue;
        }
        let (src, tgt) = if lang == "el" { (&el, &en) } else { (&en, &el) };
        let Some(ids) = src.ids(phrase) else {
            writeln!(w, "{{\"mode\":{},\"lang\":{},\"query\":{},\"found\":0,\"note\":\"a word of the query is not in the corpus\"}}", js(mode), js(lang), js(phrase))?;
            continue;
        };
        match mode {
            "translate" => {
                let (n_q, cands) = translate(src, tgt, &ids, &PARAMS);
                let items: Vec<String> = cands.iter().map(|c| {
                    let rt = if no_roundtrip { "null".to_string() } else {
                        let (_, back) = translate(tgt, src, &c.ids, &PARAMS);
                        back.iter().position(|b| b.ids == ids).map(|r| (r + 1).to_string()).unwrap_or_else(|| "null".into())
                    };
                    format!("{{\"text\":{},\"both\":{},\"df\":{},\"pTgivenQ\":{:.4},\"pQgivenT\":{:.4},\"g2\":{:.1},\"roundTripRank\":{},\"evidenceLines\":{:?}}}",
                        js(&c.text), c.both, c.df, c.p_t_q, c.p_q_t, c.g2, rt, c.evidence)
                }).collect();
                writeln!(w, "{{\"mode\":\"translate\",\"lang\":{},\"query\":{},\"found\":{},\"candidates\":[{}]}}", js(lang), js(phrase), n_q, items.join(","))?;
            }
            "paraphrase" => {
                let r = paraphrase(src, tgt, &ids, &PARAMS, 10);
                let ts = |v: &[(String, f64)]| v.iter().map(|(t, s)| format!("{{\"text\":{},\"score\":{:.4}}}", js(t), s)).collect::<Vec<_>>().join(",");
                let items: Vec<String> = r.paraphrases.iter().map(|(t, s, via)| format!("{{\"text\":{},\"score\":{:.4},\"via\":[{}]}}", js(t), s, via.iter().map(|v| js(v)).collect::<Vec<_>>().join(","))).collect();
                writeln!(w, "{{\"mode\":\"paraphrase\",\"lang\":{},\"query\":{},\"found\":{},\"pivots\":[{}],\"candidates\":[{}],\"queryVariants\":[{}]}}",
                    js(lang), js(phrase), r.found, ts(&r.pivots), items.join(","), ts(&r.query_variants))?;
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
        let p = Params { max_n: 3, min_count: 1, scored: 100, keep: 10, min_p_q_t: 0.0, frequent_share: 1.0 };
        let (n, c) = translate(&en, &el, &en.ids("police").unwrap(), &p);
        assert_eq!(n, 4);
        assert_eq!(c[0].text, "αστυνομια"); // in all 4 lines with "police" and only there
        assert_eq!((c[0].both, c[0].df), (4, 4));
    }

    #[test]
    fn paraphrase_through_english_pivot_reaches_the_other_greek_verb() {
        let (en, el) = corpus();
        let p = Params { max_n: 3, min_count: 1, scored: 100, keep: 30, min_p_q_t: 0.0, frequent_share: 1.0 };
        let r = paraphrase(&el, &en, &el.ids("αστυνομία").unwrap(), &p, 5);
        assert!(r.query_variants.iter().any(|(t, _)| t == "αστυνομια"), "the query itself is a variant, not a paraphrase");
        let v = paraphrase(&el, &en, &el.ids("κάλεσε").unwrap(), &p, 5);
        assert!(v.paraphrases.iter().any(|(t, _, _)| t.starts_with("τηλεφωνησε")), "pivot 'called' links κάλεσε and τηλεφώνησε");
        assert!(v.pivots.iter().any(|(t, _)| t.contains("called")));
    }

    #[test]
    fn pair_counts_co_occurring_lines() {
        let (en, el) = corpus();
        let (ne, ng, both, g, ev) = pair(&en, &el, &en.ids("called the police").unwrap(), &el.ids("αστυνομία").unwrap());
        assert_eq!((ne, ng, both), (3, 4, 3));
        assert!(g > 0.0);
        assert_eq!(ev, vec![0, 1, 2]);
    }

    #[test]
    fn stems_drop_function_words_and_endings() {
        assert_eq!(stems("καλώ την αστυνομία"), vec!["καλω", "αστυνομ"]);
        assert_eq!(stems("Τηλεφώνησε στην αστυνομία"), vec!["τηλεφων", "στην", "αστυνομ"]);
        assert_eq!(stems("called the police"), vec!["call", "police"]);
        assert_eq!(stems("πήρε το 100"), vec!["πηρε", "100"]);
    }

    #[test]
    fn stem_match_tolerates_inflection() {
        let (en, el) = corpus();
        let lines = el.find_stems(&stems("τηλεφωνώ στην αστυνομία"));
        assert_eq!(lines, vec![1]);
        let (_, _, both, _) = pair_stems(&en, &el, &stems("call police"), &stems("αστυνομία"));
        assert_eq!(both, 3);
    }

    #[test]
    fn function_word_candidates_are_recognised() {
        let (en, _) = corpus();
        assert!(en.all_frequent(&en.ids("the").unwrap(), 0.3));
        assert!(!en.all_frequent(&en.ids("the weather").unwrap(), 0.3));
    }

    #[test]
    fn lemma_map_maps_inflections_without_transitive_merging() {
        let rows = ["καλώ\tκάλεσε\tV;3;SG;PFV;PST", "καλώ\tκάλεσα\tV;1;SG;PFV;PST", "αστυνομία\tαστυνομίας\tN;GEN;SG",
            "καλώ\tνα καλέσω\tV;1;SG;PFV;SBJV", "καλώ\tθα καλέσουμε\tV;1;PL;PFV;FUT",
            "aba\tcards\tN;PL", "card\tcards\tN;PL", "card\tcard\tN;SG", "dance\tdances\tN;PL", "card\tdances\tN;PL"];
        let m = lemma_map(rows.iter().map(|s| s.to_string()));
        assert_eq!(m["καλεσα"], "καλω");
        assert_eq!(m["καλεσω"], "καλω");
        assert_eq!(m["καλεσουμε"], "καλω");
        assert_eq!(m["αστυνομιασ"], "αστυνομια");
        assert_eq!(m["card"], "card", "a lemma keeps its own label");
        assert_eq!(m["dance"], "dance", "no chain card~aba~dance");
        let el = Side::build_with(["Κάλεσα την αστυνομία", "θα καλέσουμε την αστυνομίας"].iter().map(|s| s.to_string()), Some(std::rc::Rc::new(m)));
        assert_eq!(el.find(&el.ids("καλώ την αστυνομία").unwrap()), vec![0, 1]);
    }

    #[test]
    fn variant_lemmas_share_a_class_same_stem_only() {
        let classes = variant_classes();
        let k = |s: &str| variant_key(s, &classes);
        assert_eq!(k("τηλεφωνω"), k("τηλεφωναω"), "τηλεφωνώ and τηλεφωνάω are one class");
        assert_eq!(k("αγαπω"), k("αγαπαω"), "αγαπώ and αγαπάω are one class");
        assert_ne!(k("καλω"), k("τηλεφωνω"), "different stems stay different classes");
        assert_ne!(k("βλεπω"), k("τηλεφωνω"), "same ending class, different stems: βλεπ- and τηλεφων- stay apart");
        assert_eq!(k("καλημερα"), "καλημερα", "a lemma outside any class is its own key");
    }

    #[test]
    fn variant_merge_never_chains() {
        let classes = variant_classes();
        let rows = ["τηλεφωνώ\tτηλεφωνώ\tV;1;SG;IPRV;PRS", "τηλεφωνάω\tτηλεφωνάω\tV;1;SG;IPRV;PRS",
            "αγαπώ\tαγαπώ\tV;1;SG;IPRV;PRS", "αγαπάω\tαγαπάω\tV;1;SG;IPRV;PRS",
            "καλώ\tκαλώ\tV;1;SG;IPRV;PRS", "καλώ\tκαλείς\tV;2;SG;IPRV;PRS"];
        let mut m = lemma_map(rows.iter().map(|s| s.to_string()));
        variant_merge(&mut m, &classes);
        assert_eq!(m["τηλεφωνω"], m["τηλεφωναω"], "τηλεφωνώ and τηλεφωνάω collapse to one class");
        assert_eq!(m["αγαπω"], m["αγαπαω"], "αγαπώ and αγαπάω collapse to one class");
        assert_eq!(m["καλεισ"], "καλω", "καλώ is not a variant of anything: its forms keep its label (final sigma folds to σ)");
        assert_ne!(m["τηλεφωνω"], m["καλω"], "no chain: different stems never merge");
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
