//! Exact Rust reproduction of the Lunum `lfp:2.1` semantic fingerprint.
//! Parity target: `semanticFingerprint` in packages/core/src/fingerprint.ts, byte for byte.

pub mod core;
pub mod jsstr;
pub mod registry;
pub mod unicode_tables;
pub mod value;

pub use crate::core::{projection_bytes, semantic_fingerprint, Reject};
pub use crate::value::{parse_json, Value};
