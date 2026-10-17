use lunum_store::{Error, NewRecord, Options, Provenance, Store};
use std::time::Instant;

fn sem(id: &str) -> String {
    format!(
        r#"{{"schema":"lunum-sem/0.1-draft","world":"real","kind":"command","clauses":[{{"predicate":"delete","roles":{{"agent":{{"type":"actor","id":"assistant"}},"theme":{{"type":"collection","id":"{id}"}}}},"negated":false}}]}}"#
    )
}

fn rec(id: &str, lang: &str, src: &str, text: &str) -> NewRecord {
    NewRecord {
        sem: sem(id),
        text: text.into(),
        language: lang.into(),
        provenance: Provenance { extractor: "test-model".into(), timestamp: 1_760_000_000, source_id: src.into() },
    }
}

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("lunum-store-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d.join("s.db")
}

#[test]
fn round_trip() {
    let st = Store::open(tmp("rt")).unwrap();
    let r = rec("old_user_records", "en", "doc1", "delete the old user records");
    let out = st.put(r.clone()).unwrap();
    assert!(out.inserted && out.lfp.starts_with("lfp:"));
    let got = st.get_by_lfp(&out.lfp).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].text, r.text);
    assert_eq!(got[0].sem, r.sem);
    assert_eq!(got[0].language, "en");
    assert_eq!(got[0].provenance, r.provenance);
    assert_eq!(got[0].lfp, out.lfp);
    assert!(st.get_by_lfp("lfp:nope").unwrap().is_empty());
}

#[test]
fn languages_share_identity() {
    let mut st = Store::open(tmp("lang")).unwrap();
    st.put_batch(vec![
        rec("x1", "en", "a", "delete x1"),
        rec("x1", "el", "b", "διέγραψε x1"),
        rec("x2", "en", "c", "delete x2"),
    ])
    .unwrap();
    let lfp = lunum_store::lfp_of(&sem("x1")).unwrap();
    let got = st.get_by_lfp(&lfp).unwrap();
    assert_eq!(got.len(), 2);
    let mut langs: Vec<_> = got.iter().map(|r| r.language.as_str()).collect();
    langs.sort();
    assert_eq!(langs, ["el", "en"]);
    assert_eq!(st.count().unwrap(), 3);
    assert_eq!(st.count_lfps().unwrap(), 2);
    assert_eq!(st.scan_language("en").unwrap().len(), 2);
    assert_eq!(st.scan_language("el").unwrap().len(), 1);
    assert_eq!(st.scan_language("fr").unwrap().len(), 0);
}

#[test]
fn rejected_sem_errors() {
    let st = Store::open(tmp("rej")).unwrap();
    let mut bad = rec("x", "en", "a", "t");
    bad.sem = r#"{"schema":"lunum-sem/0.1-draft","world":"real","kind":"command","clauses":[]}"#.into();
    assert!(matches!(st.put(bad), Err(Error::RejectedSem(_))));
    let mut junk = rec("x", "en", "a", "t");
    junk.sem = "not json".into();
    assert!(matches!(st.put(junk), Err(Error::BadJson(_))));
    assert!(matches!(st.put(rec("x", "not a tag!", "a", "t")), Err(Error::BadLanguage(_))));
    assert_eq!(st.count().unwrap(), 0);
}

#[test]
fn batch_is_atomic_on_rejection() {
    let mut st = Store::open(tmp("atomic")).unwrap();
    let mut bad = rec("y", "en", "b", "t");
    bad.sem = "{}".into();
    assert!(st.put_batch(vec![rec("y", "en", "a", "t"), bad]).is_err());
    assert_eq!(st.count().unwrap(), 0);
}

#[test]
fn duplicates_are_idempotent_and_append_only() {
    let path = tmp("dup");
    let mut st = Store::open(&path).unwrap();
    assert!(st.put(rec("z", "en", "s1", "first")).unwrap().inserted);
    let again = st.put(rec("z", "en", "s1", "second")).unwrap();
    assert!(!again.inserted);
    let b = st.put_batch(vec![rec("z", "en", "s1", "third"), rec("z", "de", "s2", "vierte")]).unwrap();
    assert_eq!((b.inserted, b.duplicates), (1, 1));
    assert_eq!(st.count().unwrap(), 2);
    assert_eq!(st.get_by_lfp(&again.lfp).unwrap()[0].text, "first");
    // Triggers block mutation even from a raw connection.
    drop(st);
    let raw = rusqlite::Connection::open(&path).unwrap();
    assert!(raw.execute("UPDATE records SET text='x'", []).is_err());
    assert!(raw.execute("DELETE FROM records", []).is_err());
    drop(raw);
    // Persisted across reopen.
    assert_eq!(Store::open(&path).unwrap().count().unwrap(), 2);
}

fn pct(v: &[u128], p: f64) -> u128 {
    v[((v.len() as f64 - 1.0) * p).round() as usize]
}

/// 1M synthetic records (2.5 per identity, 5 languages). Run:
/// nice -n 10 cargo test -j 4 --release -- --ignored --nocapture
#[test]
#[ignore]
fn bench_1m() {
    const N: usize = 1_000_000;
    const IDENTITIES: usize = 400_000;
    let langs = ["en", "el", "de", "fr", "es"];
    let path = tmp("bench");
    let opts = Options::default();
    let mut st = Store::open_with(&path, &opts).unwrap();
    let t = Instant::now();
    let mut i = 0;
    while i < N {
        let end = (i + 20_000).min(N);
        let batch: Vec<NewRecord> = (i..end)
            .map(|n| {
                let ident = n % IDENTITIES;
                let lang = langs[n % 5];
                rec(&format!("obj_{ident}"), lang, &format!("src{n}"), &format!("synthetic surface form {n} of identity {ident} in {lang}"))
            })
            .collect();
        st.put_batch(batch).unwrap();
        i = end;
    }
    st.checkpoint().unwrap();
    let load = t.elapsed();
    let stats = st.stats().unwrap();
    assert_eq!(stats.records, N as u64);
    assert_eq!(stats.distinct_lfps, IDENTITIES as u64);

    // 100k pseudo-random identities; precompute lfps so only the lookup is timed.
    let mut x: u64 = 0x9E3779B97F4A7C15;
    let lfps: Vec<String> = (0..100_000)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            lunum_store::lfp_of(&sem(&format!("obj_{}", x as usize % IDENTITIES))).unwrap()
        })
        .collect();
    drop(st);
    let st = Store::open_with(&path, &opts).unwrap(); // reopen: fresh page cache
    let mut lat = Vec::with_capacity(lfps.len());
    let mut rows = 0;
    for l in &lfps {
        let t = Instant::now();
        let r = st.get_by_lfp(l).unwrap();
        lat.push(t.elapsed().as_nanos());
        assert!(!r.is_empty());
        rows += r.len();
    }
    lat.sort();
    println!(
        "BENCH records={} identities={} load={:.1}s ({:.0} rec/s) db={:.1} MiB get_by_lfp p50={:.1}us p99={:.1}us max={:.1}us avg_rows={:.2}",
        stats.records,
        stats.distinct_lfps,
        load.as_secs_f64(),
        N as f64 / load.as_secs_f64(),
        stats.db_bytes as f64 / 1048576.0,
        pct(&lat, 0.5) as f64 / 1e3,
        pct(&lat, 0.99) as f64 / 1e3,
        *lat.last().unwrap() as f64 / 1e3,
        rows as f64 / lfps.len() as f64
    );
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}
