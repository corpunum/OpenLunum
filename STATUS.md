# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I (Lunum Interlingua)  
**Workspace version:** 0.2.0  
**Maturity:** pre-1.0 research-to-reference implementation

## Current capabilities

- Canonicalizes validated structured Lunum-Sem records deterministically.
- Produces versioned SHA-256 semantic fingerprints (`lfp:`) and near-semantic fingerprint design.
- Renders conservative familiar-token Lunum-Code from structured semantics.
- Provides safe, short, and tight renderer profiles without changing semantics.
- Measures token counts via generic-en-pivot/0.1 framework and llama.cpp-compatible counting.
- Applies full-prompt quality gates for local-model evaluation.
- Preserves Unicode in raw-text inspection and uses a separate non-semantic surface fingerprint (`lsf:`).
- Compiles natural, full-Lunum, mixed, and shadow-mixed context from annotated records.
- Falls back to natural text for unvalidated, ambiguous, or elevated-risk content.
- Expands typed structures: time, quantity, uncertainty, reference, and modality.
- Generates canonical conformance vectors and property tests.
- Realizes Lunum-Sem to English, Greek, Spanish, and Indonesian with protected-literal and independent semantic scoring.
- Provides abstention/clarification outputs for low-confidence parses.
- Measures context quality and evaluates multilingual retrieval with false-equivalence tests.
- Exposes an MCP (Model Context Protocol) reference server with parse, realize, fingerprint, retrieve, and validate tools.
- Produces conformance reports for hook/plugin/CLI integration paths.
- Exposes a typed OpenUnum-compatible package and contract tests.
- Preserves the complete initial research handover and machine-readable metric history.
- Documents multiple product-adoption modes without claiming unverified support.
- Provides bounded local OpenAI-compatible parse/realization experiments with dataset hashes, raw failures, and generated reports.
- Provides a worker/evaluator/orchestrator operating model for autonomous local agents.
- Maintains architecture decision records in `docs/decisions/`.

## Current maturity by component

| Component | Status | Meaning |
|---|---|---|
| Lunum-Sem draft schema | Reference draft | Useful for experimentation; not yet stable |
| Canonical serialization | Reference implementation | Deterministic within schema version |
| Exact semantic fingerprint | Reference implementation | Versioned exact identity, not fuzzy equivalence |
| Near-semantic fingerprint | Design | Separately designed from exact identity; not yet implemented |
| Reference renderer | Prototype | Conservative and testable; not tokenizer-optimized |
| Renderer profiles (safe/short/tight) | Experiment | Measured without changing semantics; not production-proven |
| Tokenizer measurement framework | Experiment | Framework exists; exact target-machine adapters remain work |
| Mixed-context compiler | Prototype | Policy skeleton with natural fallback |
| Raw multilingual parser | Experiment harness | Local models can be evaluated; no production parser is approved |
| Multilingual realization | Experiment | English, Greek, Spanish, Indonesian; protected-literal scoring verified |
| Abstention/clarification | Experiment | Available for low-confidence parses; threshold tuning needed |
| Expanded typed structures | Reference implementation | Time, quantity, uncertainty, reference, modality implemented |
| Canonical conformance vectors | Reference implementation | Property tests pass; not yet gate on all merges |
| Tokenizer profile selection | Experiment | Measurement framework exists; target adapters in progress |
| MCP reference server | Prototype | Reference implementation with parse/realize/fingerprint/retrieve/validate |
| Context quality measurement | Experiment | Framework and policy datasets exist; downstream quality measurement ongoing |
| Multilingual retrieval | Experiment | False-equivalence tests exist; production retrieval integration pending |
| Conformance reports | Prototype | Hook/plugin/CLI paths documented; live adoption reports generated |
| OpenUnum adapter | Typed reference contract | Matches present sidecar shape; live adoption still requires product work |
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
