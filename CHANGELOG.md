# OpenLunum Changelog

## Since 0.2.1 (Documentation Sync)

### Added — Schema (PR #83)
- **Lunum-Sem schema 0.2 frozen:** Locked field names, enum constraints for `modality` and `risk`, `$ref` cross-references between `experiment.schema.json`, `protected-eval.schema.json`, and the core Lunum-Sem schema. Migration test validates 0.1→0.2 transformation. See `schemas/CHANGELOG.md` for full breaking-change catalog.
- **Schema changelog:** `schemas/CHANGELOG.md` documenting every breaking change with migration instructions for both `lunum-sem` and `lunum-record`.
- **Schema migration test suite:** 312-line test validating record transformation from 0.1 to 0.2, covering all locked fields and enum constraints.
- **Comprehensive type tests for v02 migration:** 122 lines of semantic-contract type tests covering all migration paths in `packages/core/test/core.test.ts`.
- **Versioned TypeScript types:** `schema-to-ts.cjs` updated to generate `LunumSemSchema01` and `LunumSemSchema02` from versioned schemas.

### Added — Adoption (PR #120, PR #115)
- **HTTP API reference server:** New `packages/api` package with REST endpoints for parse, realize, render, retrieve, and health checks. Includes OpenAPI 3.1.0 spec and integration tests. Third adoption path after MCP and CLI.
- **Standalone CLI pipeline:** `lunum parse | lunum realize | lunum render` pipeline with documented examples for offline, pipeline-friendly, and scriptable adoption.

### Added — Safety & Quality (PR #128, PR #126, PR #116, PR #117)
- **Prompt-injection resistance tests:** 10 adversarial inputs crafted to corrupt Lunum-Sem records through the parser; all must be detected or rejected. Tests in `packages/core/test/prompt-gates.test.ts`.
- **Mixed-context quality gates:** Downstream task accuracy comparison across natural vs Lunum vs mixed context on multiple task types. Structured quality reports with per-mode metrics.
- **Threat model expansion:** Concrete mitigations for each threat in `docs/THREAT-MODEL.md`, including schema validation, type checking, confidence gating, prompt-injection resistance, provenance chain integrity, and parser-hallucination tests.
- **Compatibility matrix:** Schema-package version compatibility testing. Documents which Lunum-Sem schema versions work with which package versions, tested in CI.

### Added — Evaluation (PR #129, PR #118)
- **Nightly experiment runs:** Automated nightly evaluation runs with 28 manifests, producing structured evidence reports.
- **Error observability integration:** Circuit-breaker and revert-capability types wired into the eval runner so experiments auto-halt on repeated failures.

### Added — Protocol (PR #132, PR #130)
- **Native model protocol:** Token mappings, instruction templates, and fallback profiles for native and non-native model families. Types in `packages/core/src/native-model.ts`.
- **Renderer conformance suite:** Property tests verifying round-trip canonicalization for safe, short, and tight profiles against 10 diverse test records. Types in `packages/core/src/renderer-conformance.ts`.
- **Agent-state protocol:** Validated types for plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs. Types in `packages/core/src/agent-state.ts`.

### Fixed — Schema (PR #134)
- **Nested config schemas:** Added `additionalProperties: false` to prevent unexpected fields in nested config objects across experiment and protected-eval schemas.

### Changed — Renderer (PR #114)
- **Tokenizer optimization pass:** Model-specific tight profiles that provably do not change semantics. Per-model best profile selection via Token Atlas measurements.

### Added — Schema Migration (PR #144)
- **Bidirectional migration (0.1 ↔ 0.2) with schema validation:** `migrateForward01to02()` and `migrateBackward02to01()` validate source and destination schemas, emit field-level warnings for data loss (e.g., modality locked to enum, provenance field set, annotations field set), regenerate fingerprints at the target version, and preserve input order. `migrateRecordsForward()` and `migrateRecordsBackward()` batch the operations. `roundTripMigration()` verifies 0.1→0.2→0.1 round-trips with explicit loss warnings. Types in `packages/core/src/fingerprint-migration.ts`. 190 lines of tests in `packages/core/test/fingerprint-migration.test.ts`.

