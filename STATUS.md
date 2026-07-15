# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I (Lunum Interlingua)  
**Workspace version:** 0.1.0  
**Maturity:** pre-1.0 research-to-reference implementation

## Current capabilities

- Canonicalizes validated structured Lunum-Sem records deterministically.
- Produces versioned SHA-256 semantic fingerprints (`lfp:`).
- Renders conservative familiar-token Lunum-Code from structured semantics.
- Preserves Unicode in raw-text inspection and uses a separate non-semantic surface fingerprint (`lsf:`).
- Compiles natural, full-Lunum, mixed, and shadow-mixed context from annotated records.
- Falls back to natural text for unvalidated, ambiguous, or elevated-risk content.
- Exposes an OpenUnum-compatible sidecar shape and contract tests.
- Preserves the complete initial research handover and machine-readable metric history.
- Documents multiple product-adoption modes without claiming unverified support.

## Current maturity by component

| Component | Status | Meaning |
|---|---|---|
| Lunum-Sem draft schema | Reference draft | Useful for experimentation; not yet stable |
| Canonical serialization | Reference implementation | Deterministic within schema version |
| Exact semantic fingerprint | Reference implementation | Versioned exact identity, not fuzzy equivalence |
| Reference renderer | Prototype | Conservative and testable; not tokenizer-optimized |
| Mixed-context compiler | Prototype | Policy skeleton with natural fallback |
| Raw multilingual parser | Not implemented | Raw text is not promoted to canonical semantics |
| Tokenizer profile selection | Planned | Historical evidence exists; current automation does not |
| OpenUnum adapter | Reference contract | Matches present sidecar shape; live adoption still requires product work |
| Other product profiles | Design | Based on documented extension surfaces, not verified runtime support |
| Public package stability | Not stable | APIs may change before 1.0 |

## Release gates before 1.0

1. Stable semantic schema and canonical serialization specification.
2. Migration rules for records and fingerprints across schema versions.
3. Multilingual semantic-retention evaluation on named corpora.
4. Tokenizer-aware renderer profiles with reproducible measurements.
5. Safety and quality gates for mixed-context use.
6. At least three independently verified adoption paths.
7. Published threat model, rollback process, and compatibility matrix.

## Honest boundary

OpenLunum has an architecture, a reference core, preserved evidence, and adoption contracts. It does not yet provide a general language-agnostic natural-language parser, universal compression, or production proof across arbitrary models and products.
