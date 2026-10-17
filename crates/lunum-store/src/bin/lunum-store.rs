//! lunum-store CLI.
//!   lunum-store <db> put [file.jsonl]   (stdin when no file)
//!   lunum-store <db> get <lfp>
//!   lunum-store <db> lang <bcp47>
//!   lunum-store <db> stats
//! JSONL put line: {"sem":{..}|"<json>","text":"..","lang":"en","extractor":"..","timestamp":123,"source_id":".."}

use lunum_store::{NewRecord, Provenance, Record, Store};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};

fn rec_json(r: &Record) -> Value {
    json!({"lfp": r.lfp, "sem": serde_json::from_str::<Value>(&r.sem).unwrap_or(Value::String(r.sem.clone())),
           "text": r.text, "lang": r.language, "extractor": r.provenance.extractor,
           "timestamp": r.provenance.timestamp, "source_id": r.provenance.source_id})
}

fn parse_line(line: &str) -> Result<NewRecord, String> {
    let v: Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string).ok_or(format!("missing string field {k}"));
    let sem = match v.get("sem") {
        Some(Value::String(s)) => s.clone(),
        Some(o) => o.to_string(),
        None => return Err("missing field sem".into()),
    };
    Ok(NewRecord {
        sem,
        text: s("text")?,
        language: s("lang")?,
        provenance: Provenance {
            extractor: s("extractor")?,
            timestamp: v.get("timestamp").and_then(Value::as_i64).unwrap_or(0),
            source_id: s("source_id")?,
        },
    })
}

/// Validate each record individually so one rejected line does not drop the chunk.
fn flush(chunk: &mut Vec<NewRecord>, store: &mut Store, tally: &mut [usize; 3]) {
    let mut ok = Vec::new();
    for r in chunk.drain(..) {
        match lunum_store::lfp_of(&r.sem) {
            Ok(_) => ok.push(r),
            Err(err) => {
                tally[2] += 1;
                eprintln!("rejected: {err}");
            }
        }
    }
    match store.put_batch(ok) {
        Ok(o) => {
            tally[0] += o.inserted;
            tally[1] += o.duplicates;
        }
        Err(err) => {
            tally[2] += 1;
            eprintln!("batch error: {err}");
        }
    }
}

fn run() -> Result<(), String> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 2 {
        return Err("usage: lunum-store <db> put [file] | get <lfp> | lang <tag> | stats".into());
    }
    let e = |x: lunum_store::Error| x.to_string();
    match a[1].as_str() {
        "put" => {
            let mut store = Store::open(&a[0]).map_err(e)?;
            let input: Box<dyn BufRead> = match a.get(2) {
                Some(p) => Box::new(BufReader::new(std::fs::File::open(p).map_err(|x| x.to_string())?)),
                None => Box::new(BufReader::new(std::io::stdin())),
            };
            let mut tally = [0usize; 3]; // inserted, duplicates, rejected
            let mut chunk = Vec::new();
            for line in input.lines() {
                let line = line.map_err(|x| x.to_string())?;
                if line.trim().is_empty() {
                    continue;
                }
                match parse_line(&line) {
                    Ok(r) => chunk.push(r),
                    Err(m) => {
                        tally[2] += 1;
                        eprintln!("bad line: {m}");
                    }
                }
                if chunk.len() >= 10_000 {
                    flush(&mut chunk, &mut store, &mut tally);
                }
            }
            flush(&mut chunk, &mut store, &mut tally);
            println!("{}", json!({"inserted": tally[0], "duplicates": tally[1], "rejected": tally[2]}));
        }
        "get" => {
            let store = Store::open(&a[0]).map_err(e)?;
            let lfp = a.get(2).ok_or("get needs <lfp>")?;
            for r in store.get_by_lfp(lfp).map_err(e)? {
                println!("{}", rec_json(&r));
            }
        }
        "lang" => {
            let store = Store::open(&a[0]).map_err(e)?;
            let l = a.get(2).ok_or("lang needs <tag>")?;
            store.for_each_by_language(l, |r| println!("{}", rec_json(&r))).map_err(e)?;
        }
        "stats" => {
            let s = Store::open(&a[0]).map_err(e)?.stats().map_err(e)?;
            println!("{}", json!({"records": s.records, "distinct_lfps": s.distinct_lfps, "db_bytes": s.db_bytes}));
        }
        other => return Err(format!("unknown command {other}")),
    }
    Ok(())
}

fn main() {
    if let Err(m) = run() {
        eprintln!("{m}");
        std::process::exit(1);
    }
}
