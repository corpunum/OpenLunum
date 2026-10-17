//! Append-only record store keyed by the Lunum semantic fingerprint (`lfp:2.1`).
//!
//! Many surface forms (sources, languages) can share one semantic identity; the
//! store keeps every record and answers "everything with this identity" quickly.
//!
//! * `put` computes the lfp with `lunum-sem` and rejects any Sem it rejects.
//! * Append-only: there is no update/delete API, and SQLite triggers abort any
//!   `UPDATE`/`DELETE` even from other connections. A repeated
//!   `(lfp, source_id)` is an idempotent no-op (first write wins).
//! * Bounded RAM: page cache is capped (`cache_size`), reads go through `mmap`.

use lunum_sem::{parse_json, semantic_fingerprint};
use rusqlite::{params, Connection, OpenFlags, Row};
use std::fmt;
use std::path::Path;

#[derive(Debug)]
pub enum Error {
    /// The Sem is not valid JSON.
    BadJson(String),
    /// `lunum-sem` rejected the Sem (no identity can be computed).
    RejectedSem(String),
    /// Language tag is not a plausible BCP-47 tag.
    BadLanguage(String),
    Db(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::BadJson(m) => write!(f, "invalid Sem JSON: {m}"),
            Error::RejectedSem(m) => write!(f, "Sem rejected by lunum-sem: {m}"),
            Error::BadLanguage(l) => write!(f, "invalid BCP-47 language tag: {l:?}"),
            Error::Db(e) => write!(f, "database error: {e}"),
        }
    }
}
impl std::error::Error for Error {}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Error::Db(e)
    }
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provenance {
    /// Extractor or model that produced the Sem.
    pub extractor: String,
    /// Unix timestamp, seconds.
    pub timestamp: i64,
    /// Identifier of the source document/segment.
    pub source_id: String,
}

/// A record as supplied by the caller (the lfp is computed, not trusted).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewRecord {
    /// The Sem as JSON text (canonical Sem as given; the lfp is computed from it).
    pub sem: String,
    pub text: String,
    /// BCP-47 language tag.
    pub language: String,
    pub provenance: Provenance,
}

