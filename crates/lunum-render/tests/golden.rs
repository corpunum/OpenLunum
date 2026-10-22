//! Parity against eval-results/golden-vectors/render-en-golden.json (generated from the built TypeScript renderer).
//! Every entry must match exactly: rendered text, or error class (+ message for validation errors).

use lunum_render::{render_sem, render_sem_profile, Profile};
use lunum_sem::value::{parse_json, Value};
use std::collections::BTreeMap;

fn s(v: &Value) -> String {
    String::from_utf16_lossy(v.as_str().expect("string"))
}

#[test]
fn unicode_version_pinned() {
    // world-marker toUpperCase and the lunum-sem tables assume Unicode 17.0 (Node 22.22.2 / ICU 78.2)
    assert_eq!(char::UNICODE_VERSION, (17, 0, 0));
}

#[test]
fn golden_parity() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../eval-results/golden-vectors/render-en-golden.json");
    let golden = parse_json(&std::fs::read_to_string(path).expect("golden file")).expect("golden json");
    let g = golden.as_obj().unwrap();
    let meta = g.get_own("meta").unwrap().as_obj().unwrap();
    assert_eq!(s(meta.get_own("renderer").unwrap()), lunum_render::RENDERER);
    assert_eq!(s(meta.get_own("moodRenderer").unwrap()), lunum_render::MOOD_RENDERER);
    let entries = match g.get_own("entries").unwrap() {
        Value::Arr(a) => a,
        _ => panic!(),
    };
    let mut by_cat: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    let mut failures: Vec<String> = Vec::new();
    for (idx, e) in entries.iter().enumerate() {
        let eo = e.as_obj().unwrap();
        let cat = s(eo.get_own("category").unwrap());
        let input = match eo.get_own("inputRaw") {
            Some(raw) => parse_json(&s(raw)).expect("inputRaw"),
            None => eo.get_own("input").expect("input").clone(),
        };
        let got = render_sem(&input);
        let problem: Option<String> = if matches!(eo.get_own("error"), Some(Value::Bool(true))) {
            let class = s(eo.get_own("errorClass").unwrap());
            match got {
                Ok(r) => Some(format!("expected {class} error, got {:?}", String::from_utf16_lossy(&r))),
                Err(err) if err.class != class => Some(format!("error class want {class} got {}", err.class)),
                Err(err) if class == "validation" => {
                    let want = eo.get_own("reason").unwrap().as_str().unwrap();
                    let mut have = err.message.clone();
                    have.truncate(300);
                    (&have != want).then(|| format!("reason differs\n  want {}\n  got  {}", String::from_utf16_lossy(want), String::from_utf16_lossy(&have)))
                }
                Err(_) => None,
            }
        } else {
            let want = eo.get_own("rendered_en").unwrap().as_str().unwrap();
            match got {
                Ok(r) if &r == want => None,
                Ok(r) => Some(format!("render differs\n  want {:?}\n  got  {:?}", String::from_utf16_lossy(want), String::from_utf16_lossy(&r))),
                Err(err) => Some(format!("unexpected {} error: {}", err.class, String::from_utf16_lossy(&err.message))),
            }
        };
        // generic-en-pivot/0.3 (mood): `rendered_en_mood` when it differs from 0.2, else the 0.2 text; errors are the same.
        let mood = render_sem_profile(&input, Profile::V03);
        let problem = problem.or_else(|| {
            if matches!(eo.get_own("error"), Some(Value::Bool(true))) {
                let class = s(eo.get_own("errorClass").unwrap());
                return match mood {
                    Ok(r) => Some(format!("0.3: expected {class} error, got {:?}", String::from_utf16_lossy(&r))),
                    Err(err) if err.class != class => Some(format!("0.3: error class want {class} got {}", err.class)),
                    Err(_) => None,
                };
            }
            let want = eo.get_own("rendered_en_mood").or_else(|| eo.get_own("rendered_en")).unwrap().as_str().unwrap();
            match mood {
                Ok(r) if &r == want => None,
                Ok(r) => Some(format!("0.3 render differs\n  want {:?}\n  got  {:?}", String::from_utf16_lossy(want), String::from_utf16_lossy(&r))),
                Err(err) => Some(format!("0.3: unexpected {} error: {}", err.class, String::from_utf16_lossy(&err.message))),
            }
        });
        let slot = by_cat.entry(cat.clone()).or_insert((0, 0));
        match problem {
            None => slot.0 += 1,
            Some(p) => {
                slot.1 += 1;
                if failures.len() < 25 {
                    failures.push(format!("#{idx} [{cat}] {p}\n  input: {}", format!("{input:?}").chars().take(300).collect::<String>()));
                }
            }
        }
    }
    println!("golden entries: {}", entries.len());
    let (mut p, mut f) = (0, 0);
    for (cat, (pass, fail)) in &by_cat {
        println!("  {cat:<36} pass {pass:>5}  fail {fail:>5}");
        p += pass;
        f += fail;
    }
    println!("TOTAL pass {p} fail {f}");
    assert!(f == 0, "{f} golden mismatches; first {}:\n{}", failures.len(), failures.join("\n"));
}
