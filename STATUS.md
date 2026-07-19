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
- Schema 0.2 frozen with locked fields, enums, and `$ref` cross-references.
- Schema migration test suite (312 lines) validating 0.1→0.2 record transformation with golden vectors.
- Comprehensive semantic-contract type tests for v02 migration (122 lines).
- Error observability: circuit-breaker and revert-capability types in eval runner.
- Native model protocol: token mappings, instruction templates, and fallback profiles for 8 model families.
- Renderer conformance suite: round-trip canonicalization property tests for safe/short/tight profiles.
- Agent-state protocol: validated types for plans, steps, tool calls, evidence, and inter-agent handoffs.
- Near-semantic fingerprint implementation: feature extraction, configurable similarity threshold, nfp:* format, similarity comparison.
- Near-semantic + exact fingerprint interop: records carry both lfp: and nfp:, hybrid search (exact-first, near-fallback).
- Near-semantic retrieval tests: recall vs exact, false-positive rate, fingerprint stability across generations.
- Bidirectional migration (0.1 ↔ 0.2): forward (`migrateForward01to02`) and backward (`migrateBackward02to01`) functions with schema validation, field-level loss warnings, fingerprint regeneration, and input-order preservation. Batch operations (`migrateRecordsForward`, `migrateRecordsBackward`) and round-trip test (`roundTripMigration`) included.
- Local orchestrator: `scripts/pi-orchestrator.sh` with 3h systemd timer for flag checks, loop health, STUCK auto-fix, stale PR detection, throughput tracking, and NEEDS_CLOUD escalation.
- Rollback process: `rollbackToSource()` and `rollbackBatch()` verify integrity/provenance/source-authenticity (verified/failed/absent), fail closed when evidence is absent, verify source/provenance digests rather than trusting the record itself. 10 unit tests. Types in `packages/core/src/rollback-process.ts`.
- Orchestrator handover doc: `ORCHESTRATOR.md` with 6-layer stack architecture (Cloud Orchestrator, Watchdog, Local Orchestrator with LLM diagnosis, Reviewer, Worker, Merge Bot), key paths, hardware profile, escalation path (bash auto-fix → LLM diagnosis → NEEDS_CLOUD → cloud orchestrator → user notification), merge bot `orchestrator-approved` label for hard-protected PRs, and ops runbook for any LLM to take over. `ORCHESTRATOR-PROMPT.md` provides copy-paste handover instructions.
- Quality gate CI integration: unified runner wrapping downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, and prompt-gates; configurable pass rates, exit codes (0=pass, 1=warn, 2=fail), CI workflow on PRs touching core/eval src.
- Retention regression gate: baseline store with provenance (dataset/model/schema), regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), and nightly CI integration. Types in `packages/eval/src/baseline-store.ts`. 11 tests.

| Component | Status | Meaning |
|---|---|---|
| Lunum-Sem schema 0.2 | Frozen | Locked field names, enum constraints, `$ref` cross-references; migration from 0.1 validated |
| Schema migration test suite | Reference implementation | 312-line test validating 0.1→0.2 record transformation with golden vectors |
| Comprehensive type tests for v02 | Reference implementation | 122 lines of semantic-contract type tests covering all migration paths |
| Core library | Reference implementation | Strict TypeScript reference for semantics, serialization, canonicalization, and release provenance |
| CLI tools | Prototype | Inspection, encoding, compilation, release verification, and pipeline adoption interfaces |
| HTTP API reference server | Prototype | REST endpoints with OpenAPI spec; third adoption path |
| MCP reference server | Prototype | Reference implementation of Model Context Protocol tooling |
| OpenUnum adapter | Reference contract | Matches present sidecar shape; live adoption still requires product work |
| Exact semantic fingerprint | Reference implementation | Versioned exact identity, not fuzzy equivalence |
| Near-semantic fingerprint | Prototype | Feature extraction, configurable similarity threshold, nfp:* format; similarity comparison implemented |
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
| Prompt-injection resistance | Prototype | 10 adversarial inputs tested against parser |
| Threat model with mitigations | Prototype | Concrete mitigations for injection, hallucination, ambiguity with parser tests |
| Compatibility matrix | Prototype | Schema-version and package-version compatibility testing |
| Error observability | Prototype | Circuit-breaker and revert-capability types in eval runner |
| Native model protocol | Prototype | Token mappings, instruction templates, and fallback profiles for 8 model families |
| Renderer conformance suite | Reference implementation | Round-trip canonicalization property tests for safe/short/tight profiles |
| Agent-state protocol | Prototype | Validated types for plans, steps, tool calls, evidence, and inter-agent handoffs |
| Near-semantic fingerprint implementation | Prototype | Feature extraction, configurable threshold, nfp:* format, similarity comparison with threshold-based matching |
| Near-semantic retrieval tests | Reference implementation | Recall vs exact, false-positive rate, fingerprint stability across generations |
| Near-semantic + exact fingerprint interop | Prototype | Records carry both lfp: and nfp:, hybrid search exact-first with near-fallback |
| Bidirectional migration (0.1 ↔ 0.2) | Reference implementation | Forward and backward migration with schema validation, field-level loss warnings, fingerprint regeneration, input-order preservation. Round-trip test with explicit loss warnings. 190 lines of tests.
| Local orchestrator | Prototype | `scripts/pi-orchestrator.sh` with 3h timer, flag checks, loop health, STUCK auto-fix, stale PR detection, throughput tracking, NEEDS_CLOUD escalation.
| Orchestrator handover | Reference document | 6-layer stack architecture (Cloud Orchestrator, Watchdog, Local Orchestrator with LLM diagnosis, Reviewer, Worker, Merge Bot), key paths, escalation path (bash → LLM diagnosis → NEEDS_CLOUD → cloud → user), merge bot `orchestrator-approved` label for hard-protected PRs. `ORCHESTRATOR-PROMPT.md` provides copy-paste handover.
| Safety rollback process | Reference implementation | `rollbackToSource()` and `rollbackBatch()` verify integrity/provenance/source-authenticity (verified/failed/absent), fail closed when evidence is absent, verify source/provenance digests. 10 unit tests.
| Quality gate CI integration | Prototype | Unified runner for downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, prompt-gates; configurable pass rates; CI workflow on core/eval PRs.
| Retention regression gate | Reference implementation | Baseline store with provenance (dataset/model/schema), regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), nightly CI workflow. 11 tests in `packages/eval/test/baseline-store.test.ts`.

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

OpenLunum has an architecture, a reference core, preserved evidence, adoption contracts, and a frozen Lunum-Sem 0.2 schema with migration test suite and bidirectional migration (0.1 ↔ 0.2) with schema validation. It does not yet provide a general language-agnostic natural-language parser, universal compression, or production proof across arbitrary models and products. Token Atlas provides cross-model measurements but per-model profile selection requires per-model testing. CI hard gates exist for conformance but not all merge gates are active. Release gates 1 and 2 are substantially addressed by the schema 0.2 freeze, migration test suite, and bidirectional migration with validation; remaining gates require further evidence.
