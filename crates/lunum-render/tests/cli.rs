//! CLI contract: stdin JSONL {"handle","sem"} -> stdout JSONL {"handle","code"} | {"handle","error"}.

use lunum_sem::value::{parse_json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn run(input: &[u8]) -> (String, Option<i32>) {
    let mut c = Command::new(env!("CARGO_BIN_EXE_lunum-render")).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    let mut stdin = c.stdin.take().unwrap();
    let data = input.to_vec();
    let t = std::thread::spawn(move || {
        stdin.write_all(&data).unwrap();
    });
    let o = c.wait_with_output().unwrap();
    t.join().unwrap();
    (String::from_utf8(o.stdout).unwrap(), o.status.code())
}

fn s(v: &Value) -> String {
    String::from_utf16_lossy(v.as_str().expect("string"))
}

#[test]
fn golden_through_cli_is_byte_identical() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../eval-results/golden-vectors/render-en-golden.json");
    let golden = parse_json(&std::fs::read_to_string(path).unwrap()).unwrap();
    let entries = match golden.as_obj().unwrap().get_own("entries").unwrap() {
        Value::Arr(a) => a.clone(),
        _ => panic!(),
    };
    let mut input = String::new();
    for (i, e) in entries.iter().enumerate() {
        let eo = e.as_obj().unwrap();
        // Entries with inputRaw hold the exact JSON text of the sem (including keys JSON.stringify of a Value would reorder).
        let sem = match eo.get_own("inputRaw") {
            Some(raw) => s(raw),
            None => continue_with_input(eo),
        };
        input.push_str(&format!("{{\"handle\":\"g{i}\",\"sem\":{sem}}}\n"));
    }
    let (out, code) = run(input.as_bytes());
    assert_eq!(code, Some(0));
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), entries.len());
    let (mut ok, mut bad) = (0, Vec::new());
    for (i, e) in entries.iter().enumerate() {
        let eo = e.as_obj().unwrap();
        let line = lines[i];
        let pass = if matches!(eo.get_own("error"), Some(Value::Bool(true))) {
            let v = parse_json(line).unwrap();
            let o = v.as_obj().unwrap();
            o.get_own("code").is_none() && s(o.get_own("handle").unwrap()) == format!("g{i}") && s(o.get_own("error").unwrap()).starts_with(&format!("{}: ", s(eo.get_own("errorClass").unwrap())))
        } else {
            let want = s(eo.get_own("rendered_en").unwrap());
            let v = parse_json(line).unwrap();
            let o = v.as_obj().unwrap();
            // byte-identical code, and exactly the two documented keys in order
            s(o.get_own("code").unwrap_or(&Value::Null)) == want && line.starts_with(&format!("{{\"handle\":\"g{i}\",\"code\":"))
        };
        if pass {
            ok += 1
        } else {
            bad.push(i)
        }
    }
    println!("CLI parity {ok}/{}", entries.len());
    assert!(bad.is_empty(), "{} CLI mismatches, first {:?}", bad.len(), &bad[..bad.len().min(10)]);
}

/// Serialize a parsed `input` Value back to JSON text (golden entries without inputRaw use plain JSON values).
fn continue_with_input(eo: &lunum_sem::value::Obj) -> String {
    fn ser(v: &Value) -> String {
        match v {
            Value::Null => "null".into(),
            Value::Bool(b) => b.to_string(),
            Value::Num(n) => if n.fract() == 0.0 && n.abs() < 1e15 { format!("{}", *n as i64) } else { format!("{n}") },
            Value::Str(t) => {
                let mut o = String::from("\"");
                for c in String::from_utf16_lossy(t).chars() {
                    match c {
                        '"' => o.push_str("\\\""),
                        '\\' => o.push_str("\\\\"),
                        c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
                        c => o.push(c),
                    }
                }
                o.push('"');
                o
            }
            Value::Arr(a) => format!("[{}]", a.iter().map(ser).collect::<Vec<_>>().join(",")),
            Value::Obj(o) => format!("{{{}}}", o.entries.iter().map(|(k, v)| format!("{}:{}", ser(&Value::Str(k.clone())), ser(v))).collect::<Vec<_>>().join(",")),
        }
    }
    ser(eo.get_own("input").expect("input"))
}