### Added — Near-Semantic Fingerprints (PR #137, PR #136)
- **Near-semantic fingerprint implementation:** Feature extraction, configurable similarity threshold, nfp:* fingerprint format, similarity comparison with threshold-based matching. Types in `packages/core/src/near-semantic-fingerprints.ts`.
- **Near-semantic + exact fingerprint interop:** Records carry both exact (lfp:) and near-semantic (nfp:) fingerprints; hybrid search tries exact match first, then falls back to near-semantic. 13 new tests in `packages/core/test/near-semantic-exact-interop.test.ts`.
- **Near-semantic retrieval tests:** Identical-record fingerprint stability, near-match similarity within threshold, unrelated-record low similarity, recall comparison vs exact fingerprint, false-positive rate measurement, threshold adjustment effects on precision-recall, fingerprint stability across multiple generations. Tests in `packages/core/test/near-semantic-retrieval.test.ts`.

### Added — Infra (ffc633f)
- **Local orchestrator:** `scripts/pi-orchestrator.sh` with 3h systemd timer for flag checks, loop health, STUCK auto-fix, stale PR detection, throughput tracking, and NEEDS_CLOUD escalation. Timer enabled as `openlunum-orchestrator.timer`.
- **Orchestrator handover doc:** `ORCHESTRATOR.md` with 5-layer stack architecture (orchestrator, watchdog, local orchestrator, reviewer, worker, merge bot), key paths, hardware profile, worker loop description, and ops runbook enabling any LLM to take over as orchestrator.

### Added — Quality Gate CI (0a23ae4)
- **Quality gate CI integration:** Unified quality gate CI runner wrapping downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, and prompt-gates into a single runnable suite for CI. Exit codes: 0=pass, 1=warn, 2=fail. Configurable gates with `minimumPassRate` and `strictMode` support. Types in `packages/core/src/quality-gate-ci.ts`. Tests in `packages/core/test/quality-gate-ci.test.ts`. CI workflow at `.github/workflows/quality-gate.yml` runs on PRs touching `packages/core/src/` or `packages/eval/src/`. Implements release gate 5 (quality gate CI integration).

### Changed — Schema (PR #146)
- **JSON Schema $ref cross-references v2 redesign:** Restructured `$ref` cross-references between experiment.schema.json, protected-eval.schema.json, and the core Lunum-Sem schema. Added `schemas/shared.schema.json` for shared definitions. Updated `schemas/lunum-sem-v02.schema.json` with v2 reference graph. Test suite in `packages/eval/test/schema-crossrefs.test.ts` validates the cross-reference graph.

---

## Since 0.2.0

### Added — Evidence & Hardening (PR #50, #61, #62, #51, #66, #52, #55, #57)
- **Parse experiments:** EN/EL/ES/ID runs against local models via eval runner with per-language metrics.
- **Realization experiments:** EN/EL/ES/ID runs with protected-literal scoring.
- **Token Atlas:** Cross-model token measurement with at least 3 named local models.
- **Fingerprint migration:** Code-level utilities with version detection, migration, and golden vectors.
- **CI conformance gates:** Property tests wired into CI for idempotence, key-order independence, fingerprint stability.
- **MCP server hardening:** Error contracts, input validation, conformance test suite.
- **OpenUnum shadow-mode:** Live integration test against real product runtime.
- **Renderer profile selection:** Per-model best profile driven by Token Atlas measurements.
- **API stability tests:** Snapshot-based tests for `packages/core` public exports to detect breaking changes.
- **OpenUnum adapter e2e conformance:** End-to-end verification against real product runtime.

---

## Since 0.2.0 (Initial Release)

### Added — Core Features
- **Lunum-Sem:** Language-neutral structured meaning representation
- **Fingerprinting:** Deterministic retrieval and deduplication identities
- **Renderer profiles:** Tokenizer-aware compact rendering options
- **Multilingual support:** English, Greek, Spanish, Indonesian

### Changed — Architecture
- **Separation of concerns:** Meaning from model-facing rendering
- **Versioned schemas:** Explicit versioned schema identifiers
- **Protected literals:** Natural source text preservation

---

## Since 0.1.0 (Initial Development)

### Added — Research Foundation
- **Lunum-1:** Initial language experiment
- **Archival benchmark:** ~5.78x expansion study
- **Shadow implementation:** Reduced implementation in OpenUnum
- **Independent ownership:** OpenLunum restores correct ownership boundary
