# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I (Lunum Interlingua)  
**Workspace version:** 0.2.0  
**Maturity:** pre-1.0 research-to-reference implementation

## Current capabilities

- Core library providing strict TypeScript reference semantics, serialization, canonicalization, and release provenance.
- CLI tools for inspection, encoding, compilation, release verification, and pipeline adoption.
- HTTP API reference server with OpenAPI spec and integration tests.
- MCP (Model Context Protocol) prototype reference server and tooling for services.
- OpenUnum compatibility package matching existing product sidecar shapes.
- Profile Selection Result type for renderer profile selection.
- Realization runner with protected-literal scoring.
- Token Atlas for cross-model, cross-profile token measurement.
- API stability tests with golden snapshots for `packages/core`.
- OpenUnum adapter end-to-end conformance verification.
- **Aggregate MRR:** Mean Reciprocal Rank for retrieval tasks, computed and validated in summary.json and report.md.
- Prompt-injection resistance tests: 10 adversarial inputs tested against parser.
- Mixed-context quality gates: downstream accuracy comparison across natural vs Lunum vs mixed.
- Threat model with concrete mitigations for injection, hallucination, and ambiguity.
- Compatibility matrix for schema-version and package-version pairs.
- Error observability: circuit-breaker and revert-capability types in eval runner.

| Component | Status | Meaning |
|---|---|---|
| Lunum-Sem draft schema | Reference draft | Useful for experimentation; not yet stable |
| Core library | Reference implementation | Strict TypeScript reference for semantics, serialization, canonicalization, and release provenance |
| CLI tools | Prototype | Inspection, encoding, compilation, release verification, and pipeline adoption interfaces |
| HTTP API reference server | Prototype | REST endpoints with OpenAPI spec; third adoption path |
| MCP reference server | Prototype | Reference implementation of Model Context Protocol tooling |
| OpenUnum adapter | Reference contract | Matches present sidecar shape; live adoption still requires product work |
| Exact semantic fingerprint | Reference implementation | Versioned exact identity, not fuzzy equivalence |
| Near-semantic fingerprint | Design | Separately designed from exact identity; not yet implemented |
| Reference renderer | Prototype | Conservative and testable; not tokenizer-optimized |
| Renderer profiles (safe/short/tight) | Experiment | Measured without changing semantics; not production-proven |
| Tokenizer measurement framework | Reference implementation | Cross-model measurement with Token Atlas; per-model profile selection available |
| Mixed-context compiler | Prototype | Policy skeleton with natural fallback |
| Raw multilingual parser | Experiment harness | Local models can be evaluated; no production parser is approved |
| Multilingual realization | Experiment | English, Greek, Spanish, Indonesian; protected-literal scoring verified |
| Abstention/clarification | Experiment | Available for low-confidence parses; threshold tuning needed |
| Expanded typed structures | Reference implementation | Time, quantity, uncertainty, reference, modality implemented |
| Canonical conformance vectors | Reference implementation | Property tests pass; wired into CI as hard gates |
| Tokenizer profile selection | Reference implementation | Measurement framework with Token Atlas; per-model best profile selection available |
| Context quality measurement | Prototype | Framework and policy datasets exist; mixed-context quality gates implemented |
| Mixed-context quality gates | Prototype | Downstream accuracy comparison across natural vs Lunum vs mixed context |
| Multilingual retrieval | Experiment | False-equivalence tests exist; production retrieval integration pending |
| Conformance reports | Prototype | Hook/plugin/CLI paths documented; live adoption reports generated |
| Profile Selection Result | Reference implementation | Explicit type for renderer profile selection |
| Realization runner | Reference implementation | Protected-literal scoring for multilingual realization |
| Token Atlas | Reference implementation | Cross-model, cross-profile token measurement framework |
| API stability tests | Reference implementation | Snapshot-based tests for `packages/core` public exports |
| OpenUnum adapter e2e conformance | Prototype | End-to-end verification against real product runtime |
| Aggregate MRR | Reference implementation | Mean Reciprocal Rank for retrieval tasks, computed and validated in reports |
| HTTP API reference server | Prototype | REST endpoints with OpenAPI spec; third adoption path |
| Prompt-injection resistance | Prototype | 10 adversarial inputs tested against parser |
| Mixed-context quality gates | Prototype | Downstream accuracy comparison across natural vs Lunum vs mixed |
| Threat model with mitigations | Prototype | Concrete mitigations for injection, hallucination, ambiguity with parser tests |
| Compatibility matrix | Prototype | Schema-version and package-version compatibility testing |
| Error observability | Prototype | Circuit-breaker and revert-capability types in eval runner |

## Release gates before 1.0

1. Stable semantic schema and canonical serialization specification.
2. Migration rules for records and fingerprints across schema versions.
3. Multilingual semantic-retention evaluation on named corpora.
4. Tokenizer-aware renderer profiles with reproducible measurements.
5. Safety and quality gates for mixed-context use.
6. At least three independently verified adoption paths.
7. Published threat model, rollback process, and compatibility matrix.
8. Property tests wired into CI as hard gates.

## Honest boundary

OpenLunum has an architecture, a reference core, preserved evidence, and adoption contracts. It does not yet provide a general language-agnostic natural-language parser, universal compression, or production proof across arbitrary models and products. Token Atlas provides cross-model measurements but per-model profile selection requires per-model testing. CI hard gates exist for conformance but not all merge gates are active.
