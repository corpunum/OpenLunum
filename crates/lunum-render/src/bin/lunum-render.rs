//! `lunum-render`: stdin JSONL -> stdout JSONL renderer CLI (profile generic-en-pivot/0.2 by default;
//! `--profile generic-en-pivot/0.3` adds mood, decisions/0031; an unknown profile exits 2).
//!
//! Input, one JSON object per line: `{"handle": <string>, "sem": <Lunum-Sem>}`.
//! Output, one line per non-blank input line, in order: `{"handle","code"}` on success or
//! `{"handle","error"}` on failure. A line that is not a JSON object with a string `handle`
//! and a `sem` member yields `{"handle":<handle or null>,"error":"malformed: ..."}`; the stream continues.
//! Pure stdin -> stdout, no network, deterministic. Exit 0 once stdin is consumed; 2 on an I/O failure.

use lunum_render::{render_sem_profile, Profile};
use lunum_sem::value::{parse_json, JStr, Value};
use std::io::{BufRead, Write};

/// JSON.stringify string encoding over UTF-16 (lone surrogates as lowercase \udxxx, as JS does).
fn quote(s: &[u16]) -> String {
    let mut o = String::from("\"");
    let mut i = 0;
    while i < s.len() {
        let u = s[i];
        match u {
            0x22 => o.push_str("\\\""),
            0x5c => o.push_str("\\\\"),
            0x08 => o.push_str("\\b"),
            0x0c => o.push_str("\\f"),
            0x0a => o.push_str("\\n"),
            0x0d => o.push_str("\\r"),
            0x09 => o.push_str("\\t"),
            0..=0x1f => o.push_str(&format!("\\u{u:04x}")),
            0xd800..=0xdbff if i + 1 < s.len() && (0xdc00..=0xdfff).contains(&s[i + 1]) => {
                let c = 0x10000 + (((u as u32) - 0xd800) << 10) + (s[i + 1] as u32 - 0xdc00);
                o.push(char::from_u32(c).unwrap());
                i += 1;
            }
            0xd800..=0xdfff => o.push_str(&format!("\\u{u:04x}")),
            _ => o.push(char::from_u32(u as u32).unwrap()),
        }
        i += 1;
    }
    o.push('"');
    o
}

fn line_out(handle: Option<&JStr>, key: &str, val: &[u16]) -> String {
    let h = handle.map_or("null".to_string(), |h| quote(h));
    format!("{{\"handle\":{h},\"{key}\":{}}}", quote(val))
}

fn process(line: &str, profile: Profile) -> String {
    let v = match parse_json(line) {
        Ok(v) => v,
        Err(e) => return line_out(None, "error", &lunum_sem::value::js(&format!("malformed: invalid JSON ({e})"))),
    };
    let obj = match v.as_obj() {
        Some(o) if matches!(v, Value::Obj(_)) => o,
        _ => return line_out(None, "error", &lunum_sem::value::js("malformed: line is not a JSON object")),
    };
    let handle = match obj.get_own("handle") {
        Some(Value::Str(h)) => h,
        _ => return line_out(None, "error", &lunum_sem::value::js("malformed: missing string \"handle\"")),
    };
    let Some(sem) = obj.get_own("sem") else {
        return line_out(Some(handle), "error", &lunum_sem::value::js("malformed: missing \"sem\""));
    };
    match render_sem_profile(sem, profile) {
        Ok(code) => line_out(Some(handle), "code", &code),
        Err(e) => {
            let mut m: JStr = lunum_sem::value::js(&format!("{}: ", e.class));
            m.extend_from_slice(&e.message);
            line_out(Some(handle), "error", &m)
        }
    }
}

fn run(profile: Profile) -> std::io::Result<()> {
    let stdin = std::io::stdin();
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    let mut buf = Vec::new();
    let mut r = stdin.lock();
    loop {
        buf.clear();
        if r.read_until(b'\n', &mut buf)? == 0 {
            break;
        }
        let res = match std::str::from_utf8(&buf) {
            Ok(t) if t.trim().is_empty() => continue,
            Ok(t) => process(t.trim_end_matches(['\n', '\r']), profile),
            Err(_) => line_out(None, "error", &lunum_sem::value::js("malformed: invalid UTF-8")),
        };
        writeln!(out, "{res}")?;
    }
    out.flush()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let profile = match args.as_slice() {
        [] => Profile::V02,
        [flag, name] if flag == "--profile" => match Profile::parse(name) {
            Some(p) => p,
            None => {
                eprintln!("lunum-render: renderer profile not installed: {name}");
                std::process::exit(2);
            }
        },
        _ => {
            eprintln!("usage: lunum-render [--profile generic-en-pivot/0.2|generic-en-pivot/0.3] < in.jsonl > out.jsonl");
            std::process::exit(2);
        }
    };
    if let Err(e) = run(profile) {
        eprintln!("lunum-render: I/O error: {e}");
        std::process::exit(2);
    }
}
