# OpenLunum Changelog

## Since 0.2.1 (Documentation Sync)

### Added — Merge Control (PR #188, commits 88017f8, a49fe3f)
- **Merge policy module:** `scripts/pi-merge-policy.mjs` (194 lines) with `evaluateMergePolicy()` implementing fail-closed exact-head policy, draft/conflict/blocking-label/unresolved-review/stale-approval/missing-checks/zero-step gates, `--match-head-commit` merges, required-checks lists with quality-gates gating for core/eval changes. `REQUIRED_CHECKS` exports `verify`, `schema-drift`, `report-validation`, `protected-data-boundary`. Types in `scripts/pi-merge-policy.mjs`. 14 tests in `scripts/pi-merge-policy.test.mjs`. (commit 88017f8)
- **CI_OUTAGE flag:** `scripts/pi-merge-policy.mjs` exports `CI_OUTAGE_FLAG` path (`reports/orchestrator/CI_OUTAGE`); when present, the merge bot skips the hosted-required-checks requirement while still requiring local `pnpm verify` and auto-revert. (commit a49fe3f)
- **Merge loop hardening:** `scripts/pi-merge-loop.sh` updated to enforce exact-head policy, fail-closed on drafts/conflicts/blocking labels, and use `--match-head-commit` for all merges. (commit 88017f8)

