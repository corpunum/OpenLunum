//! Parity against eval-results/golden-vectors/lfp21-golden.json (generated from the built TypeScript).
//! Every entry must match exactly on projection bytes, lfp (default and every length variant), and rejection.

use lunum_sem::jsstr::{number_to_string, unicode_patch_counts};
use lunum_sem::registry::{FRAME_JSON, PROTOCOL_JSON};
use lunum_sem::value::{parse_json, Value};
use lunum_sem::{projection_bytes, semantic_fingerprint};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn sha_hex(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

fn s(v: &Value) -> String {
    String::from_utf16_lossy(v.as_str().expect("string"))
}

#[test]
fn golden_parity() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../eval-results/golden-vectors/lfp21-golden.json");
    let text = std::fs::read_to_string(path).expect("golden file");
    let golden = parse_json(&text).expect("golden json");
    let g = golden.as_obj().unwrap();
    let meta = g.get_own("meta").unwrap().as_obj().unwrap();

    assert_eq!(sha_hex(PROTOCOL_JSON), s(meta.get_own("protocolRegistrySha256").unwrap()), "embedded protocol registry hash");
    assert_eq!(sha_hex(FRAME_JSON), s(meta.get_own("frameRegistrySha256").unwrap()), "embedded frame registry hash");

    // lfp:2.1 = Unicode 17.0 casefold/NFKC: the golden marker, the generated tables and the pin must agree.
    assert_eq!(s(meta.get_own("unicode").unwrap()), "17.0", "golden meta Unicode marker");
    assert_eq!(lunum_sem::unicode_tables::UNICODE_VERSION, "17.0", "generated tables Unicode version");

    let lengths: Vec<(String, f64)> = match meta.get_own("lengths").unwrap() {
        Value::Arr(a) => a.iter().map(|x| if let Value::Num(n) = x { (number_to_string(*n), *n) } else { panic!() }).collect(),
        _ => panic!(),
    };

    let entries = match g.get_own("entries").unwrap() {
        Value::Arr(a) => a,
        _ => panic!(),
    };

    // category -> (pass, fail)
    let mut by_cat: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    let mut failures: Vec<String> = Vec::new();
    let (mut accepted, mut rejected) = (0usize, 0usize);

    for (idx, e) in entries.iter().enumerate() {
        let eo = e.as_obj().unwrap();
        let cat = s(eo.get_own("category").unwrap());
        let input = match eo.get_own("inputRaw") {
            Some(raw) => parse_json(&s(raw)).expect("inputRaw"),
            None => eo.get_own("input").expect("input").clone(),
        };
        let mut problems: Vec<String> = Vec::new();
        let expect_rejected = matches!(eo.get_own("rejected"), Some(Value::Bool(true)));
        if expect_rejected {
            rejected += 1;
            if let Ok(b) = projection_bytes(&input) {
                problems.push(format!("expected rejection, got projection {b}"));
            }
            if semantic_fingerprint(&input, None).is_ok() {
                problems.push("expected rejection, fingerprint accepted".into());
            }
        } else {
            accepted += 1;
            let want_bytes = s(eo.get_own("projectionBytes").unwrap());
            match projection_bytes(&input) {
                Ok(b) if b == want_bytes => {}
                Ok(b) => problems.push(format!("projection differs\n  want {want_bytes}\n  got  {b}")),
                Err(r) => problems.push(format!("unexpected rejection: {}", r.0)),
            }
            let want_lfp = s(eo.get_own("lfp").unwrap());
            match semantic_fingerprint(&input, None) {
                Ok(l) if l == want_lfp => {}
                Ok(l) => problems.push(format!("lfp differs want {want_lfp} got {l}")),
                Err(r) => problems.push(format!("lfp rejected: {}", r.0)),
            }
            let variants = eo.get_own("variants").unwrap().as_obj().unwrap();
            for (label, n) in &lengths {
                let want = s(variants.get_own(label).unwrap());
                match semantic_fingerprint(&input, Some(*n)) {
                    Ok(l) if l == want => {}
                    other => problems.push(format!("length {label}: want {want} got {other:?}")),
                }
            }
        }
        let slot = by_cat.entry(cat.clone()).or_insert((0, 0));
        if problems.is_empty() {
            slot.0 += 1;
        } else {
            slot.1 += 1;
            if failures.len() < 25 {
                failures.push(format!("#{idx} [{cat}] {}\n  input: {}", problems.join("\n  "), format!("{:?}", input).chars().take(400).collect::<String>()));
            }
        }
    }

    let (nfkc_patch, lower_patch) = unicode_patch_counts();
    println!("golden entries: {} (accepted {accepted}, rejected {rejected})", entries.len());
    println!("runtime unicode patches vs Node tables: nfkc={nfkc_patch} lowercase={lower_patch}");
    let (mut p, mut f) = (0, 0);
    for (cat, (pass, fail)) in &by_cat {
        println!("  {cat:<22} pass {pass:>5}  fail {fail:>5}");
        p += pass;
        f += fail;
    }
    println!("TOTAL pass {p} fail {f}");
    assert!(failures.is_empty(), "{f} golden mismatches; first {}:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn number_formatting() {
    for (v, want) in [
        (1.0, "1"), (-0.0, "0"), (1e21, "1e+21"), (1e20, "100000000000000000000"), (1e-6, "0.000001"), (1e-7, "1e-7"),
        (123456789012345680000.0, "123456789012345680000"), (0.1 + 0.2, "0.30000000000000004"), (5e-324, "5e-324"),
        (1.7976931348623157e308, "1.7976931348623157e+308"), (-1.5, "-1.5"), (1.2345e-7, "1.2345e-7"), (2f64.powi(53), "9007199254740992"),
    ] {
        assert_eq!(number_to_string(v), want, "{v:e}");
    }
}
