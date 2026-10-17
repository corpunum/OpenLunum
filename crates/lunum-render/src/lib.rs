//! Exact Rust port of the Lunum English renderer `generic-en-pivot/0.2`.
//! Parity target: `renderSem(sem, { profile: LOSSLESS_RENDERER })` in packages/core/src/render.ts
//! (which canonicalizes with `canonicalizeSem` first), byte for byte, including its JavaScript quirks.

pub mod collation;
pub mod render;

pub use crate::render::{render_sem, RenderError, RENDERER};
