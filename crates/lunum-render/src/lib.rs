//! Exact Rust port of the Lunum English renderer `generic-en-pivot/0.2`, and of `generic-en-pivot/0.3`
//! (0.2 plus mood from `kind`, decisions/0031).
//! Parity target: `renderSem(sem, { profile: LOSSLESS_RENDERER })` in packages/core/src/render.ts
//! (which canonicalizes with `canonicalizeSem` first), byte for byte, including its JavaScript quirks.

pub mod render;

pub use crate::render::{render_sem, render_sem_profile, Profile, RenderError, MOOD_RENDERER, RENDERER};