### Changed — CLI (PR #174)
- **CLI migrate command enhanced:** `lunum migrate` now uses proper migration utilities from `@corpunum/lunum` (`migrateForward01to02`, `migrateBackward02to01`). Supports `--from 0.1 --to 0.2` (forward) and `--from 0.2 --to 0.1` (backward) migrations. Provides detailed results including schema versions, fingerprints, warnings, and validation status. Supports both single records and arrays of records. Adds `--dry-run` mode that reports changes without modifying files, and in-place write mode that transforms records and writes back to file. 152 lines of tests in `packages/cli/test/cli.test.ts`. (PR #174, commit d5ba255)

### Docs — sync (PR #185, PR #183)
- **Documentation syncs:** Status table and changelog entries updated for merged work through PR #185. (PR #185, PR #183)

### Added — Multilingual Round-Trip Retention (PR #176)
- **Round-trip retention experiment:** Parse→realize round-trips on all 4 languages (EN/EL/ES/ID) against local models. Gold Sem is realized to each target language via local model, parsed back, and compared against gold Sem. Scores: predicate match, role match, protected-literal preservation. Per-language pass/fail metrics published. Types in `packages/eval/src/round-trip-retention.ts`. 14 tests in `packages/eval/test/round-trip-retention.test.ts`. (PR #176)

### Added — Retention Regression Gate (PR #167)
- **Retention regression gate:** Baseline store with provenance (dataset/model/schema), regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), and nightly CI integration. Types and logic in `packages/eval/src/baseline-store.ts`. 11 tests in `packages/eval/test/baseline-store.test.ts`. CI workflow at `.github/workflows/retention-regression-gate.yml`. (PR #167)

### Added — Per-Model Retention Profiles (PR #186)
- **Per-model retention profiles:** `ModelRetentionProfile` and `ModelLanguageProfile` types that track per-model retention characteristics across all languages. Round-trip retention experiment runner now computes and outputs: (1) `modelProfiles` — per-model retention metrics including per-language breakdown, (2) `bestModelsByLanguage` — best model for each language by retention rate, (3) model profile markdown reports, (4) best-models-by-language summary report. Addresses STATUS.md honest boundary: "per-model retention profiles are not yet established." 18 total round-trip retention tests pass. (PR #186, commit d547115)

### Added — Retention Baseline Store (PR #180)
- **Retention baseline store:** Per-language retention metrics save/load with `saveBaseline()` and `loadBaseline()`. Snapshot-to-baseline conversion via `snapshotToBaseline()`. Regression detection via `compareRetentionAgainstBaseline()` — detects when any language drops below its baseline, below minimum threshold (0.5), or overall drops >5pp. Types in `packages/eval/src/retention-baseline.ts`. 289 lines of implementation, 274 lines of tests in `packages/eval/test/retention-baseline.test.ts`. (PR #180)

### Added — Renderer Profiles (PR #182)
- **Renderer profiles upgraded to Reference:** Deterministic golden-output tests for safe/short/tight profiles on 10+ diverse inputs. Model-specific tight profiles via Token Atlas; per-model best profile selection available. Types in `packages/core/src/profile-selector.ts`. Golden-output tests on main. (PR #182, commit c2e9a28)

### Changed — STATUS.md Maturity (PR #186)
- **Per-model retention profiles now established:** Per-language retention metrics are now tracked per-model, with `bestModelsByLanguage` summaries. Downgraded renderer profiles from Reference to Experiment in STATUS.md (reverted in PR #186). Honesty boundary updated: "per-model retention profiles are not yet established" replaced with per-model profile results. (PR #185, commit 95f121f)

### Added — Retrieval (PR #164)
- **Aggregate MRR:** Mean Reciprocal Rank for retrieval tasks, computed and validated in `summary.json` and `report.md`. Tests rebuilt and revalidated in `packages/eval/test/` (PR #164).

### Changed — Quality Gate CI (PR #151)
- **Quality gate CI rebuild:** Rebuilt quality gate CI integration per maintainer feedback (replaces stale PRs #97 and #98). Unified runner wrapping downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, and prompt-gates into a single runnable suite for CI. Exit codes: 0=pass, 1=warn, 2=fail. Configurable gates with `minimumPassRate` and `strictMode` support. Types in `packages/core/src/quality-gate-ci.ts`. Tests in `packages/core/test/quality-gate-ci.test.ts`. CI workflow at `.github/workflows/quality-gate.yml`. (PR #151)

### Changed — Schema (PR #160, PR #163)
- **Bidirectional migration rebuild:** Revalidated bidirectional migration (0.1 ↔ 0.2) with comprehensive test coverage — recordVersion and schema migration, modality locking, provenance/annotations field trimming, input-order preservation, source text identity, clause count/predicate preservation, and source/destination schema validation. 220 new lines in `packages/core/test/fingerprint-migration.test.ts`. (PR #160)
- **JSON Schema $ref cross-references rebuild:** Restructured `$ref` cross-references to use `schemas/shared.schema.json` as the single source for term, reference, iso8601, and confidence definitions. `lunum-sem-v02.schema.json` and `lunum-record-v02.schema.json` now reference shared definitions via `https://openlunum.org/schemas/shared/1#/$defs/...` URIs. Full AJV validation of the complete schema graph (6 schemas) with fixture-based validation tests. 334 lines in `packages/eval/test/schema-crossrefs.test.ts`. (PR #163)
- **Type tightening in types-schema.ts:** `Reference[]` replaces `v02Reference[]`; `Confidence` replaces raw `number` for confidence fields; `Iso8601` replaces raw `string` for timestamp fields in provenance and meta. (PR #163)

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
- **Orchestrator handover doc:** `ORCHESTRATOR.md` with 6-layer stack architecture (Cloud Orchestrator, Watchdog, Local Orchestrator with LLM diagnosis, Reviewer, Worker, Merge Bot), key paths, hardware profile, escalation path (bash → LLM diagnosis → NEEDS_CLOUD → cloud orchestrator → user notification), merge bot `orchestrator-approved` label for hard-protected PRs, and ops runbook enabling any LLM to take over as orchestrator. `ORCHESTRATOR-PROMPT.md` provides copy-paste handover instructions for any LLM.

### Added — Quality Gate CI (0a23ae4)
- **Quality gate CI integration:** Unified quality gate CI runner wrapping downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, and prompt-gates into a single runnable suite for CI. Exit codes: 0=pass, 1=warn, 2=fail. Configurable gates with `minimumPassRate` and `strictMode` support. Types in `packages/core/src/quality-gate-ci.ts`. Tests in `packages/core/test/quality-gate-ci.test.ts`. CI workflow at `.github/workflows/quality-gate.yml` runs on PRs touching `packages/core/src/` or `packages/eval/src/`. Implements release gate 5 (quality gate CI integration).

### Added — Safety (PR #154)
- **Rollback process for Lunum-Sem records:** `rollbackToSource()` rolls back a single record with integrity/provenance/source verification. `rollbackBatch()` performs batch rollback with per-record results and summary. `verifySourceAuthentic()` verifies source text against an external digest. Key design: separate integrity/provenance/source-authenticity statuses (verified/failed/absent), fail closed when evidence is absent, verify source/provenance digests rather than trusting the record itself. 10 unit tests. Types in `packages/core/src/rollback-process.ts`.

### Added — Orchestrator (fccf3bc)
- **LLM diagnosis:** Local orchestrator (Layer 3) now asks Qwen3 35B with thinking/reasoning for a fix before escalating to cloud.
- **Merge bot `orchestrator-approved` label:** Hard-protected PRs now require explicit `orchestrator-approved` label from cloud orchestrator in addition to reviewer's READY_FOR_MERGE verdict. Merge bot adds `claude-review` label and skips auto-merge for hard-protected paths.
- **6-layer stack architecture:** Updated `ORCHESTRATOR.md` from 5-layer to 6-layer: Layer 5 (Cloud Orchestrator), Layer 4 (Watchdog), Layer 3 (Local Orchestrator with LLM diagnosis), Layer 2 (Reviewer), Layer 1 (Worker), Layer 0 (Merge Bot). Escalation path: Bash watchdog → Local orchestrator bash auto-fix → Local orchestrator LLM diagnosis → NEEDS_CLOUD → Cloud orchestrator → User notification.
- **Orchestrator handover prompt:** `ORCHESTRATOR-PROMPT.md` with copy-paste instructions for handing orchestrator duties to any LLM. Includes check-in procedure, key rules, and state update workflow.

### Changed — Schema (PR #146)
- **JSON Schema $ref cross-references v2 redesign:** Restructured `$ref` cross-references between experiment.schema.json, protected-eval.schema.json, and the core Lunum-Sem schema. Added `schemas/shared.schema.json` for shared definitions. Updated `schemas/lunum-sem-v02.schema.json` with v2 reference graph. Test suite in `packages/eval/test/schema-crossrefs.test.ts` validates the cross-reference graph.

---

## Since 0.2.0

### Added — CLI Migration (PR #174)
- **Enhanced CLI migrate command:** Bidirectional `--from` / `--to` support, `--dry-run` mode, detailed results with schema versions and fingerprints, single-record and array support. (PR #174)

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