#[test]
fn malformed_lines_do_not_kill_the_stream() {
    let good = r#"{"handle":"a","sem":{"schema":"lunum-sem/1"}}"#;
    let input = format!("{good}\nnot json\n[1,2]\n{{\"sem\":{{}}}}\n{{\"handle\":\"nosem\"}}\n\n{good}\n");
    let (out, code) = run(input.as_bytes());
    assert_eq!(code, Some(0));
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), 6, "blank line skipped, every other line answered: {out}");
    assert!(lines[0].starts_with(r#"{"handle":"a","#));
    assert!(lines[1].starts_with(r#"{"handle":null,"error":"malformed: invalid JSON"#));
    assert_eq!(lines[2], r#"{"handle":null,"error":"malformed: line is not a JSON object"}"#);
    assert_eq!(lines[3], r#"{"handle":null,"error":"malformed: missing string \"handle\""}"#);
    assert_eq!(lines[4], r#"{"handle":"nosem","error":"malformed: missing \"sem\""}"#);
    assert_eq!(lines[5], lines[0]);
}

#[test]
fn invalid_utf8_line_is_an_error_line() {
    let (out, code) = run(b"\xff\xfe\n");
    assert_eq!(code, Some(0));
    assert_eq!(out, "{\"handle\":null,\"error\":\"malformed: invalid UTF-8\"}\n");
}

#[test]
fn empty_input_gives_empty_output() {
    assert_eq!(run(b""), (String::new(), Some(0)));
    assert_eq!(run(b"\n\n  \n"), (String::new(), Some(0)));
}

#[test]
fn deterministic() {
    let input = r#"{"handle":"x","sem":{"schema":"lunum-sem/1"}}"#.to_string() + "\n";
    assert_eq!(run(input.as_bytes()), run(input.as_bytes()));
}

fn run_args(args: &[&str], input: &[u8]) -> (String, Option<i32>) {
    let mut c = Command::new(env!("CARGO_BIN_EXE_lunum-render")).args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    let _ = c.stdin.take().unwrap().write_all(input); // an early exit (bad flag) closes stdin
    let o = c.wait_with_output().unwrap();
    (String::from_utf8(o.stdout).unwrap(), o.status.code())
}

#[test]
fn profile_flag_selects_mood_renderer() {
    let q = r#"{"handle":"q","sem":{"schema":"lunum-sem/0.1-draft","world":"real","kind":"question","clauses":[{"predicate":"assert","roles":{"subject":"you","action":"sleep"}}]}}"#;
    let i = r#"{"handle":"i","sem":{"schema":"lunum-sem/0.1-draft","world":"real","kind":"instruction","clauses":[{"predicate":"assert","roles":{"action":"stop","object":"looking at me"}}]}}"#;
    let input = format!("{q}\n{i}\n");
    let (out, code) = run_args(&["--profile", "generic-en-pivot/0.3"], input.as_bytes());
    assert_eq!(code, Some(0));
    assert_eq!(out, "{\"handle\":\"q\",\"code\":\"R question: assert(subject=you, action=sleep)?\"}\n{\"handle\":\"i\",\"code\":\"R imperative to you: assert(object=looking at me, action=stop)\"}\n");
    let (out, code) = run_args(&["--profile", "generic-en-pivot/0.2"], input.as_bytes());
    assert_eq!(code, Some(0));
    assert_eq!(out, "{\"handle\":\"q\",\"code\":\"R assert(subject=you, action=sleep)\"}\n{\"handle\":\"i\",\"code\":\"R assert(object=looking at me, action=stop)\"}\n");
    let (out, code) = run_args(&["--profile", "generic-en-pivot/9.9"], input.as_bytes());
    assert_eq!((out.as_str(), code), ("", Some(2)));
    let (_, code) = run_args(&["--bogus"], input.as_bytes());
    assert_eq!(code, Some(2));
}
