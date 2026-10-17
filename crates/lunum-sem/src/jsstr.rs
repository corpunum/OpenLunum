//! JavaScript string/number semantics needed for byte-exact parity:
//! UTF-16 strings, `String.prototype.trim` / `/\s+/u` whitespace, NFKC,
//! `toLocaleLowerCase('und')`, `Number.prototype.toString`, `JSON.stringify`.

use crate::unicode_tables::{LETTER_NUMBER_RANGES, LOWER, NFKC_SINGLE};
use crate::value::{JStr, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use unicode_normalization::UnicodeNormalization;

/// WhiteSpace + LineTerminator as used by `trim()` and `\s` (includes U+FEFF, excludes U+0085 and U+180E).
pub fn is_js_ws(u: u16) -> bool {
    matches!(u, 9..=13 | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}

pub fn trim(s: &[u16]) -> JStr {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_js_ws(s[a]) {
        a += 1;
    }
    while b > a && is_js_ws(s[b - 1]) {
        b -= 1;
    }
    s[a..b].to_vec()
}

/// `s.replace(/\s+/gu, repl)`.
pub fn replace_ws_runs(s: &[u16], repl: u16) -> JStr {
    let mut out = Vec::with_capacity(s.len());
    let mut in_run = false;
    for &u in s {
        if is_js_ws(u) {
            if !in_run {
                out.push(repl);
                in_run = true;
            }
        } else {
            in_run = false;
            out.push(u);
        }
    }
    out
}

/// Apply `f` to maximal runs of well-formed text; lone surrogates pass through unchanged and break context.
fn map_segments(s: &[u16], f: impl Fn(&str) -> String) -> JStr {
    let mut out: JStr = Vec::with_capacity(s.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut JStr| {
        if !run.is_empty() {
            out.extend(f(run).encode_utf16());
            run.clear();
        }
    };
    for r in char::decode_utf16(s.iter().copied()) {
        match r {
            Ok(c) => run.push(c),
            Err(e) => {
                flush(&mut run, &mut out);
                out.push(e.unpaired_surrogate());
            }
        }
    }
    flush(&mut run, &mut out);
    out
}

fn nfkc_overrides() -> &'static HashMap<char, String> {
    static M: OnceLock<HashMap<char, String>> = OnceLock::new();
    M.get_or_init(|| {
        let mut m = HashMap::new();
        for (cp, seq) in NFKC_SINGLE {
            let c = char::from_u32(*cp).unwrap();
            let want: String = seq.iter().map(|x| char::from_u32(*x).unwrap()).collect();
            let have: String = std::iter::once(c).nfkc().collect();
            if have != want {
                m.insert(c, want);
            }
        }
        m
    })
}

fn lower_overrides() -> &'static HashMap<char, String> {
    static M: OnceLock<HashMap<char, String>> = OnceLock::new();
    M.get_or_init(|| {
        let mut m = HashMap::new();
        for (cp, seq) in LOWER {
            let c = char::from_u32(*cp).unwrap();
            let want: String = seq.iter().map(|x| char::from_u32(*x).unwrap()).collect();
            if c.to_string().to_lowercase() != want {
                m.insert(c, want);
            }
        }
        m
    })
}

/// Code points whose NFKC / lowercase in this Rust toolchain differ from Node's tables (patched at runtime).
pub fn unicode_patch_counts() -> (usize, usize) {
    (nfkc_overrides().len(), lower_overrides().len())
}

fn nfkc_str(s: &str) -> String {
    let ov = nfkc_overrides();
    if ov.is_empty() || !s.chars().any(|c| ov.contains_key(&c)) {
        return s.nfkc().collect();
    }
    let pre: String = s.chars().map(|c| ov.get(&c).cloned().unwrap_or_else(|| c.to_string())).collect();
    pre.nfkc().collect()
}

fn lower_str(s: &str) -> String {
    let ov = lower_overrides();
    if ov.is_empty() || !s.chars().any(|c| ov.contains_key(&c)) {
        return s.to_lowercase();
    }
    // Context (final sigma) is cut at patched characters: they are newly assigned letters, not sigma neighbours in practice.
    let mut out = String::new();
    let mut run = String::new();
    for c in s.chars() {
        if let Some(r) = ov.get(&c) {
            out.push_str(&run.to_lowercase());
            run.clear();
            out.push_str(r);
        } else {
            run.push(c);
        }
    }
    out.push_str(&run.to_lowercase());
    out
}

/// `s.normalize('NFKC')`
pub fn nfkc(s: &[u16]) -> JStr {
    map_segments(s, nfkc_str)
}

/// `s.toLocaleLowerCase('und')`
pub fn lower(s: &[u16]) -> JStr {
    map_segments(s, lower_str)
}

/// `value.normalize('NFKC').trim().replace(/\s+/gu, '_').toLocaleLowerCase('und')`
pub fn basic_identifier(s: &[u16]) -> JStr {
    lower(&replace_ws_runs(&trim(&nfkc(s)), b'_' as u16))
}

/// `value.normalize('NFKC').trim().replace(/\s+/gu, ' ')`
pub fn normalize_text_str(s: &[u16]) -> JStr {
    replace_ws_runs(&trim(&nfkc(s)), b' ' as u16)
}

/// Number::toString(10) for a finite or non-finite f64.
pub fn number_to_string(v: f64) -> String {
    if v.is_nan() {
        return "NaN".into();
    }
    if v == 0.0 {
        return "0".into();
    }
    if v.is_infinite() {
        return if v > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    let neg = v < 0.0;
    let e = format!("{:e}", v.abs()); // shortest round-trip digits, e.g. "1.2345e-7"
    let (mant, exp) = e.split_once('e').unwrap();
    let exp: i32 = exp.parse().unwrap();
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp + 1;
    let mut out = String::new();
    if neg {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.extend(std::iter::repeat('0').take((n - k) as usize));
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.extend(std::iter::repeat('0').take((-n) as usize));
        out.push_str(&digits);
    } else {
        let e = n - 1;
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if e < 0 { '-' } else { '+' });
        out.push_str(&e.abs().to_string());
    }
    out
}

/// `String(value)` for a JSON-derived value (caller applies any `?? ''` first).
pub fn to_js_string(v: &Value) -> JStr {
    match v {
        Value::Null => crate::value::js("null"),
        Value::Bool(b) => crate::value::js(if *b { "true" } else { "false" }),
        Value::Num(n) => crate::value::js(&number_to_string(*n)),
        Value::Str(s) => s.clone(),
        Value::Obj(_) => crate::value::js("[object Object]"),
        Value::Arr(items) => {
            let mut out: JStr = Vec::new();
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',' as u16);
                }
                if !matches!(it, Value::Null) {
                    out.extend(to_js_string(it));
                }
            }
            out
        }
    }
}

