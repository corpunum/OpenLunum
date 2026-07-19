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

### Changed — Renderer (PR #114)
- **Tokenizer optimization pass:** Model-specific tight profiles that provably do not change semantics. Per-model best profile selection via Token Atlas measurements.

---

## Since 0.2.1 — Merged Work (7650cc09, 605ae11, ef230af, 2001733)

### Added — Downstream Quality Gates (2001733)
- **Task-success metrics:** Metrics that verify downstream task quality is preserved when using Lunam context vs raw text.
- **Quality gates:** Evaluation gates to ensure semantic retention and downstream quality.
- **Downstream task evaluation:** Verification that Lunum context preserves task completion rates.

### Changed — Evaluation Infrastructure (605ae11)
- **Reconciliation of runners:** Aligned retrieval/integration runners with main branch evaluation protocol.
- **Evaluation suite consistency:** Ensured development suite matches declared evaluation boundaries.

### Changed — Work Queue Documentation (ef230af)
- **Check-off downstream gates:** Documented downstream-quality gate items as completed in work queue.

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
