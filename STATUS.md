# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I (Lunum Interlingua)  
**Workspace version:** 0.2.0  
**Maturity:** pre-1.0 research-to-reference implementation

## Current capabilities

- Core library providing strict TypeScript reference semantics, serialization, and canonicalization.
- CLI tools for inspection, encoding, and compilation.
- MCP (Model Context Protocol) prototype reference server and tooling for services.
- OpenUnum compatibility package matching existing product sidecar shapes.

| Component | Status | Meaning |
|---|---|---|
| Lunum-Sem draft schema | Reference draft | Useful for experimentation; not yet stable |
| Core library | Reference implementation | Strict TypeScript reference for semantics, serialization, and canonicalization |
| CLI tools | Prototype | Inspection, encoding, and compilation command line interfaces |
| MCP reference server | Prototype | Reference implementation of Model Context Protocol tooling |
| OpenUnum adapter | Reference contract | Matches present sidecar shape; live adoption still requires product work |
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
| Context quality measurement | Experiment | Framework and policy datasets exist; downstream quality measurement ongoing |
| Multilingual retrieval | Experiment | False-equivalence tests exist; production retrieval integration pending |
| Conformance reports | Prototype | Hook/plugin/CLI paths documented; live adoption reports generated |
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