/// `String(value ?? '')`
pub fn to_js_string_or_empty(v: Option<&Value>) -> JStr {
    match v {
        None | Some(Value::Null) => Vec::new(),
        Some(x) => to_js_string(x),
    }
}

pub fn in_letter_number(cp: u32) -> bool {
    LETTER_NUMBER_RANGES
        .binary_search_by(|&(a, b)| {
            if cp < a {
                std::cmp::Ordering::Greater
            } else if cp > b {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

/// `JSON.stringify(string)` (well-formed: lone surrogates become lowercase \udXXX escapes).
pub fn json_quote(s: &[u16], out: &mut String) {
    out.push('"');
    for r in char::decode_utf16(s.iter().copied()) {
        match r {
            Ok(c) => match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\u{8}' => out.push_str("\\b"),
                '\u{9}' => out.push_str("\\t"),
                '\u{a}' => out.push_str("\\n"),
                '\u{c}' => out.push_str("\\f"),
                '\u{d}' => out.push_str("\\r"),
                c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                c => out.push(c),
            },
            Err(e) => out.push_str(&format!("\\u{:04x}", e.unpaired_surrogate())),
        }
    }
    out.push('"');
}

/// `stableStringify` (canonicalize.ts): keys sorted by UTF-16 code units, `JSON.stringify` leaves.
pub fn stable_stringify(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => {
            if n.is_finite() {
                out.push_str(&number_to_string(*n));
            } else {
                out.push_str("null");
            }
        }
        Value::Str(s) => json_quote(s, out),
        Value::Arr(items) => {
            out.push('[');
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                stable_stringify(it, out);
            }
            out.push(']');
        }
        Value::Obj(o) => {
            out.push('{');
            for (i, (k, val)) in o.sorted_entries().into_iter().map(|e| (&e.0, &e.1)).enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json_quote(k, out);
                out.push(':');
                stable_stringify(val, out);
            }
            out.push('}');
        }
    }
}
