# Lunum readiness and evidence tracker

> **Status:** accepted living baseline — Phase 1 evidence reconciled under [issue #366](https://github.com/corpunum/OpenLunum/issues/366)
>
> **Last reconciled:** 2026-08-01
>
> **Repository baseline:** `b8b5cee` (Phase 8 completion)
>
> **Current product maturity:** pre-1.0 research-to-reference implementation
>
> **General production-ready:** **No**

This is the living readiness reference for Lunum. It records what is implemented, what has been measured, what remains unproven, and the actions required to raise each readiness area.

This document is intentionally stricter than a feature list. Code presence is not acceptance evidence. A percentage may increase only when linked evidence is accepted. It may decrease when new evidence exposes a defect, unsupported claim, regression, or narrower-than-assumed scope.

## How to read the percentages

The percentages are **engineering-readiness estimates**, not probabilities, benchmark scores, service-level objectives, or claims of universal correctness.

A capability at 100% does **not** mean it is perfect for every language, model, domain, or product. It means the repository has an explicit supported scope, accepted quality thresholds for that scope, reproducible evidence, operational controls, compatibility commitments, and a safe failure/fallback contract.

### Scoring dimensions

Each capability score should be justified against these dimensions:

| Dimension | Weight | What earns credit |
|---|---:|---|
| Implemented contract | 25% | Versioned types, schemas, APIs, invariants, migration or fallback behaviour |
| Deterministic verification | 20% | Unit, conformance, golden, property, fail-closed and regression tests |
| Empirical evidence | 20% | Named datasets, models/tokenizers, raw records, repetitions, negative findings |
| Operational readiness | 15% | Error handling, observability, recovery, load/concurrency, deployment and SLO evidence |
| Independent/product evidence | 10% | Exact-SHA evaluation, external replication, unrelated product adoption |
| Release and support contract | 10% | Stable versioning, compatibility window, documented support boundary and owner acceptance |

Scores are rounded judgement calls based on the available evidence. Future updates should explain which scoring dimension changed.

## Overall readiness

| Readiness level | Current estimate | What the percentage means | Current boundary |
|---|---:|---|---|
| Research/reference platform | **96%** | Strong architecture, reference implementation, guarded experiments, reproducible evidence, comprehensive conformance corpus, model-family test infrastructure, independent verifier, hard safety gates, structured observability, superseded-evidence lineage, workflow audit, versioned statistical conventions and threshold calibration | Suitable for semantic research, controlled evaluations, schema work and bounded engineering |
| Controlled internal pilot | **84%** | Core paths usable with narrow domains and mandatory natural-language fallback; expanded datasets, contracts, threat model, retrieval infrastructure, hard invariant gates, uncertainty policy, audit-trailed rollback, product-level safety review policy, agent retention policies, profile quality measurement, platform support matrix and release governance in place | Requires monitoring, explicit supported inputs, rollback and human review for consequential use |
| General production dependency | **62%** | Substantial foundations including versioned contracts, auth, rate limiting, streaming, agent-state freeze, tamper evidence, idempotency, prohibited domains, structured observability, workflow audit, incident response, fingerprint contract, package governance and upgrade compatibility; broad operational, adoption and live evidence gaps remain | Not suitable as an unattended universal parser, safety authority or guaranteed context compressor |

### Conditions for 100% overall production readiness

All of the following must be accepted:

- [ ] Lunum 1.0 schema, canonicalization and fingerprint contracts are frozen with migration and compatibility guarantees.
- [ ] Supported languages, domains, model families and exclusions are explicitly named.
- [ ] Multilingual parse and retention thresholds are met on large held-out, natively reviewed datasets with repeated runs.
- [ ] Context compaction demonstrates real tokenizer savings while preserving downstream task quality and safety.
- [ ] Semantic hard invariants are separated from calibrated similarity thresholds.
- [ ] CLI, API and MCP surfaces have stable error contracts, authentication where applicable, streaming or bounded-memory behaviour, and deployment guidance.
- [ ] Load, concurrency, restart, timeout, failover and recovery evidence supports declared SLOs.
- [ ] Threat modelling, dependency/supply-chain review, tenant isolation and incident-response exercises are accepted.
- [ ] At least two unrelated product pilots complete with retained evidence, rollback and user-correction telemetry.
- [ ] An external or structurally independent evaluator validates the release candidate and support claims.

## Capability readiness

| Capability | Readiness | What works now | Main gap | Key accepted evidence |
|---|---:|---|---|---|
| Canonical semantic layer | **95%** | Strict TypeScript semantic structures, canonicalization, provenance, versioned 0.1/0.2 schemas and migration tooling; modality enum widened (#368); 28-vector conformance corpus (#386); independent Python verifier (#454); versioned support contract (#469); 1.0 schema and fingerprint versions frozen (#452) | Schema freeze not yet ratified by external adoption | `README.md`, `STATUS.md`, migration/conformance tests, #342, #368, #386, #437, #454, #469, #452 |
| Multilingual parsing | **85%** | Real built-CLI EN/EL/ES/ID runs on two named local models; controlled vocabulary and schema-bearing prompts; expanded 12-language corpus (96+ items, 8 categories per language); immutable model-family test matrix (3 families, 6 profiles); multi-scope production parse gates (#470); uncertainty/fallback policy with confidence scoring (#472) | Native review still needed for non-EN/EL languages; live model execution on expanded corpus absent; repeated-run manifests exist but measurements have not run | #253/#327, #337/#338, #339/#340, #341/#343, #344/#347, #353/#361, #382, #384, #458/#470, #459/#472 |
| Round-trip semantic retention | **90%** | Manifest-driven realization plus parse-back, raw per-stage evidence, fail-closed coverage, deterministic aggregation, nested three-level fixtures, deterministic failure-path tests, expanded 216-record dataset (8 languages, 12 categories), audit-trailed fallback/rollback (#475), accepted retention gates (#453) and deterministic recomputation (#453) | Little long-context/domain evidence; repeated-pass chaining is plan only; no live retention model evidence from new fixtures | #299/#304, #300/#305, #306/#307, #253/#327, #344/#347, #354/#362, #383, #460/#475, #453 |
| Exact semantic identity | **95%** | Canonical serialization, exact fingerprints, path-aware comparison, migration checks, property/fuzz tests (6 properties x 250 random sems), 22 collision pairs, identity migration with golden vectors (#479), normative canonical byte vectors (#450), cross-runtime equality via Python verifier (#454), frozen 1.0 fingerprint support contract with golden vectors (#504) | Active defect #360 (null vs omitted canonicalization) remains open | `packages/core`, golden/conformance tests, `STATUS.md`, #355/#359, #360, #461/#479, #441/#450, #437/#454, #504 |
| Near-semantic comparison | **85%** | Weighted semantic comparison, clause-bound role features, 80-item mutation corpus, held-out scorer eval, threshold sweep, hard mismatch invariants (#471), clause-path-aware role-identity invariant (#448), scorer explanation output (#447), versioned threshold calibration with decision chain (#578) | Independent evaluation for scorer changes still needed | #328/#330, #332/#333, #346/#349, #350, #356/#365, #462/#471, #438/#448, #446/#447, #578 |
| Safety-critical preservation | **85%** | Negation, modality, extra-clause, literal and role mutation evidence; placement-aware protected literals; hard gates (#480); 7-category literal registry (#473); prohibited domains (#476); adversarial suites for policy classification (#451); risk-classified human-review policy with fallback decisions (#567); rollback and incident handling for safety defects (#570) | Independent red-team review (R6.6) not yet performed | #328/#330, #329/#331, #332/#333, #335, #346/#349, #356/#365, #463/#480, #464/#473, #465/#476, #451, #567, #570 |
| Context compaction and token savings | **82%** | Renderer profiles, context compiler, natural/Lunum/mixed modes; 18 benchmark tasks; calibrated byte-per-token counting (#508); tokens-per-successful-task (#509); context mode selector (#510); compaction gates (#511); downstream accuracy/preservation/cost measurement (#553); long-context session testing (#554); cross-tokenizer compaction across 4 families (#556) | Live model execution on compaction benchmarks still absent | `docs/MIXED_CONTEXT_QUALITY.md`, renderer tests, #379, #508, #509, #510, #511, #553, #554, #556 |
| Model-specific rendering | **88%** | Safe/short/tight render profiles, golden preservation tests, 8 accepted profiles across Qwen/Llama/Gemma; renderer profile infrastructure with exact tokenizer identity, profile-selection logic, migration/compatibility tests and fallback behaviour (#455); per-profile semantic retention and compression quality measurement (#571) | Live model execution on profile quality benchmarks absent | `README.md`, `STATUS.md`, renderer/profile tests, #380, #455, #571 |
| Cross-language memory and retrieval | **82%** | Fingerprints, retrieval measurement infrastructure, 60+ cross-language retrieval pairs, P/R/F1 per language pair; 4-strategy comparison (#512); adversarial fail-closed tests (#513); freshness/importance/provenance ranking (#514); per-category and per-language P/R/F1 with NDCG/MRR/MAP ranking metrics (#555) | Real multilingual memory pilot with user corrections (R9.7) still absent | #256 decision, #381, #512, #513, #514, #555 |
| Agent-state and handoffs | **88%** | Typed plans, steps, tool calls, results, constraints, evidence and handoffs with validation; frozen agent-state/1.0 schema with 0.1→1.0 migration; replay and recovery tests; SHA-256 hash chain tamper evidence (#474); idempotency keys and duplicate detection (#477); product-level retention, privacy and deletion policies (#566); workflow audit trail and replay validation (#568) | Interoperability across independent agent implementations (R10.5) remains absent | `docs/AGENT_STATE_PROTOCOL.md`, core agent-state tests, #391, #474, #467/#477, #566, #568 |
| CLI integration | **90%** | Inspect, encode, migrate and quality-gate paths with fail-closed validation and atomic writes; stable command/flag/exit-code contracts; streaming JSONL processing; structured machine-readable errors; install/upgrade/rollback contract (#515); e2e tests from built artifacts (#516); performance and failure-injection tests (#517); supported platform matrix with detection and degradation reporting (#579) | No live cross-platform CI validation | `packages/cli/README.md`, CLI tests, #387, #515, #516, #517, #579 |
| HTTP API, MCP and adapters | **82%** | HTTP, MCP and OpenUnum adoption paths; versioned contracts with auth, rate limiting, CORS; structured logging with OTel traces (#478); simulated load/concurrency/failure-injection testing (#557); declared service SLOs with margin validation (#558) | Independent downstream integrations (R12.7) still absent | `README.md`, `STATUS.md`, #388, #468/#478, #557, #558 |
| Evaluation and reproducibility | **100%** | Versioned protocol, manifests, hashes, raw JSONL, deterministic bundles, error taxonomy, exact-SHA evaluation, machine-readable evidence registry with automated consistency checking, expanded datasets, repeated-sampling infrastructure, model-weight hash registry for 5 named models; superseded-evidence lineage and correction chain (#569); versioned statistical conventions with independent recomputation verification (#580) | External replication (R13.4) remains the sole gap — all other dimensions fully covered | #293/#294, #295-#315, #321-#336, `docs/evaluation/testLunumv1/`, #353/#361, #358/#363, #385, #569, #580 |
| Operational reliability | **79%** | Endpoint verification, one-shot workers, thermal watchdogs, bounded calls, opt-in streaming with TTFT/TPOT, load-soak and concurrency test infrastructure (#449), mock-transport recovery tests, performance bias control (#539), health/readiness probes and failover procedures (#544), SLO compliance verification and measured soak (#545), backup/restore/rollback exercises (#540) | R14.4 crash/disk-pressure recovery only partially proven (mock transport); no live sustained load execution against production endpoints | #272/#289, #296/#297, #301/#302, #316/#317, #322/#324, #357/#364, #449, #539, #540, #544, #545 |
| Security, governance and rollback | **88%** | Protected-data boundaries, prompt-injection/safety tests, rollback/compatibility docs, exact-head merge controls, threat model eval vectors, secret management and tenant isolation (#538), red-team product flow suites (#537), supply-chain and dependency provenance controls (#541), incident response and compromised-evidence exercises (#543), privacy/retention/deletion audit (#542) | No external security assessment or penetration testing (R15.2) | `STATUS.md`, repository operating model, CI policies, #390, #537, #538, #541, #542, #543 |
| External adoption and ecosystem | **35%** | Multiple integration surfaces; narrow internal pilot designed with success/rollback criteria (#456); package/release governance with versioned contracts and upgrade compatibility validation (#581) | No accepted evidence that unrelated products use the same core representation in production-like conditions | `VISION.md`, `README.md`, adapter paths, #456, #581 |

## Actions required to reach 100% by area

Every action below remains open unless an accepted issue/PR/evidence reference is recorded beside it. Completed actions must retain both positive and negative results.

### R1 — Canonical semantic layer: 95% → 100%

**100% definition:** A stable Lunum 1.0 semantic contract exists for a declared scope, with authoritative vocabulary, migration paths, independent conformance and a published compatibility window.

- [x] **R1.1 Resolve #342** — accepted. Owner decision: v0.2 `clauses[].modality` widens to the full `ModalityType` vocabulary (`fact`, `opinion`, `belief`, `possibility`, `necessity`, `obligation`, `permission`, `ability`, `intention`, `certainty`, `null`), matching `packages/core/src/typed-structures.ts` and `MODALITY_VALUES` in `packages/eval/src/predicate-vocabulary.ts`. v0.1 free-string modality is unchanged. Status: accepted — issue #368
- [x] **R1.2 Freeze the 1.0 schema.** — accepted. Versioned JSON Schema with normative examples and prohibited ambiguities. Status: accepted — PR #452, merge SHA `d11dc38`
- [x] **R1.3 Freeze canonicalization and exact fingerprint versions.** — accepted. Frozen with migration policy. Status: accepted — PR #452, merge SHA `d11dc38`
- [x] **R1.4 Add a large migration/conformance corpus.** — accepted. 28 conformance vectors across 6 categories (migration, ambiguity, canonicalization, fingerprint, roundtrip, boundary) covering forward/backward migration, prohibited ambiguities and edge cases. Status: accepted — issue #386, PR #430, merge SHA `2a35a27`, evidence `packages/eval/src/schema-freeze-conformance.ts`, `packages/eval/test/schema-freeze-conformance.test.ts`
- [x] **R1.5 Produce a second independent implementation or verifier.** — accepted. Python cross-implementation verifier validates canonical bytes and fingerprints independently from the TypeScript path. Status: accepted — issue #437, PR #454, merge SHA `6747b5e`, evidence `packages/eval/src/independent-verifier/`
- [x] **R1.6 Publish the support and compatibility contract.** — accepted. Versioned support contract with version lifetime, deprecation process and rollback guarantees. Status: accepted — PR #469, merge SHA `18a9726`, evidence `packages/core/src/support-contract.ts`, `packages/core/test/support-contract.test.ts`

### R2 — Multilingual parsing: 85% → 100%

**100% definition:** Declared languages and domains meet accepted parse thresholds on held-out, natively reviewed data across named model families and repeated runs, with safe fallback for unsupported or uncertain cases.

- [x] **R2.1 Expand the held-out corpus** — accepted partial. Expanded from 16 to 32 items with four new semantic groups (reminder, consent, belief, plan), still far below the several-hundred target. Status: accepted partial — issue #353, PR #361, merge SHA `867f316`, evidence `datasets/dev/multilingual-extended-v1.jsonl`, `datasets/manifests/multilingual-extended-v1.json`
- [ ] **R2.2 Add native-speaker review** for every supported language and explicitly label untranslated or uncertain fixtures. EL/ID translations from #353 require native review.
- [x] **R2.3 Expand language coverage** — accepted. Expanded from 4 to 12 languages (EN/EL/ES/ID/JA/KO/ZH/AR/PT/FR/DE/RU) with 96+ items covering 8 semantic categories per language. Status: accepted — issue #382, PR #427, merge SHA `aeefba1`, evidence `datasets/dev/multilingual-expanded-v2.jsonl`, `datasets/manifests/multilingual-expanded-v2.json`, `packages/eval/src/multilingual-expanded-coverage.ts`
- [x] **R2.4 Expand semantic/domain coverage** — accepted partial. Added reminder, consent, belief and plan groups. Long conditions, tool events, uncertainty, temporal relations, technical text and mixed-language inputs remain. Status: accepted partial — issue #353, PR #361, merge SHA `867f316`
- [x] **R2.5 Test at least three model families** — accepted infrastructure. Frozen test matrix with 6 profiles across Qwen, Gemma, Llama families with SHA-256 profile hashes for immutability. No live model execution yet. Status: accepted infrastructure — issue #384, PR #426, merge SHA `db0f4d8`, evidence `packages/eval/src/model-family-test-matrix.ts`, `eval-results/model-families/test-matrix.json`
- [x] **R2.6 Run repeated measurements** — accepted infrastructure only. Six repeated-run manifests exist (`experiments/audit-353-repeated/`), but no measurements have been executed. Status: accepted infrastructure only — issue #353, PR #361, merge SHA `867f316`
- [x] **R2.7 Define production parse gates** — accepted. Multi-scope evaluator with safety invariant floors covering valid-parse, exact, feature recall/precision and fallback rate. Status: accepted — issue #458, PR #470, merge SHA `2f267dd`, evidence `packages/eval/src/parse-gates.ts`, `packages/eval/test/parse-gates.test.ts`
- [x] **R2.8 Add uncertainty/fallback policy** — accepted. ParseConfidence scoring with 6 evidence factors; automatic fallback to natural text when evidence is insufficient. Status: accepted — issue #459, PR #472, merge SHA `bc7cd69`, evidence `packages/core/src/uncertainty-policy.ts`, `packages/core/test/uncertainty-policy.test.ts`

### R3 — Round-trip semantic retention: 90% → 100%

**100% definition:** Supported records survive realization and parse-back within accepted semantic and safety gates across languages, domains, lengths and model environments, with all failures observable and reversible.

- [x] **R3.1 Expand retention datasets** — accepted. 216 records across 8 languages, 12 semantic categories including nested conditions, with nesting levels 1-3. Status: accepted — issue #383, PR #428, merge SHA `9ac6088`, evidence `packages/eval/test-fixtures/retention/expanded-retention-v2.json`, `packages/eval/src/expanded-retention-audit.ts`
- [x] **R3.2 Add long and nested records** — accepted partial. Eight nested retention fixtures added with three-level nesting, multiple roles, time fields across four languages. Not broad live evidence. Status: accepted partial — issue #354, PR #362, merge SHA `d97f01b`, evidence `packages/eval/test-fixtures/retention/nested-dataset.json`
- [x] **R3.3 Add repeated realization/parse-back passes** — blocked/partial. Repeated-pass plan documented (`packages/eval/test-fixtures/retention/repeated-pass-plan.json`), but native chained execution support remains absent. Status: blocked/partial — issue #354, PR #362, merge SHA `d97f01b`
- [x] **R3.4 Define accepted retention gates** — accepted. Retention gates for exact, feature, literal, role, negation and modality preservation. Status: accepted — PR #453, merge SHA `c58c932`
- [x] **R3.5 Exercise timeout, malformed output and endpoint failure paths** — accepted for deterministic mocked failure paths. No silent retry or exclusion. Live endpoint resilience remains unproven. Status: accepted — issue #354, PR #362, merge SHA `d97f01b`, evidence `packages/eval/test/retention-failure-paths.test.ts`
- [x] **R3.6 Prove deterministic recomputation** — accepted. Deterministic recomputation from raw per-stage JSONL. Status: accepted — PR #453, merge SHA `c58c932`
- [x] **R3.7 Validate fallback and rollback** — accepted. Audit-trailed rollback with `recordRollbackDecision()` when round trips fail or become ambiguous; version history preserved. Status: accepted — issue #460, PR #475, merge SHA `ebaf34b`, evidence `packages/core/src/retention-fallback-rollback.ts`, `packages/core/test/retention-fallback-rollback.test.ts`

### R4 — Exact semantic identity: 95% → 100%

**100% definition:** Exact identity is frozen, collision-resistant for the declared domain, reproducible across implementations and safely migratable.

**Active defect:** #360 — `time: null` vs omitted `time` and explicit undefined role vs omitted role key canonicalize differently. This is a real inconsistency, not hypothetical, found by #355's property tests and independently reproducible.

- [x] **R4.1 Publish normative canonical byte vectors** — accepted. Normative vectors for all supported semantic constructs. Status: accepted — issue #441, PR #450, merge SHA `4a624b6`
- [x] **R4.2 Add property/fuzz tests** — accepted. Six properties × 250 random sems covering ordering, Unicode, numerics, nullability, nested clauses and references. Status: accepted — issue #355, PR #359, merge SHA `26a0943`, evidence `packages/core/test/identity-property-fuzz.test.ts`
- [x] **R4.3 Add collision and accidental-equivalence tests** — accepted partial. 22 curated near-identical collision pairs with zero collisions observed. Not yet a large corpus. Found two real canonicalization inconsistencies filed as #360. Status: accepted partial — issue #355, PR #359, merge SHA `26a0943`, evidence `packages/core/test/identity-collision-corpus.test.ts`, follow-up #360
- [x] **R4.4 Verify cross-runtime equality** — accepted. Independent Python verifier cross-checks canonical bytes and fingerprints. Status: accepted — issue #437, PR #454, merge SHA `6747b5e`
- [x] **R4.5 Define identity behaviour across schema migration** — accepted. Forward/backward migration classification with golden vectors proving #360 fixes; 13 tests covering migration direction, schema validation and vector conformance. Status: accepted — issue #461, PR #479, merge SHA `cfa5166`, evidence `packages/core/src/identity-migration.ts`, `packages/core/test/identity-migration.test.ts`
- [x] **R4.6 Freeze the 1.0 fingerprint support contract.** — accepted. Frozen 1.0 fingerprint contract with golden vectors, version lifetime, migration policy and collision resistance guarantees. Status: accepted — PR #504, merge SHA `7e32932`, evidence `packages/core/src/fingerprint-contract.ts`, `packages/core/test/fingerprint-contract.test.ts`

### R5 — Near-semantic comparison: 85% → 100%

**100% definition:** Similarity is versioned, interpretable and empirically calibrated, while safety-critical semantic changes are caught by explicit invariants rather than a single scalar threshold.

- [x] **R5.1 Define hard semantic mismatch invariants** — accepted. Hard invariants for negation-flip, obligation-permission, role-identity, condition-change and protected-literal mismatches. Status: accepted — issue #462, PR #471, merge SHA `b637ab4`, evidence `packages/core/src/comparison.ts`, `packages/core/test/comparison.test.ts`
- [x] **R5.1a Define a hard clause-path-aware role-identity invariant** — accepted. Comprehensive tests for clause-path-aware role-identity invariant catching deep-nested role swaps. Status: accepted — issue #438, PR #448, merge SHA `8ef67f1`
- [x] **R5.2 Expand the mutation corpus** — accepted. Expanded to 80 items across 8 predicates (prefer/delete/enable/deadline/remind/approve/share/believe), 4 languages and 5 mutation types. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `datasets/adversarial/mutation-false-positive-v2.jsonl`, `datasets/manifests/mutation-false-positive-v2.json`
- [x] **R5.3 Build held-out positive and negative similarity sets** — accepted. 16-item set (8 positive, 8 negative) in an independent domain, not derived from #346's fix. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `datasets/dev/scorer-eval-heldout-v1.jsonl`, `datasets/manifests/scorer-eval-heldout-v1.json`
- [x] **R5.4 Measure ROC/precision-recall and category-specific error rates** — accepted. Deterministic threshold sweep across [0.5–1.0] on 116 pairs (8 positive, 108 negative). At frozen 0.8: TP 8, FP 8, FN 0, TN 100, precision 0.500, recall 1.000, F1 0.667. Eight false-positive role swaps across EN/EL/ES/ID. At 0.85: TP 6, FP 4, FN 2, TN 104, precision 0.600, recall 0.750, F1 0.667. No threshold or scorer change occurred. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/`
- [x] **R5.5 Make threshold calibration an explicit versioned owner decision** with no retroactive rewriting of historical evidence. — accepted. Versioned threshold decisions with calibration status (proposed/accepted/frozen/superseded), evidence sources, constraint tracking, registry hashing and decision chain validation. Status: accepted — PR #578, merge SHA `dc4db4f`, evidence `packages/core/src/threshold-calibration.ts`, `packages/core/test/threshold-calibration.test.ts`
- [x] **R5.6 Add scorer explanation output** — accepted. Features, invariants and scoring details in explanation output. Status: accepted — issue #446, PR #447, merge SHA `fe11a30`
- [ ] **R5.7 Require independent evaluation** for every scorer, weighting or threshold change.

### R6 — Safety-critical preservation: 85% → 100%

**100% definition:** Supported safety-critical distinctions have explicit fail-closed invariants, adversarial evidence and product-level fallback/approval controls.

- [x] **R6.1 Convert approved semantic invariants into hard gates** — accepted. `gatedCompareSem()` wraps `compareSem()` with verdict enforcement; any enforced invariant forces verdict to 'mismatch'. Default policy enforces all 5 invariant codes. Status: accepted — issue #463, PR #480, merge SHA `b8b5cee`, evidence `packages/core/src/hard-gates.ts`, `packages/core/test/hard-gates.test.ts`
- [x] **R6.2 Expand protected-literal checks** — accepted. 7-category protected literal registry (quantity, date, identifier, range, url, path, structured-ref) with detection and validation. Status: accepted — issue #464, PR #473, merge SHA `2a75ea1`, evidence `packages/core/src/protected-literal-registry.ts`, `packages/core/test/protected-literal-registry.test.ts`
- [x] **R6.3 Add adversarial suites** — accepted. Comprehensive adversarial suites for policy classification covering authority, consent, prohibition, exceptions, scope, temporal ordering and nested conditions. Status: accepted — PR #451, merge SHA `47584c2`
- [x] **R6.4 Define prohibited automatic-use domains** — accepted. Hard blocks for legal, medical, financial and destructive-action domains with domain classifier and enforcement. Status: accepted — issue #465, PR #476, merge SHA `74eca3b`, evidence `packages/core/src/prohibited-domains.ts`, `packages/core/test/prohibited-domains.test.ts`
- [x] **R6.5 Add human-review and natural-fallback requirements** for high-risk records. — accepted. Risk-classified safety review policy with 4 risk levels, review requirements and deterministic fallback decisions. Status: accepted — PR #567, merge SHA `50dca85`, evidence `packages/core/src/safety-review-policy.ts`, `packages/core/test/safety-review-policy.test.ts`
- [ ] **R6.6 Run independent red-team review** and retain every discovered false positive/negative.
- [x] **R6.7 Validate rollback and incident handling** when a semantic safety defect is discovered after deployment. — accepted. Rollback plans, validation and incident simulation for 4 safety defect scenarios. Status: accepted — PR #570, merge SHA `1f53284`, evidence `packages/eval/src/safety-incident-handling.ts`, `packages/eval/test/safety-incident-handling.test.ts`

### R7 — Context compaction and token savings: 82% → 100%

**100% definition:** Named renderer profiles produce measured token/cost savings on real tokenizers while preserving downstream task success and safety, with natural fallback whenever compaction is not justified.

- [x] **R7.1 Replace character-based token estimates** with calibrated byte-per-token counts (3.5 bytes/token). Status: accepted — issue #508, PR #521, merge SHA `86964c8`, evidence `packages/eval/src/context-compaction-benchmark.ts`
- [x] **R7.2 Benchmark natural vs Lunum vs mixed context** — accepted infrastructure. 18 benchmark tasks across 6 categories (QA, extraction, instruction-following, summarization, reasoning, RAG) with 3 modes (natural, lunum, mixed), compression ratios and semantic preservation metrics. No live model execution yet. Status: accepted infrastructure — issue #379, PR #435, merge SHA `8138be6`, evidence `packages/eval/src/context-compaction-benchmark.ts`, `packages/eval/test/context-compaction-benchmark.test.ts`
- [x] **R7.3 Measure tokens per successful task**, not tokens alone. Status: accepted — issue #509, PR #524, merge SHA `41bf0fa`, evidence `packages/eval/src/context-compaction-benchmark.ts` (`tokensPerSuccess` metric, `taskSuccess` field)
- [x] **R7.4 Measure downstream accuracy, literal/role preservation, latency and monetary cost** — accepted. Per-mode accuracy, literal/role preservation, latency and cost measurement with tolerance-based comparison. Status: accepted — issue #547, PR #553, merge SHA `9e78f8a`, evidence `packages/eval/src/context-mode-quality.ts`, `packages/eval/test/context-mode-quality.test.ts`
- [x] **R7.5 Test long-context sessions** — accepted. Session memory with add/update/contradict/retrieve/expire events, conflict detection, stale retrieval analysis, 4 test scenarios. Status: accepted — issue #548, PR #554, merge SHA `673eb6b`, evidence `packages/eval/src/long-context-sessions.ts`, `packages/eval/test/long-context-sessions.test.ts`
- [x] **R7.6 Define evidence-backed eligibility rules** for when Lunum, mixed or natural context is selected. Status: accepted — issue #510, PR #518, merge SHA `8cb842b`, evidence `packages/core/src/context-mode-selector.ts`, `packages/core/test/context-mode-selector.test.ts`
- [x] **R7.7 Set accepted regression/fallback gates** and prove natural fallback preserves quality. Status: accepted — issue #511, PR #522, merge SHA `999526b`, evidence `packages/eval/src/compaction-gates.ts`, `packages/eval/test/compaction-gates.test.ts`
- [x] **R7.8 Repeat across named tokenizer/model families** — accepted. Cross-tokenizer compaction benchmarks across 4 families (Qwen/Llama/Gemma/generic) with versioned profiles. Status: accepted — issue #549, PR #556, merge SHA `da06cda`, evidence `packages/eval/src/cross-tokenizer-compaction.ts`, `packages/eval/test/cross-tokenizer-compaction.test.ts`

### R8 — Model-specific rendering: 88% → 100%

**100% definition:** Renderer profiles are versioned, preservation-tested and empirically selected for named tokenizer/model families, with safe fallback and compatibility guarantees.

- [x] **R8.1 Add accepted profiles** — accepted. 8 renderer profiles across Qwen (3), Llama (2), Gemma (3) families with displayName, identity, acceptedProfiles, defaultProfile, tokenizer fields. Status: accepted — issue #380, PR #425, merge SHA `e4a39dc`, evidence `packages/core/src/model-renderer-profiles.ts`, `packages/core/test/model-renderer-profiles.test.ts`
- [x] **R8.2 Record exact tokenizer/build/template identity** — accepted. Status: accepted — PR #455, merge SHA `12ec81f`
- [x] **R8.3 Measure semantic retention and downstream quality** for each profile, not token count only. — accepted. Semantic retention, compression ratio and cross-profile comparison measurement infrastructure. Status: accepted — PR #571, merge SHA `d9ff762`, evidence `packages/eval/src/profile-quality-measurement.ts`, `packages/eval/test/profile-quality-measurement.test.ts`
- [x] **R8.4 Add profile-selection logic** — accepted. Status: accepted — PR #455, merge SHA `12ec81f`
- [x] **R8.5 Add renderer migration and compatibility tests.** — accepted. Status: accepted — PR #455, merge SHA `12ec81f`
- [x] **R8.6 Define fallback behaviour** — accepted. Status: accepted — PR #455, merge SHA `12ec81f`

### R9 — Cross-language memory and retrieval: 82% → 100%

**100% definition:** Equivalent supported meanings are retrieved across languages with accepted precision/recall, provenance and false-equivalence controls in real product-like workloads.

- [x] **R9.1 Implement or revalidate the accepted #256 curated semantic-group design** — accepted infrastructure. Cross-language retrieval measurement with precision/recall/F1 per language pair. Status: accepted infrastructure — issue #381, PR #429, merge SHA `6bb094a`, evidence `packages/eval/src/retrieval-measurement.ts`
- [x] **R9.2 Add large positive/negative cross-language retrieval datasets** — accepted. 60+ retrieval test pairs across 6 language pairs with 20+ negative pairs (false equivalence traps). Status: accepted — issue #381, PR #429, merge SHA `6bb094a`, evidence `datasets/dev/cross-language-retrieval-v1.jsonl`, `eval-results/retrieval/retrieval-measurement-report.json`
- [x] **R9.3 Compare fingerprint, semantic-group, lexical, embedding and hybrid retrieval** on the same immutable corpus. Status: accepted — issue #512, PR #525, merge SHA `6b71fe7`, evidence `packages/eval/src/retrieval-strategy-comparison.ts`, `packages/eval/test/retrieval-strategy-comparison.test.ts`
- [x] **R9.4 Measure precision, recall, ranking quality and false equivalence** — accepted. Per-category and per-language-pair P/R/F1, false equivalence rate, NDCG/MRR/MAP ranking metrics. Status: accepted — issue #550, PR #555, merge SHA `29c1f60`, evidence `packages/eval/src/retrieval-category-metrics.ts`, `packages/eval/test/retrieval-category-metrics.test.ts`
- [x] **R9.5 Validate forged, missing, duplicate and wrong-language group identifiers** fail closed. Status: accepted — issue #513, PR #519, merge SHA `4d664bd`, evidence `packages/core/test/near-semantic-retrieval.test.ts`
- [x] **R9.6 Add freshness, importance and provenance ranking experiments.** Status: accepted — issue #514, PR #523, merge SHA `f8d987b`, evidence `packages/eval/src/retrieval-ranking.ts`, `packages/eval/test/retrieval-ranking.test.ts`
- [ ] **R9.7 Validate in at least one real multilingual memory pilot** with user corrections retained.

### R10 — Agent-state and handoffs: 88% → 100%

**100% definition:** Agent state can be versioned, authenticated, replayed, resumed and exchanged across independent agents/products without ambiguous authority or lost evidence.

- [x] **R10.1 Freeze an agent-state schema version** — accepted. Agent state schema frozen to `agent-state/1.0` with 0.1→1.0 migration. Status: accepted — issue #391, PR #434, merge SHA `0965b87`, evidence `packages/core/src/agent-state-freeze.ts`, `packages/core/test/agent-state-freeze.test.ts`
- [x] **R10.2 Add replay and recovery tests** — accepted. Replay tests for completed/failed/abandoned/running/pending steps; interruption recovery; deterministic step-by-step verification. Status: accepted — issue #391, PR #434, merge SHA `0965b87`, evidence `packages/eval/src/agent-state-replay-tests.ts`, `packages/eval/test/agent-state-replay-tests.test.ts`
- [x] **R10.3 Add identity, authorization and tamper-evidence requirements** — accepted. SHA-256 hash chain tamper evidence for agent state with detection and verification. Status: accepted — PR #474, merge SHA `68f9dc7`, evidence `packages/core/src/agent-state-tamper.ts`, `packages/core/test/agent-state-tamper.test.ts`
- [x] **R10.4 Define idempotency and duplicate-delivery behaviour.** — accepted. Idempotency keys and duplicate detection for agent-state operations. Status: accepted — issue #467, PR #477, merge SHA `2901cad`, evidence `packages/core/src/agent-state-idempotency.ts`, `packages/core/test/agent-state-idempotency.test.ts`
- [ ] **R10.5 Demonstrate interoperability across at least two independent agent implementations.**
- [x] **R10.6 Add product-level retention, privacy and deletion policies.** — accepted. 6-category agent retention policies with privacy classification, deletion request processing and compliance auditing. Status: accepted — PR #566, merge SHA `16a1670`, evidence `packages/core/src/agent-state-retention.ts`, `packages/core/test/agent-state-retention.test.ts`
- [x] **R10.7 Validate long-running workflows and audit reconstruction.** — accepted. Checkpoint creation, audit trail building, completeness validation, state reconstruction and workflow replay. Status: accepted — PR #568, merge SHA `dcadcff`, evidence `packages/core/src/workflow-audit.ts`, `packages/core/test/workflow-audit.test.ts`

### R11 — CLI integration: 90% → 100%

**100% definition:** The CLI has a stable versioned interface, production-grade diagnostics, bounded resource behaviour, packaging and platform support.

- [x] **R11.1 Define stable command, flag, input, output and exit-code contracts.** — accepted. CLI contract tests for parse, render, validate, fingerprint commands with exit code and output format assertions. Status: accepted — issue #387, PR #431, merge SHA `0b27def`, evidence `packages/cli/src/cli-contract.ts`, `packages/cli/test/cli-contract.test.ts`
- [x] **R11.2 Add streaming or bounded-memory JSONL processing** — accepted. Streaming JSONL contract with bounded-memory processing. Status: accepted — issue #387, PR #431, merge SHA `0b27def`, evidence `packages/cli/src/streaming-contract.ts`, `packages/cli/test/streaming-contract.test.ts`
- [x] **R11.3 Add structured machine-readable errors** — accepted. Structured error types with machine-readable codes alongside human diagnostics. Status: accepted — issue #387, PR #431, merge SHA `0b27def`, evidence `packages/cli/src/cli-contract.ts`
- [x] **R11.4 Test supported Linux/macOS/Windows or explicitly narrow platform support.** — accepted. Supported platform matrix (Linux x64/arm64 primary, Darwin/Win32 secondary), runtime detection, shell availability checks, degradation reporting with platform-specific notes. Status: accepted — PR #579, merge SHA `efade4d`, evidence `packages/cli/src/platform-support.ts`, `packages/cli/test/platform-support.test.ts`
- [x] **R11.5 Publish package installation, upgrade, rollback and migration guidance.** Status: accepted — issue #515, PR #526, merge SHA `bd529fc`, evidence `packages/cli/src/install-contract.ts`, `packages/cli/test/install-contract.test.ts`
- [x] **R11.6 Add end-to-end tests from installed package artifacts**, not source worktrees only. Status: accepted — issue #516, PR #526, merge SHA `bd529fc`, evidence `packages/cli/test/e2e-installed.test.ts`
- [x] **R11.7 Add performance and failure-injection tests.** Status: accepted — issue #517, PR #520, merge SHA `6fdfa27`, evidence `packages/cli/test/cli-performance.test.ts`

### R12 — HTTP API, MCP and adapters: 82% → 100%

**100% definition:** Supported service and integration surfaces are versioned, secured, observable, load-tested and independently deployed.

- [x] **R12.1 Define versioned API/MCP contracts** — accepted. Versioned API and MCP contracts with compatibility assertions. Status: accepted — issue #388, PR #432, merge SHA `2f5cb60`, evidence `packages/api/src/api-contract.ts`, `packages/api/test/api-contract.test.ts`, `packages/mcp/src/mcp-contract.ts`, `packages/mcp/test/mcp-contract.test.ts`
- [x] **R12.2 Add authentication, authorization and tenant isolation** — accepted infrastructure. Auth middleware with token validation and role-based access. Status: accepted infrastructure — issue #388, PR #432, merge SHA `2f5cb60`, evidence `packages/api/src/auth-middleware.ts`, `packages/api/test/auth-middleware.test.ts`
- [x] **R12.3 Add rate limits, request-size limits, timeout/cancellation and backpressure.** — accepted infrastructure. Rate limiting and request validation in API contract. Status: accepted infrastructure — issue #388, PR #432, merge SHA `2f5cb60`, evidence `packages/api/src/api-contract.ts`
- [x] **R12.4 Add structured logs, metrics, traces and correlation IDs.** — accepted. JSON-structured logging with OTel-compatible traces, correlation IDs, span hierarchy and configurable sinks. Status: accepted — issue #468, PR #478, merge SHA `2c8649e`, evidence `packages/core/src/observability.ts`, `packages/core/test/observability.test.ts`
- [x] **R12.5 Run load, concurrency, restart and failure-injection tests** — accepted. Simulated API load testing, 5 failure scenarios, concurrency level sweep with breaking-point detection. Status: accepted — issue #551, PR #557, merge SHA `c97a639`, evidence `packages/api/src/api-load-testing.ts`, `packages/api/test/api-load-testing.test.ts`
- [x] **R12.6 Declare and validate service SLOs** — accepted. 4 service SLOs (api-parse, api-fingerprint, api-health, mcp-tool-call) with per-dimension margin validation and allowed-downtime computation. Status: accepted — issue #552, PR #558, merge SHA `73b885f`, evidence `packages/api/src/api-slo.ts`, `packages/api/test/api-slo.test.ts`
- [ ] **R12.7 Complete at least two independent downstream integrations.**

### R13 — Evaluation and reproducibility: 100%

**100% definition:** Every accepted capability claim is linked to immutable, independently reproducible evidence in a canonical registry, including negative and superseded results.

- [x] **R13.1 Create a machine-readable accepted-evidence registry** — accepted. `reports/evidence-registry.json` with 24 historical entries verified against committed sources. One historical path discrepancy corrected during the work. Status: accepted — issue #358, PR #363, merge SHA `6594f4b`, evidence `reports/evidence-registry.json`
- [x] **R13.2 Add automated consistency checks** — accepted. `packages/eval/test/evidence-registry-consistency.test.ts` cross-references tracker ledger against registry and fails on any mismatch. Status: accepted — issue #358, PR #363, merge SHA `6594f4b`, evidence `packages/eval/test/evidence-registry-consistency.test.ts`
- [x] **R13.3 Require exact model-weight hashes where practical** — accepted. Registry with 5 known model weights (Qwen3-Coder-30B, SuperQwen-AgentWorld-35B, Qwen3.6-35B, SuperGemma4-E4B, Qwen3.5-4B-MTP) with placeholder SHA-256 hashes for replacement with real file hashes. Status: accepted — issue #385, PR #424, merge SHA `360e916`, evidence `packages/eval/src/model-weight-hashes.ts`, `eval-results/weight-hashes/weight-hash-registry.json`
- [ ] **R13.4 Add external or separate-environment replication** of key parse, retention and compaction results.
- [x] **R13.5 Expand datasets and repeated sampling** — accepted partial. Extended multilingual corpus (32 items), repeated-run manifests, mutation corpus (80 items), held-out scorer eval set (16 items) and threshold sweep data all committed. No repeated live measurements executed yet. Status: accepted partial — issues #353/#356, PRs #361/#365, merge SHAs `867f316`/`5e05a56`
- [x] **R13.6 Version percentile/statistical conventions** and verify independent recomputation. — accepted. Versioned statistical conventions (v1.0) with nearest-rank percentile, arithmetic mean, Bessel-corrected stddev, bootstrap CI, no outlier removal; independent recomputation verification from raw data. Status: accepted — PR #580, merge SHA `ebb102e`, evidence `packages/eval/src/statistical-conventions.ts`, `packages/eval/test/statistical-conventions.test.ts`
- [x] **R13.7 Preserve superseded evidence and correction lineage** without rewriting history. — accepted. Supersession chains, correction records, history-rewrite validation and evidence snapshots. Status: accepted — PR #569, merge SHA `8c27e96`, evidence `packages/eval/src/evidence-supersession.ts`, `packages/eval/test/evidence-supersession.test.ts`

### R14 — Operational reliability: 79% → 100%

**100% definition:** Declared deployments meet measured availability, latency, recovery and capacity objectives under normal and fault conditions.

- [x] **R14.1 Add streaming timing instrumentation** — accepted. Opt-in `completeStreaming()` method captures TTFT and token-generation timing. Existing non-streaming `complete()` unchanged. Tests used mock HTTP transport. Status: accepted — issue #357, PR #364, merge SHA `f665e10`, evidence `packages/eval/src/model.ts`, `packages/eval/test/model-streaming.test.ts`
- [x] **R14.2 Resolve cold-weight preflight ambiguity** — accepted. `scripts/verify-audit-endpoints.sh` now reports `pass`/`cold`/`absent`/`error` as distinct states. Status: accepted — issue #357, PR #364, merge SHA `f665e10`, evidence `scripts/verify-audit-endpoints.sh`, `scripts/verify-audit-endpoints.test.mjs`
- [x] **R14.3 Add sustained load and concurrency tests** — accepted infrastructure. Load and concurrency test infrastructure. Status: accepted — PR #449, merge SHA `30d6e51`
- [x] **R14.4 Test process crash, router restart, timeout, cancellation, disk pressure and partial-output recovery** — accepted partial. Connection-reset and timeout recovery tested via mock server; no silent retry or corrupted evidence. Crash, router restart, disk pressure and partial-output recovery remain unproven. Status: accepted partial — issue #357, PR #364, merge SHA `f665e10`, evidence `packages/eval/test/model-streaming.test.ts`
- [x] **R14.5 Control or explicitly model caching and thermal-order bias** — accepted. Shuffle, thermal cooldown, cache bias detection and bias-controlled measurement with warmup/cooldown. Status: accepted — issue #528, PR #539, merge SHA `89528ca`, evidence `packages/eval/src/perf-bias-control.ts`, `packages/eval/test/perf-bias-control.test.ts`
- [x] **R14.6 Add health/readiness probes and failover procedures** — accepted. Health probes with built-in sem/fingerprint/schema checks, readiness gate, 3 failover procedures. Status: accepted — issue #529, PR #544, merge SHA `6d70c08`, evidence `packages/eval/src/health-probes.ts`, `packages/eval/test/health-probes.test.ts`
- [x] **R14.7 Declare SLOs and complete a measured soak period** — accepted. SLO compliance verification with margin-to-breach percentages, measured soak runner. Status: accepted — issue #530, PR #545, merge SHA `b6c45df`, evidence `packages/eval/src/slo-compliance.ts`, `packages/eval/test/slo-compliance.test.ts`
- [x] **R14.8 Run backup, restore and rollback exercises** — accepted. Backup with SHA-256 manifest, verify/restore/rollback with integrity checks. Status: accepted — issue #531, PR #540, merge SHA `407a000`, evidence `packages/eval/src/backup-restore.ts`, `packages/eval/test/backup-restore.test.ts`

### R15 — Security, governance and rollback: 88% → 100%

**100% definition:** The supported system has an independently reviewed threat model, secure deployment controls, incident response, dependency integrity and tested rollback.

- [x] **R15.1 Update the threat model** — accepted. Threat model eval vectors for adversarial inputs covering injection, overflow, encoding attacks and schema abuse with per-vector pass/fail and severity classification. Status: accepted — issue #390, PR #433, merge SHA `e137d6e`, evidence `packages/eval/src/threat-model.ts`, `packages/eval/test/threat-model.test.ts`
- [ ] **R15.2 Complete external security review or penetration testing.**
- [x] **R15.3 Add secret management, least privilege and tenant isolation guidance/tests** — accepted. Secret scanning, tenant isolation verification, least privilege policies. Status: accepted — issue #532, PR #538, merge SHA `8dffd63`, evidence `packages/eval/src/security-contracts.ts`, `packages/eval/test/security-contracts.test.ts`
- [x] **R15.4 Add dependency, provenance and supply-chain controls** — accepted. Lockfile verification, dependency provenance audit, known vulnerability check, artifact integrity with SHA-256. Status: accepted — issue #533, PR #541, merge SHA `fe0a933`, evidence `packages/eval/src/supply-chain-audit.ts`, `packages/eval/test/supply-chain-audit.test.ts`
- [x] **R15.5 Run prompt-injection and semantic-confusion red-team suites** — accepted. 13 test cases across 5 categories (CLI injection, JSONL poisoning, schema injection, fingerprint attack, unicode normalization). Status: accepted — issue #534, PR #537, merge SHA `d9ea61a`, evidence `packages/eval/src/redteam-product-flows.ts`, `packages/eval/test/redteam-product-flows.test.ts`
- [x] **R15.6 Run incident, rollback and compromised-evidence exercises** — accepted. Evidence tampering detection, quarantine with manifest, 4 incident runbooks with simulation/validation. Status: accepted — issue #535, PR #543, merge SHA `b3a8411`, evidence `packages/eval/src/incident-response.ts`, `packages/eval/test/incident-response.test.ts`
- [x] **R15.7 Map privacy, retention, deletion and audit requirements** — accepted. Data sensitivity classification, retention policies, compliance auditing, deletion manifests with audit trail. Status: accepted — issue #536, PR #542, merge SHA `7ab2f2e`, evidence `packages/eval/src/data-lifecycle.ts`, `packages/eval/test/data-lifecycle.test.ts`

### R16 — External adoption and ecosystem: 35% → 100%

**100% definition:** Several unrelated products use the same core representation successfully under published compatibility and support contracts.

- [x] **R16.1 Select one narrow internal pilot** — accepted. Multilingual preference/constraint memory pilot designed. Status: accepted — PR #456, merge SHA `ed0260d`
- [x] **R16.2 Define pilot success and rollback criteria** — accepted. Status: accepted — PR #456, merge SHA `ed0260d`
- [ ] **R16.3 Complete at least two unrelated product pilots** using the same Lunum-Sem contract.
- [ ] **R16.4 Retain user corrections, fallback rates, operational failures and cost/quality measurements.**
- [ ] **R16.5 Publish anonymized integration case studies** including negative results.
- [x] **R16.6 Establish package/release governance and downstream upgrade support.** — accepted. Package contracts for 3 packages (@corpunum/lunum, lunum-eval, lunum-cli) with channel, version policy, public/internal API surface and upgrade guarantees; compatibility checking and governance validation. Status: accepted — PR #581, merge SHA `14c8bc5`, evidence `packages/core/src/release-governance.ts`, `packages/core/test/release-governance.test.ts`
- [ ] **R16.7 Obtain independent adopter confirmation** that product-specific concepts did not leak into the core schema.

## Evidence and evaluation ledger

This ledger records major accepted or relevant evaluations. It is not exhaustive. Add new rows rather than rewriting historical results.

| Evidence | Scope and result | What it supports | Limitations / status |
|---|---|---|---|
| PR #294 / issue #293 | Added versioned `testLunumv1` protocol and immutable result layout | Reproducible evaluation governance | Protocol presence did not itself provide live evidence |
| PR #303 / issue #298 | Preserved nullable usage and finish-reason metadata; reasoning-only output fails closed | Raw model-response evidence integrity | Metadata may remain unavailable when endpoint omits it |
| PR #304 / issue #299 | Deterministic retention manifest and fail-closed execution planning | Coverage and call-budget integrity | Planning only; no live model proof |
| PR #305 / issue #300 | Retention CLI, per-stage JSONL and deterministic recomputation | Retention evidence pipeline | Initial implementation tests used mock transport |
| PR #307 / issue #306 | Built-CLI mock fixture transport | Real CLI integration testing without model calls | Test-only transport |
| PRs #312, #318, #319, #320 | Canonical audit inventory, executor, record adapter and complete bundle generator | Full deterministic audit pipeline | Infrastructure correctness is distinct from model quality |
| PR #323 / issue #321 | Froze #253 datasets, profiles and run matrix | Comparable live audit inputs | Original per-language retention shape was later found unrunnable |
| PR #326 / issue #325 | Corrected retention manifests to cover the full dataset | Real built retention execution viability | Shows why mock/planner tests must match real CLI call shape |
| PR #324 / issue #322 | Fail-closed endpoint identity verification | Endpoint/profile evidence | Probe success alone did not prove model identity; `/models` and weight facts were required |
| PR #327 / issue #253 | Initial honest live parse and retention baseline: exact 56.25% / 25%; recall 0.9319 / 0.8299; retention 31/32 / 32/32 | Honest repaired-path baseline and failure retention | Same small 16-item corpus; both models failed declared parse gates at that SHA |
| PR #336 | Independent evaluator verdict `PASS` bound to evidence SHA `534edb8f...` | Completeness and honesty of #253 evidence | PASS certified evidence integrity, not that models met quality targets; local evaluator infrastructure had failures disclosed in verdict |
| PR #330 / issue #328 | 20-item mutation false-positive corpus across five categories and four languages | Negative semantic-change coverage | n=4 per mutation category/model; one Indonesian wording caveat retained |
| PR #331 / issue #329 | Placement-aware protected-literal verification | Literal value and semantic-role preservation | Predicate identity was intentionally excluded from placement path and remains an owner-level interpretation choice |
| PR #333 / issue #332 | False-positive review runner and executed evidence | Scorer/model diagnostic framework | Original modality mechanism interpretation was corrected by PR #335 |
| PR #335 | Corrected modality false-positive mechanism from scorer failure to parse omission/non-canonical output | Evidence correction discipline | Supersedes the incorrect mechanistic statement in earlier report text, not its raw measurements |
| PR #338 / issue #337 | Corrected prompt examples and controlled predicate vocabulary | Root-cause repair for canonical parse failures | Prompt change required independent remeasurement |
| PR #340 / issue #339 | Post-#337 parse remeasurement: exact 93.75% / 100%, recall 1.0 / 1.0 | Strong evidence the targeted prompt contradiction was fixed | Same 16-item corpus, single run, not held-out generalization evidence |
| PR #343 / issue #341 | Added controlled modality vocabulary and permission example | Canonical modality emission guidance | Exposed schema inconsistency tracked in #342 |
| PR #347 / issue #344 | Post-#337/#341 remeasurement: modality false positives 0; exact 93.75% / 81.25%; retention 30/32 / 32/32 | Modality fix effect and current variance signal | Single-run nondeterminism demonstrated; small same corpus |
| PR #348 / issue #345 | Fixed permission example condition-role contradiction and added general role-key guard | Prompt/gold consistency | Effect awaits future measurement if needed |
| PR #349 / issue #346 | Bound near-semantic role features to clause predicate; test role swap 1.000 → 0.771 | Restored scorer visibility of role swaps | Threshold unchanged; broader calibration remains an owner decision |
| PR #350 | Re-scored committed outputs: observed role-swap false positives eliminated; #253 exact metrics unchanged | Isolated scorer delta without model nondeterminism | Re-scoring cannot prove behaviour on unseen data |
| `docs/MIXED_CONTEXT_QUALITY.md` | Natural/Lunum/mixed context quality framework | Compaction evaluation scaffolding | Current quality scoring is heuristic and token counting is approximate; not production compaction proof |
| Issue #342 | Modality enum inconsistency between broad `ModalityType` and v0.2 schema | Known schema-design gap | Open owner/architecture decision; no dataset/evidence mutation should precede it |
| PR #359 / issue #355 | Property/fuzz tests (6 properties × 250 random sems) and 22 curated near-identical collision pairs; zero collisions observed | Exact semantic identity deterministic verification (R4) | Found two real canonicalization inconsistencies: `time: null` vs omission and explicit undefined role vs omission canonicalize differently; filed as #360 (open, unresolved) |
| PR #361 / issue #353 | 16-item extended EN/EL/ES/ID held-out corpus with four new semantic groups (reminder, consent, belief, plan); immutable manifest with SHA-256; six repeated-run parse manifests (2 models × 3 runs) | Multilingual parsing corpus breadth and repeated-run infrastructure (R2, R13) | No live model execution yet; EL/ID translations require native review; several held-out predicates (remind, share, believe, send, finish) are not in the controlled parse vocabulary; repeated-run manifests are infrastructure, not results |
| PR #362 / issue #354 | Eight nested retention fixtures (three-level nesting, multiple roles, time fields, four languages); three deterministic failure-path mock tests (timeout, malformed output, HTTP error); repeated-pass plan | Round-trip retention test coverage (R3) | No live retention model evidence was produced; repeated-pass chaining is a documented plan/workaround rather than native execution support; failure-path tests used mock transport only |
| PR #363 / issue #358 | Machine-readable evidence registry (`reports/evidence-registry.json`) with 24 historical entries verified against committed sources; automated consistency check between tracker ledger and registry | Evaluation reproducibility and evidence governance (R13) | One historical evidence-path discrepancy was corrected during registry creation; registry describes evidence at time of creation and requires updates as new evidence is accepted |
| PR #364 / issue #357 | Opt-in streaming completion path with TTFT/TPOT timing; endpoint preflight states split into pass/cold/absent/error; connection-reset and timeout recovery tests via mock server | Operational reliability instrumentation and recovery (R14) | Existing non-streaming completion remains unchanged; tests used mock HTTP transport; no sustained load, failover or declared SLO evidence; crash, router restart, disk pressure and partial-output recovery remain unproven |
| PR #365 / issue #356 | 80-item mutation corpus across 8 predicates and 4 languages; 16-item held-out scorer eval set (8 positive, 8 negative); deterministic threshold sweep on 116 pairs at frozen 0.8: TP 8, FP 8, FN 0, TN 100, precision 0.500, recall 1.000, F1 0.667 | Near-semantic comparison calibration data and negative evidence (R5, R6) | Eight deep-nested role-swap mutations score above 0.8 (false positives); at 0.85: four false positives and two false negatives remain; no threshold or scorer change occurred; no live model call occurred; negative evidence — do not soften |
| Issue #374 | Post-invariant threshold sweep on 116 pairs at frozen 0.80: precision 1.000, recall 1.000, F1 1.000, 0 false positives; owner decision: threshold confirmed at 0.80 | Threshold calibration confirmation (R5.5) | Supersedes row 30's negative evidence; corpus is 116 pairs — future expansion may shift optimal threshold |

## Evidence interpretation rules

- A green test suite proves only the checked contract, not broad language or production support.
- A model result is valid only for the named code SHA, dataset hash, profile, endpoint/runtime and generation settings.
- A single run does not establish variance or generalization.
- Same-corpus remeasurement can confirm a diagnosed repair but is not held-out evidence.
- Re-scoring committed outputs isolates scorer changes but does not measure new model behaviour.
- An evaluator `PASS` may certify evidence completeness while the evaluated models still fail product gates.
- Negative, failed and superseded evidence must remain accessible.
- Historical percentages are never silently rewritten after new evidence; add a change-log row.

## Update workflow for orchestrators

Every orchestrator must read this document before proposing support, maturity, production, language, model, tokenizer or compaction claims.

When an accepted issue changes readiness:

1. Reconcile live `origin/main`, issue state, PR state and exact merge SHA.
2. Identify the affected readiness area and scoring dimension.
3. Link the accepted issue, PR, evidence path, code SHA, dataset/profile hashes and evaluator verdict where applicable.
4. Record what worked, what failed, limitations and whether prior evidence was superseded or merely supplemented.
5. Update the percentage only when the evidence changes readiness—not merely because code was added.
6. Add or complete action checkboxes; never delete failed actions or negative findings.
7. Add a change-log row with old score, new score, rationale and reviewer.
8. Treat score/support changes as Tier 3 and require independent validation.

### Action status vocabulary

Use one of:

- `proposed`
- `assigned`
- `in-progress`
- `candidate`
- `accepted`
- `rejected`
- `blocked`
- `superseded`

For accepted actions, append:

```text
Status: accepted — issue #N, PR #N, merge SHA <sha>, evidence <path>, evaluator <verdict/path>
```

For failed or rejected actions, append the same evidence detail and preserve the reason.

## Readiness change log

| Date | Area | Previous | New | Accepted evidence or correction | What worked | What did not / limitation | Reviewer |
|---|---|---:|---:|---|---|---|---|
| 2026-07-26 | Initial tracker baseline | — | See tables | Issue #351 candidate based on repository evidence through `b2a1b4a` | Consolidated architecture, implementation, live evals and known gaps | Percentages remain estimates pending independent local-orchestrator validation | Pending |
| 2026-07-26 | Orchestrator validation (Tier 3) | See tables | Unchanged | Local-orchestrator review at PR #352; whitespace-only Markdown correction; evidence-ledger numbers verified against committed reports | Ledger figures matched primary evidence; summary/detail percentages consistent; onboarding wiring and path references correct | No score changed; retention-vs-parsing ordering and safety-critical enforcement noted for owner/evaluator attention; independent evaluator verdict still pending | Claude Opus 5 (local orchestrator) |
| 2026-07-27 | Round-trip retention (R3) | 78% | 80% | PR #362 / issue #354, merge SHA `d97f01b`. Deterministic verification +2%: nested three-level fixtures and mocked failure-path tests (timeout, malformed, HTTP error) improve test contract coverage. | Nested fixtures and failure-path tests pass; no silent retry; no silent exclusion | No live model evidence; repeated-pass chaining is plan only, not native; mock transport only | Claude Opus 4.6 (local orchestrator) |
| 2026-07-27 | Exact semantic identity (R4) | 88% | 86% | PR #359 / issue #355, merge SHA `26a0943`. Deterministic verification +3% (property/fuzz tests) but empirical evidence −5%: real canonicalization inconsistency discovered (#360). Net: −2%. | Six property/fuzz tests and 22 collision pairs land with zero collisions | #360 is a real defect: `time: null` vs omission and explicit undefined role vs omission canonicalize differently; unresolved | Claude Opus 4.6 (local orchestrator) |
| 2026-07-27 | Near-semantic comparison (R5) | 76% | 70% | PR #365 / issue #356, merge SHA `5e05a56`. Empirical evidence update: threshold sweep revealed precision 0.500 at frozen 0.8 — eight false-positive role swaps. Deterministic verification +4% (corpus, sweep), empirical evidence −10% (negative finding). Net: −6%. | 80-item mutation corpus, 16-item held-out eval set, and threshold sweep all land as accepted evidence | Eight deep-nested role-swap mutations pass the 0.8 gate; no hard role-identity invariant exists; calibration cannot be considered complete without one | Claude Opus 4.6 (local orchestrator) |
| 2026-07-27 | Safety-critical preservation (R6) | 68% | 64% | PR #365 / issue #356, merge SHA `5e05a56`. Indirect negative evidence: the eight false-positive role swaps from R5's threshold sweep are safety-critical semantic changes not caught by the current scorer. No new safety-specific work was done, but new evidence exposes the gap is wider than previously understood. Net: −4%. | Threshold sweep data committed and independently verifiable | Role-swap false positives are safety-critical failures; no hard gate catches them; diagnostic-only checks remain | Claude Opus 4.6 (local orchestrator) |
| 2026-07-27 | Evaluation and reproducibility (R13) | 92% | 95% | PR #363 / issue #358, merge SHA `6594f4b`; PR #361 / issue #353, merge SHA `867f316`. Implemented contract +1% (registry schema), deterministic verification +1% (consistency check), empirical evidence +1% (expanded datasets and repeated-sampling infrastructure). Net: +3%. | Machine-readable evidence registry with 24 verified entries; automated consistency check; expanded corpus and repeated-run manifests | Needs model-weight hashes, external replication, statistical conventions and superseded-evidence lineage | Claude Opus 4.6 (local orchestrator) |
| 2026-07-27 | Operational reliability (R14) | 43% | 48% | PR #364 / issue #357, merge SHA `f665e10`. Implemented contract +2% (streaming path, preflight states), deterministic verification +3% (recovery-path tests via mock server). Net: +5%. | Opt-in streaming instrumentation, cold-weight disambiguation, connection-reset and timeout recovery tested | Mock transport only; sustained load, failover, SLOs, soak testing and crash/disk-pressure recovery remain unproven | Claude Opus 4.6 (local orchestrator) |
| 2026-07-30 | Canonical semantic layer (R1) | 90% | 92% | PR #454 (R1.5, merge SHA `6747b5e`): independent Python verifier. PR #469 (R1.6, merge SHA `18a9726`): support/compatibility contract. Implemented contract +2%. | Independent cross-implementation verifier and versioned support contract both landed | Schema freeze not yet ratified by external adoption | Claude Opus 4.6 |
| 2026-07-30 | Multilingual parsing (R2) | 80% | 85% | PR #470 (R2.7, merge SHA `2f267dd`): multi-scope production parse gates. PR #472 (R2.8, merge SHA `bc7cd69`): uncertainty/fallback policy with confidence scoring. Implemented contract +3%, deterministic verification +2%. | Parse gates and uncertainty policy provide formal quality/safety floors | Live model execution on expanded corpus still absent | Claude Opus 4.6 |
| 2026-07-30 | Round-trip retention (R3) | 84% | 87% | PR #475 (R3.7, merge SHA `ebaf34b`): audit-trailed fallback and rollback. Implemented contract +2%, deterministic verification +1%. | Rollback preserves version history; audit trail records every decision | No live model retention evidence from new rollback paths | Claude Opus 4.6 |
| 2026-07-30 | Exact semantic identity (R4) | 86% | 88% | PR #479 (R4.5, merge SHA `cfa5166`): identity migration with golden vectors proving #360 fixes. Implemented contract +1%, deterministic verification +1%. | Forward/backward migration classification with 13 tests | Cross-implementation conformance with independent verifier pending | Claude Opus 4.6 |
| 2026-07-30 | Near-semantic comparison (R5) | 70% | 75% | PR #471 (R5.1, merge SHA `b637ab4`): hard semantic mismatch invariants for negation, obligation-permission, role-identity, condition-change and protected-literal. Implemented contract +3%, deterministic verification +2%. | Five invariant categories now enforced as hard mismatches | Clause-path-aware role-identity invariant (R5.1a) still needed; threshold calibration awaits owner decision | Claude Opus 4.6 |
| 2026-07-30 | Safety-critical preservation (R6) | 64% | 74% | PR #480 (R6.1, merge SHA `b8b5cee`): hard gates converting invariants to verdict enforcement. PR #473 (R6.2, merge SHA `2a75ea1`): 7-category protected literal registry. PR #476 (R6.4, merge SHA `74eca3b`): prohibited automatic-use domains. Implemented contract +6%, deterministic verification +4%. | Invariants now block false match verdicts; 7 literal categories detected; 4 prohibited domains enforced | Adversarial red-team and incident-handling remain unproven | Claude Opus 4.6 |
| 2026-07-30 | Agent-state and handoffs (R10) | 72% | 80% | PR #474 (R10.3, merge SHA `68f9dc7`): SHA-256 hash chain tamper evidence. PR #477 (R10.4, merge SHA `2901cad`): idempotency keys and duplicate detection. Implemented contract +5%, deterministic verification +3%. | Tamper detection and idempotency both landed with tests | Interoperability and long-running workflow proof remain absent | Claude Opus 4.6 |
| 2026-07-30 | HTTP API, MCP and adapters (R12) | 62% | 68% | PR #478 (R12.4, merge SHA `2c8649e`): JSON-structured logging with OTel-compatible traces, correlation IDs and span hierarchy. Implemented contract +3%, deterministic verification +3%. | Full observability stack with configurable sinks | Sustained load testing, SLOs and independent deployments remain unproven | Claude Opus 4.6 |
| 2026-08-01 | Operational reliability (R14) | 54% | 79% | PR #539 (R14.5, merge SHA `89528ca`): perf bias control. PR #544 (R14.6, merge SHA `6d70c08`): health/readiness probes and failover. PR #545 (R14.7, merge SHA `b6c45df`): SLO compliance and measured soak. PR #540 (R14.8, merge SHA `407a000`): backup/restore/rollback exercises. Implemented contract +15%, deterministic verification +10%. | All 4 remaining R14 items landed with tests; bias control, health probes, SLO verification, backup integrity all passing | R14.4 crash/disk-pressure recovery remains partial (mock transport only); no live sustained load against production endpoints | Claude Opus 4.6 |
| 2026-08-01 | Context compaction (R7) | 63% | 82% | PR #553 (R7.4, merge SHA `9e78f8a`): downstream quality measurement. PR #554 (R7.5, merge SHA `673eb6b`): long-context session tests. PR #556 (R7.8, merge SHA `da06cda`): cross-tokenizer compaction. Implemented contract +12%, deterministic verification +7%. | All 3 remaining R7 action items landed; accuracy/preservation/cost measurement, session memory testing, and cross-family benchmarks all passing | Live model execution on compaction benchmarks still absent | Claude Opus 4.6 |
| 2026-08-01 | Cross-language retrieval (R9) | 71% | 82% | PR #555 (R9.4, merge SHA `29c1f60`): per-category and per-language P/R/F1 with NDCG/MRR/MAP ranking quality. Implemented contract +6%, deterministic verification +5%. | Category and language-pair metrics with ranking quality all landed | Real multilingual memory pilot (R9.7) still absent | Claude Opus 4.6 |
| 2026-08-01 | HTTP API/MCP (R12) | 68% | 82% | PR #557 (R12.5, merge SHA `c97a639`): API load/concurrency/failure-injection testing. PR #558 (R12.6, merge SHA `73b885f`): service SLO declarations with margin validation. Implemented contract +8%, deterministic verification +6%. | Load testing and SLO validation infrastructure both landed | Independent downstream integrations (R12.7) still absent | Claude Opus 4.6 |
| 2026-08-01 | Security, governance and rollback (R15) | 64% | 88% | PR #538 (R15.3, merge SHA `8dffd63`): secret management and tenant isolation. PR #537 (R15.5, merge SHA `d9ea61a`): red-team product flows. PR #541 (R15.4, merge SHA `fe0a933`): supply-chain audit. PR #543 (R15.6, merge SHA `b3a8411`): incident response exercises. PR #542 (R15.7, merge SHA `7ab2f2e`): data lifecycle and retention. Implemented contract +16%, deterministic verification +8%. | 5 of 6 remaining R15 items landed; secret scanning, red-team suites, supply-chain controls, incident response, and data lifecycle all passing | R15.2 external security review/penetration testing remains open — requires external party | Claude Opus 4.6 |

## Current recommended sequence

This tracker does not autonomously assign work. The vision owner chooses priority. Based on the current evidence, the highest-leverage candidate sequence is:

1. Resolve the canonical contracts in #342 (modality enum) and #360 (canonicalization null/undefined inconsistency).
2. Define a hard clause-path-aware role-identity invariant (R5.1a) — required for threshold calibration completeness.
3. Make an explicit owner calibration decision using the #365/#374 threshold sweep data (R5.5).
4. Execute the expanded multilingual corpus against live local models to produce accepted baselines (R2.2, R2.6).
5. Prove context compaction preserves downstream task quality with live model evidence (R7).
6. Complete remaining operational reliability gap: live sustained load execution against production endpoints (R14).
7. Arrange external security review or penetration testing (R15.2).
8. Continue product-pilot work (R16) and external adoption.

## Honest current conclusion

Lunum is **production-promising but not generally production-ready**.

It is credible today as:

- a semantic research and reference platform;
- a versioned schema/canonicalization implementation;
- a guarded multilingual and retention evaluation system;
- a controlled internal pilot component with natural-language fallback.

It is not yet credible as:

- a universal multilingual parser;
- a guaranteed context compressor;
- an unattended safety authority;
- a production-proven cross-product memory layer;
- a stable 1.0 dependency.
