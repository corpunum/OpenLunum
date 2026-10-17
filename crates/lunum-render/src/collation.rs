//! `String.prototype.localeCompare` (ICU root/en collation) as used by the renderer's role tie-break.
//! Weights are exported from Node's ICU by scripts/generate-render-collation.mjs (data/collation.txt, sha256 alongside).

use lunum_sem::value::JStr;
use std::cmp::Ordering;
use std::sync::OnceLock;
use unicode_normalization::UnicodeNormalization;

pub const COLLATION_TXT: &str = include_str!("../data/collation.txt");
pub const COLLATION_SHA256: &str = include_str!("../data/collation.sha256");

struct Row {
    a: u32,
    b: u32,
    p: u32,
    s: u32,
    t: u32,
}

fn table() -> &'static Vec<Row> {
    static T: OnceLock<Vec<Row>> = OnceLock::new();
    T.get_or_init(|| {
        let mut rows = Vec::new();
        for line in COLLATION_TXT.lines() {
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            let mut it = line.split(' ');
            let range = it.next().unwrap();
            let (a, b) = match range.split_once('-') {
                Some((a, b)) => (u32::from_str_radix(a, 16).unwrap(), u32::from_str_radix(b, 16).unwrap()),
                None => {
                    let a = u32::from_str_radix(range, 16).unwrap();
                    (a, a)
                }
            };
            let mut n = || it.next().unwrap().parse::<u32>().unwrap();
            let (p, s, t) = (n(), n(), n());
            rows.push(Row { a, b, p, s, t });
        }
        rows
    })
}

fn weights(cp: u32) -> (u32, u32, u32) {
    let t = table();
    match t.binary_search_by(|r| if cp < r.a { Ordering::Greater } else if cp > r.b { Ordering::Less } else { Ordering::Equal }) {
        Ok(i) => {
            let r = &t[i];
            (if r.p == 0 { 0 } else { r.p + (cp - r.a) }, r.s, r.t)
        }
        Err(_) => (0, 0, 0),
    }
}

/// Collation elements of one code point. ICU expands these ligature letters to their letter pairs with a tertiary difference.
fn elements(cp: u32) -> Vec<(u32, u32, u32)> {
    let pair = match cp {
        0xe6 => Some(('a', 'e')),
        0x153 => Some(('o', 'e')),
        0xdf => Some(('s', 's')),
        _ => None,
    };
    match pair {
        Some((x, y)) => {
            let (mut a, b) = (weights(x as u32), weights(y as u32));
            a.2 += 100;
            vec![a, b]
        }
        None => vec![weights(cp)],
    }
}

fn code_points_nfd(s: &[u16]) -> Vec<u32> {
    let mut out = Vec::new();
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut Vec<u32>| {
        out.extend(run.nfd().map(|c| c as u32));
        run.clear();
    };
    for r in char::decode_utf16(s.iter().copied()) {
        match r {
            Ok(c) => run.push(c),
            Err(e) => {
                flush(&mut run, &mut out);
                out.push(e.unpaired_surrogate() as u32);
            }
        }
    }
    flush(&mut run, &mut out);
    out
}

/// `a.localeCompare(b)` sign.
pub fn locale_compare(a: &JStr, b: &JStr) -> Ordering {
    let (ca, cb) = (code_points_nfd(a), code_points_nfd(b));
    let wa: Vec<_> = ca.iter().flat_map(|&c| elements(c)).collect();
    let wb: Vec<_> = cb.iter().flat_map(|&c| elements(c)).collect();
    let lvl = |w: &Vec<(u32, u32, u32)>, f: fn(&(u32, u32, u32)) -> u32| -> Vec<u32> { w.iter().map(f).filter(|&x| x != 0).collect() };
    for f in [(|w: &(u32, u32, u32)| w.0) as fn(&(u32, u32, u32)) -> u32, |w| w.1, |w| w.2] {
        let o = lvl(&wa, f).cmp(&lvl(&wb, f));
        if o != Ordering::Equal {
            return o;
        }
    }
    Ordering::Equal
}