/// A stored record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub lfp: String,
    pub sem: String,
    pub text: String,
    pub language: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PutOutcome {
    pub lfp: String,
    /// false when an identical `(lfp, source_id)` already existed.
    pub inserted: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct BatchOutcome {
    pub inserted: usize,
    pub duplicates: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stats {
    pub records: u64,
    pub distinct_lfps: u64,
    pub db_bytes: u64,
}

#[derive(Debug, Clone)]
pub struct Options {
    /// Page-cache cap in KiB (PRAGMA cache_size = -N). Default 64 MiB.
    pub cache_kib: i64,
    /// mmap window in bytes (PRAGMA mmap_size). Default 256 MiB.
    pub mmap_bytes: i64,
    /// Open read-only (no schema creation, no puts).
    pub read_only: bool,
}
impl Default for Options {
    fn default() -> Self {
        Options { cache_kib: 64 * 1024, mmap_bytes: 256 * 1024 * 1024, read_only: false }
    }
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS records (
  id        INTEGER PRIMARY KEY,
  lfp       TEXT NOT NULL,
  source_id TEXT NOT NULL,
  language  TEXT NOT NULL,
  sem       TEXT NOT NULL,
  text      TEXT NOT NULL,
  extractor TEXT NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS records_lfp_source ON records(lfp, source_id);
CREATE TRIGGER IF NOT EXISTS records_no_update BEFORE UPDATE ON records
  BEGIN SELECT RAISE(ABORT, 'lunum-store is append-only'); END;
CREATE TRIGGER IF NOT EXISTS records_no_delete BEFORE DELETE ON records
  BEGIN SELECT RAISE(ABORT, 'lunum-store is append-only'); END;
";

const COLS: &str = "lfp, sem, text, language, extractor, ts, source_id";
const INSERT: &str = "INSERT OR IGNORE INTO records (lfp, source_id, language, sem, text, extractor, ts) VALUES (?1,?2,?3,?4,?5,?6,?7)";

pub struct Store {
    conn: Connection,
    path: std::path::PathBuf,
}

/// Compute the lfp of a Sem JSON text, mapping failures to store errors.
pub fn lfp_of(sem_json: &str) -> Result<String> {
    let v = parse_json(sem_json).map_err(Error::BadJson)?;
    semantic_fingerprint(&v, None).map_err(|r| Error::RejectedSem(r.0))
}

/// Loose BCP-47 shape check: 1-8 alphanumeric subtags, first alphabetic 2-8 chars (or `x`/`i`).
fn valid_language(tag: &str) -> bool {
    let mut parts = tag.split('-');
    let first = parts.next().unwrap_or("");
    let ok_first = ((2..=8).contains(&first.len()) && first.bytes().all(|b| b.is_ascii_alphabetic()))
        || first.eq_ignore_ascii_case("x")
        || first.eq_ignore_ascii_case("i");
    ok_first && parts.all(|p| (1..=8).contains(&p.len()) && p.bytes().all(|b| b.is_ascii_alphanumeric()))
}

fn row_to_record(r: &Row<'_>) -> rusqlite::Result<Record> {
    Ok(Record {
        lfp: r.get(0)?,
        sem: r.get(1)?,
        text: r.get(2)?,
        language: r.get(3)?,
        provenance: Provenance { extractor: r.get(4)?, timestamp: r.get(5)?, source_id: r.get(6)? },
    })
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Store> {
        Self::open_with(path, &Options::default())
    }

    pub fn open_with(path: impl AsRef<Path>, opts: &Options) -> Result<Store> {
        let path = path.as_ref().to_path_buf();
        let conn = if opts.read_only {
            Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?
        } else {
            Connection::open(&path)?
        };
        conn.pragma_update(None, "cache_size", -opts.cache_kib)?;
        conn.pragma_update(None, "mmap_size", opts.mmap_bytes)?;
        if !opts.read_only {
            // journal_mode returns a row, so read it back rather than "update".
            conn.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
            conn.pragma_update(None, "synchronous", "NORMAL")?;
            conn.execute_batch(SCHEMA)?;
        }
        Ok(Store { conn, path })
    }

    fn validate(rec: &NewRecord) -> Result<String> {
        if !valid_language(&rec.language) {
            return Err(Error::BadLanguage(rec.language.clone()));
        }
        lfp_of(&rec.sem)
    }

    /// Insert one record. Idempotent per `(lfp, source_id)`.
    pub fn put(&self, rec: NewRecord) -> Result<PutOutcome> {
        let lfp = Self::validate(&rec)?;
        let n = self.conn.prepare_cached(INSERT)?.execute(params![
            lfp,
            rec.provenance.source_id,
            rec.language,
            rec.sem,
            rec.text,
            rec.provenance.extractor,
            rec.provenance.timestamp
        ])?;
        Ok(PutOutcome { lfp, inserted: n == 1 })
    }

    /// Insert many records in one transaction. All records are validated first;
    /// if any is rejected nothing is written.
    pub fn put_batch(&mut self, recs: impl IntoIterator<Item = NewRecord>) -> Result<BatchOutcome> {
        let mut prepared = Vec::new();
        for r in recs {
            let lfp = Self::validate(&r)?;
            prepared.push((lfp, r));
        }
        let tx = self.conn.transaction()?;
        let mut out = BatchOutcome::default();
        {
            let mut st = tx.prepare_cached(INSERT)?;
            for (lfp, r) in &prepared {
                let n = st.execute(params![
                    lfp,
                    r.provenance.source_id,
                    r.language,
                    r.sem,
                    r.text,
                    r.provenance.extractor,
                    r.provenance.timestamp
                ])?;
                if n == 1 {
                    out.inserted += 1
                } else {
                    out.duplicates += 1
                }
            }
        }
        tx.commit()?;
        Ok(out)
    }

    /// All records sharing this identity, oldest first.
    pub fn get_by_lfp(&self, lfp: &str) -> Result<Vec<Record>> {
        let mut st = self.conn.prepare_cached(&format!("SELECT {COLS} FROM records WHERE lfp = ?1 ORDER BY id"))?;
        let rows = st.query_map([lfp], row_to_record)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// Stream every record of a language (case-insensitive tag match) in insertion order.
    pub fn for_each_by_language(&self, language: &str, mut f: impl FnMut(Record)) -> Result<()> {
        let mut st = self
            .conn
            .prepare_cached(&format!("SELECT {COLS} FROM records WHERE language = ?1 COLLATE NOCASE ORDER BY id"))?;
        let mut rows = st.query([language])?;
        while let Some(r) = rows.next()? {
            f(row_to_record(r)?);
        }
        Ok(())
    }

    /// Collect every record of a language. Prefer `for_each_by_language` for big sets.
    pub fn scan_language(&self, language: &str) -> Result<Vec<Record>> {
        let mut v = Vec::new();
        self.for_each_by_language(language, |r| v.push(r))?;
        Ok(v)
    }

    /// Stream every record in insertion order.
    pub fn for_each(&self, mut f: impl FnMut(Record)) -> Result<()> {
        let mut st = self.conn.prepare_cached(&format!("SELECT {COLS} FROM records ORDER BY id"))?;
        let mut rows = st.query([])?;
        while let Some(r) = rows.next()? {
            f(row_to_record(r)?);
        }
        Ok(())
    }

    pub fn count(&self) -> Result<u64> {
        Ok(self.conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get::<_, i64>(0))? as u64)
    }

    /// Distinct identities (index-only scan).
    pub fn count_lfps(&self) -> Result<u64> {
        Ok(self.conn.query_row("SELECT COUNT(DISTINCT lfp) FROM records", [], |r| r.get::<_, i64>(0))? as u64)
    }

    /// Main DB file size plus WAL.
    pub fn db_bytes(&self) -> u64 {
        let size = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        let mut wal = self.path.clone().into_os_string();
        wal.push("-wal");
        size(&self.path) + size(Path::new(&wal))
    }

    pub fn stats(&self) -> Result<Stats> {
        Ok(Stats { records: self.count()?, distinct_lfps: self.count_lfps()?, db_bytes: self.db_bytes() })
    }

    /// Fold the WAL back into the main file.
    pub fn checkpoint(&self) -> Result<()> {
        self.conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))?;
        Ok(())
    }
}
