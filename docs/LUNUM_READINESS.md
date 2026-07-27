# Lunum readiness and evidence tracker

> **Status:** accepted living baseline — Phase 1 evidence reconciled under [issue #366](https://github.com/corpunum/OpenLunum/issues/366)
>
> **Last reconciled:** 2026-07-27
>
> **Repository baseline:** `5e05a56879a7feea646db422d8844420a4d2ddb4`
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
| Research/reference platform | **88%** | Strong architecture, reference implementation, guarded experiments and reproducible evidence | Suitable for semantic research, controlled evaluations, schema work and bounded engineering |
| Controlled internal pilot | **68%** | Several core paths are usable when the domain is narrow and natural-language fallback is mandatory | Requires monitoring, explicit supported inputs, rollback and human review for consequential use |
| General production dependency | **42%** | Important foundations exist, but broad operational, security, adoption and compatibility proof is missing | Not suitable as an unattended universal parser, safety authority or guaranteed context compressor |

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
| Canonical semantic layer | **86%** | Strict TypeScript semantic structures, canonicalization, provenance, versioned 0.1/0.2 schemas and migration tooling; modality enum widened to full `ModalityType` vocabulary (#368) | Pre-1.0 contract | `README.md`, `STATUS.md`, migration/conformance tests, #342, #368 |
| Multilingual parsing | **74%** | Real built-CLI EN/EL/ES/ID runs on two named local models; controlled vocabulary and schema-bearing prompts; extended 32-item corpus and repeated-run manifests | Small same-corpus evidence, four languages, two models, demonstrated single-run variance; extended corpus predicates not in controlled vocabulary; EL/ID translations need native review; repeated-run manifests exist but measurements have not run | #253/#327, #337/#338, #339/#340, #341/#343, #344/#347, #353/#361 |
| Round-trip semantic retention | **80%** | Manifest-driven realization plus parse-back, raw per-stage evidence, fail-closed coverage, deterministic aggregation, nested three-level fixtures and deterministic failure-path tests | Small narrow matrix; validation failures still occur; little long-context/domain evidence; repeated-pass chaining is a documented plan, not native execution; no live retention model evidence from new fixtures | #299/#304, #300/#305, #306/#307, #253/#327, #344/#347, #354/#362 |
| Exact semantic identity | **86%** | Canonical serialization, exact fingerprints, path-aware comparison, migration checks, property/fuzz tests (6 properties × 250 random sems) and 22 curated collision pairs | Pre-1.0 contract; #360 canonicalization inconsistency (`time: null` vs omission, explicit undefined role vs omission); cross-implementation conformance still absent | `packages/core`, golden/conformance tests, `STATUS.md`, #355/#359, #360 |
| Near-semantic comparison | **70%** | Weighted semantic comparison, separate exact/near outcomes, clause-bound role features, 80-item mutation corpus across 8 predicates, held-out scorer eval set, and deterministic threshold sweep | Threshold sweep at frozen 0.8 shows precision 0.500 / recall 1.000 / F1 0.667 — eight deep-nested role-swap mutations score above 0.8; no hard role-identity invariant exists; threshold calibration remains an explicit owner decision | #328/#330, #332/#333, #346/#349, #350, #356/#365 |
| Safety-critical preservation | **64%** | Negation, modality, extra-clause, literal and role mutation evidence; placement-aware protected literals | Several checks remain diagnostic rather than hard product invariants; threshold sweep confirmed eight role-swap false positives pass the 0.8 gate — safety-critical role swaps are not caught; limited domain red-teaming | #328/#330, #329/#331, #332/#333, #335, #346/#349, #356/#365 |
| Context compaction and token savings | **36%** | Renderer profiles, context compiler, natural/Lunum/mixed modes and token/compaction fields exist | Current mixed-context quality is heuristic and token estimation is not sufficient production evidence | `docs/MIXED_CONTEXT_QUALITY.md`, renderer tests, testLunumv1 protocol |
| Model-specific rendering | **62%** | Safe/short/tight render profiles, golden preservation tests, model/tokenizer profile concepts | Few named model-family efficiency studies and no automatic evidence-backed profile selection | `README.md`, `STATUS.md`, renderer/profile tests |
| Cross-language memory and retrieval | **45%** | Fingerprints, retrieval measurement infrastructure and accepted conditions for curated semantic groups | Runtime trust, broad precision/recall, false-equivalence and product retrieval evidence remain limited | #256 decision, historical cross-lingual retrieval module, testLunumv1 cross-lingual inventory |
| Agent-state and handoffs | **60%** | Typed plans, steps, tool calls, results, constraints, evidence and handoffs with validation | Mostly a reference protocol; limited replay, recovery, access-control and multi-product interoperability proof | `docs/AGENT_STATE_PROTOCOL.md`, core agent-state tests |
| CLI integration | **55%** | Inspect, encode, migrate and quality-gate paths with fail-closed validation and atomic writes | Explicitly prototype; production error handling, streaming, packaging and platform support remain incomplete | `packages/cli/README.md`, CLI tests |
| HTTP API, MCP and adapters | **48%** | HTTP, MCP and OpenUnum adoption paths exist | Authentication, tenancy, rate limits, SLOs, version negotiation and independent deployments are unproven | `README.md`, `STATUS.md`, package integration tests |
| Evaluation and reproducibility | **95%** | Versioned protocol, manifests, hashes, raw JSONL, deterministic bundles, error taxonomy, exact-SHA evaluation, machine-readable evidence registry with automated consistency checking, expanded datasets and repeated-sampling infrastructure | Needs exact model-weight hashes, external replication, statistical conventions and superseded-evidence lineage | #293/#294, #295-#315, #321-#336, `docs/evaluation/testLunumv1/`, #353/#361, #358/#363 |
| Operational reliability | **48%** | Endpoint verification, one-shot workers, thermal watchdogs, bounded calls, explicit failures, opt-in streaming with TTFT/TPOT capture, pass/cold/absent/error preflight states, and mock-transport recovery-path tests | Shared-GPU bias, sustained-load, failover, SLOs, soak testing and crash/disk-pressure recovery remain unproven; recovery tests used mock transport only | #272/#289, #296/#297, #301/#302, #316/#317, #322/#324, #357/#364 |
| Security, governance and rollback | **57%** | Protected-data boundaries, prompt-injection/safety tests, rollback/compatibility docs and exact-head merge controls | No external security assessment, tenant isolation proof, production incident drills or compliance mapping | `STATUS.md`, repository operating model, CI policies |
| External adoption and ecosystem | **20%** | Multiple integration surfaces make pilots possible | No accepted evidence that several unrelated products use the same core representation in production-like conditions | `VISION.md`, `README.md`, adapter paths |

## Actions required to reach 100% by area

Every action below remains open unless an accepted issue/PR/evidence reference is recorded beside it. Completed actions must retain both positive and negative results.

### R1 — Canonical semantic layer: 86% → 100%

**100% definition:** A stable Lunum 1.0 semantic contract exists for a declared scope, with authoritative vocabulary, migration paths, independent conformance and a published compatibility window.

- [x] **R1.1 Resolve #342** — accepted. Owner decision: v0.2 `clauses[].modality` widens to the full `ModalityType` vocabulary (`fact`, `opinion`, `belief`, `possibility`, `necessity`, `obligation`, `permission`, `ability`, `intention`, `certainty`, `null`), matching `packages/core/src/typed-structures.ts` and `MODALITY_VALUES` in `packages/eval/src/predicate-vocabulary.ts`. v0.1 free-string modality is unchanged. Status: accepted — issue #368
- [ ] **R1.2 Freeze the 1.0 schema.** Publish versioned JSON Schema, generated TypeScript, normative examples and prohibited ambiguities.
- [ ] **R1.3 Freeze canonicalization and exact fingerprint versions.** Any future change must use a new version and migration policy.
- [ ] **R1.4 Add a large migration/conformance corpus.** Cover forward/backward migration, lossy mappings, unknown fields and failure cases.
- [ ] **R1.5 Produce a second independent implementation or verifier.** Cross-check canonical bytes and fingerprints outside the primary TypeScript path.
- [ ] **R1.6 Publish the support and compatibility contract.** State version lifetime, deprecation process and rollback guarantees.

### R2 — Multilingual parsing: 74% → 100%

**100% definition:** Declared languages and domains meet accepted parse thresholds on held-out, natively reviewed data across named model families and repeated runs, with safe fallback for unsupported or uncertain cases.

- [x] **R2.1 Expand the held-out corpus** — accepted partial. Expanded from 16 to 32 items with four new semantic groups (reminder, consent, belief, plan), still far below the several-hundred target. Status: accepted partial — issue #353, PR #361, merge SHA `867f316`, evidence `datasets/dev/multilingual-extended-v1.jsonl`, `datasets/manifests/multilingual-extended-v1.json`
- [ ] **R2.2 Add native-speaker review** for every supported language and explicitly label untranslated or uncertain fixtures. EL/ID translations from #353 require native review.
- [ ] **R2.3 Expand language coverage** from EN/EL/ES/ID to the owner-approved support set, initially targeting 8–12 languages.
- [x] **R2.4 Expand semantic/domain coverage** — accepted partial. Added reminder, consent, belief and plan groups. Long conditions, tool events, uncertainty, temporal relations, technical text and mixed-language inputs remain. Status: accepted partial — issue #353, PR #361, merge SHA `867f316`
- [ ] **R2.5 Test at least three model families** and multiple sizes/quantizations with immutable profiles.
- [x] **R2.6 Run repeated measurements** — accepted infrastructure only. Six repeated-run manifests exist (`experiments/audit-353-repeated/`), but no measurements have been executed. Status: accepted infrastructure only — issue #353, PR #361, merge SHA `867f316`
- [ ] **R2.7 Define production parse gates** by supported scope, including valid-parse, exact, feature recall/precision, safety invariants and fallback rate.
- [ ] **R2.8 Add uncertainty/fallback policy** that prevents canonical storage when evidence is insufficient.

### R3 — Round-trip semantic retention: 80% → 100%

**100% definition:** Supported records survive realization and parse-back within accepted semantic and safety gates across languages, domains, lengths and model environments, with all failures observable and reversible.

- [ ] **R3.1 Expand retention datasets** to hundreds of records spanning all supported semantic structures.
- [x] **R3.2 Add long and nested records** — accepted partial. Eight nested retention fixtures added with three-level nesting, multiple roles, time fields across four languages. Not broad live evidence. Status: accepted partial — issue #354, PR #362, merge SHA `d97f01b`, evidence `packages/eval/test-fixtures/retention/nested-dataset.json`
- [x] **R3.3 Add repeated realization/parse-back passes** — blocked/partial. Repeated-pass plan documented (`packages/eval/test-fixtures/retention/repeated-pass-plan.json`), but native chained execution support remains absent. Status: blocked/partial — issue #354, PR #362, merge SHA `d97f01b`
- [ ] **R3.4 Define accepted retention gates** for exact, feature, literal, role, negation and modality preservation.
- [x] **R3.5 Exercise timeout, malformed output and endpoint failure paths** — accepted for deterministic mocked failure paths. No silent retry or exclusion. Live endpoint resilience remains unproven. Status: accepted — issue #354, PR #362, merge SHA `d97f01b`, evidence `packages/eval/test/retention-failure-paths.test.ts`
- [ ] **R3.6 Prove deterministic recomputation** for every production report from raw per-stage JSONL.
- [ ] **R3.7 Validate fallback and rollback** when a round trip fails or becomes ambiguous.

### R4 — Exact semantic identity: 86% → 100%

**100% definition:** Exact identity is frozen, collision-resistant for the declared domain, reproducible across implementations and safely migratable.

**Active defect:** #360 — `time: null` vs omitted `time` and explicit undefined role vs omitted role key canonicalize differently. This is a real inconsistency, not hypothetical, found by #355's property tests and independently reproducible.

- [ ] **R4.1 Publish normative canonical byte vectors** for every supported semantic construct.
- [x] **R4.2 Add property/fuzz tests** — accepted. Six properties × 250 random sems covering ordering, Unicode, numerics, nullability, nested clauses and references. Status: accepted — issue #355, PR #359, merge SHA `26a0943`, evidence `packages/core/test/identity-property-fuzz.test.ts`
- [x] **R4.3 Add collision and accidental-equivalence tests** — accepted partial. 22 curated near-identical collision pairs with zero collisions observed. Not yet a large corpus. Found two real canonicalization inconsistencies filed as #360. Status: accepted partial — issue #355, PR #359, merge SHA `26a0943`, evidence `packages/core/test/identity-collision-corpus.test.ts`, follow-up #360
- [ ] **R4.4 Verify cross-runtime equality** with an independent implementation or verifier.
- [ ] **R4.5 Define identity behaviour across schema migration** and prove it with golden vectors. Must address #360 (`time: null` vs omission, explicit undefined role vs omission) before migration semantics are defined.
- [ ] **R4.6 Freeze the 1.0 fingerprint support contract.**

### R5 — Near-semantic comparison: 70% → 100%

**100% definition:** Similarity is versioned, interpretable and empirically calibrated, while safety-critical semantic changes are caught by explicit invariants rather than a single scalar threshold.

- [ ] **R5.1 Define hard semantic mismatch invariants** for negation, obligation/permission, role swaps, protected literals and condition addition/removal.
- [ ] **R5.1a Define a hard clause-path-aware role-identity invariant** or equivalent design that catches deep-nested role swaps before threshold calibration can be considered complete. Required by the eight false positives discovered in #365's threshold sweep.
- [x] **R5.2 Expand the mutation corpus** — accepted. Expanded to 80 items across 8 predicates (prefer/delete/enable/deadline/remind/approve/share/believe), 4 languages and 5 mutation types. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `datasets/adversarial/mutation-false-positive-v2.jsonl`, `datasets/manifests/mutation-false-positive-v2.json`
- [x] **R5.3 Build held-out positive and negative similarity sets** — accepted. 16-item set (8 positive, 8 negative) in an independent domain, not derived from #346's fix. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `datasets/dev/scorer-eval-heldout-v1.jsonl`, `datasets/manifests/scorer-eval-heldout-v1.json`
- [x] **R5.4 Measure ROC/precision-recall and category-specific error rates** — accepted. Deterministic threshold sweep across [0.5–1.0] on 116 pairs (8 positive, 108 negative). At frozen 0.8: TP 8, FP 8, FN 0, TN 100, precision 0.500, recall 1.000, F1 0.667. Eight false-positive role swaps across EN/EL/ES/ID. At 0.85: TP 6, FP 4, FN 2, TN 104, precision 0.600, recall 0.750, F1 0.667. No threshold or scorer change occurred. Status: accepted — issue #356, PR #365, merge SHA `5e05a56`, evidence `reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/`
- [ ] **R5.5 Make threshold calibration an explicit versioned owner decision** with no retroactive rewriting of historical evidence. Data from R5.4 is now available. Requires R5.1a (hard role-identity invariant) before calibration can be considered complete.
- [ ] **R5.6 Add scorer explanation output** showing which features and invariants drove the result.
- [ ] **R5.7 Require independent evaluation** for every scorer, weighting or threshold change.

### R6 — Safety-critical preservation: 64% → 100%

**100% definition:** Supported safety-critical distinctions have explicit fail-closed invariants, adversarial evidence and product-level fallback/approval controls.

- [ ] **R6.1 Convert approved semantic invariants into hard gates** rather than diagnostics only.
- [ ] **R6.2 Expand protected-literal checks** to units, dates, identifiers, ranges, paths, URLs and structured references.
- [ ] **R6.3 Add adversarial suites** for authority, consent, prohibition, exceptions, scope, temporal ordering and nested conditions.
- [ ] **R6.4 Define prohibited automatic-use domains** until legal, medical, financial and destructive-action evidence exists.
- [ ] **R6.5 Add human-review and natural-fallback requirements** for high-risk records.
- [ ] **R6.6 Run independent red-team review** and retain every discovered false positive/negative.
- [ ] **R6.7 Validate rollback and incident handling** when a semantic safety defect is discovered after deployment.

### R7 — Context compaction and token savings: 36% → 100%

**100% definition:** Named renderer profiles produce measured token/cost savings on real tokenizers while preserving downstream task success and safety, with natural fallback whenever compaction is not justified.

- [ ] **R7.1 Replace character-based token estimates** with exact counts from named tokenizers.
- [ ] **R7.2 Benchmark natural vs Lunum vs mixed context** on QA, extraction, instruction following, summarization, reasoning, RAG and multi-step agent tasks.
- [ ] **R7.3 Measure tokens per successful task**, not tokens alone.
- [ ] **R7.4 Measure downstream accuracy, literal/role preservation, latency and monetary cost** per context mode.
- [ ] **R7.5 Test long-context sessions** with retrieval, updates, contradictions and stale memories.
- [ ] **R7.6 Define evidence-backed eligibility rules** for when Lunum, mixed or natural context is selected.
- [ ] **R7.7 Set accepted regression/fallback gates** and prove natural fallback preserves quality.
- [ ] **R7.8 Repeat across named tokenizer/model families** and version every renderer profile.

### R8 — Model-specific rendering: 62% → 100%

**100% definition:** Renderer profiles are versioned, preservation-tested and empirically selected for named tokenizer/model families, with safe fallback and compatibility guarantees.

- [ ] **R8.1 Add accepted profiles** for multiple Qwen, Llama, Gemma and other owner-selected families.
- [ ] **R8.2 Record exact tokenizer/build/template identity** for every profile.
- [ ] **R8.3 Measure semantic retention and downstream quality** for each profile, not token count only.
- [ ] **R8.4 Add profile-selection logic** that uses accepted evidence and rejects unknown environments.
- [ ] **R8.5 Add renderer migration and compatibility tests.**
- [ ] **R8.6 Define fallback behaviour** when the profile is missing, stale or unsupported.

### R9 — Cross-language memory and retrieval: 45% → 100%

**100% definition:** Equivalent supported meanings are retrieved across languages with accepted precision/recall, provenance and false-equivalence controls in real product-like workloads.

- [ ] **R9.1 Implement or revalidate the accepted #256 curated semantic-group design** against current `main`.
- [ ] **R9.2 Add large positive/negative cross-language retrieval datasets** with native review.
- [ ] **R9.3 Compare fingerprint, semantic-group, lexical, embedding and hybrid retrieval** on the same immutable corpus.
- [ ] **R9.4 Measure precision, recall, ranking quality and false equivalence** by language and semantic category.
- [ ] **R9.5 Validate forged, missing, duplicate and wrong-language group identifiers** fail closed.
- [ ] **R9.6 Add freshness, importance and provenance ranking experiments.**
- [ ] **R9.7 Validate in at least one real multilingual memory pilot** with user corrections retained.

### R10 — Agent-state and handoffs: 60% → 100%

**100% definition:** Agent state can be versioned, authenticated, replayed, resumed and exchanged across independent agents/products without ambiguous authority or lost evidence.

- [ ] **R10.1 Freeze an agent-state schema version** with migration rules.
- [ ] **R10.2 Add replay and recovery tests** for partial, failed, abandoned and resumed steps.
- [ ] **R10.3 Add identity, authorization and tamper-evidence requirements** for tool calls and handoffs.
- [ ] **R10.4 Define idempotency and duplicate-delivery behaviour.**
- [ ] **R10.5 Demonstrate interoperability across at least two independent agent implementations.**
- [ ] **R10.6 Add product-level retention, privacy and deletion policies.**
- [ ] **R10.7 Validate long-running workflows and audit reconstruction.**

### R11 — CLI integration: 55% → 100%

**100% definition:** The CLI has a stable versioned interface, production-grade diagnostics, bounded resource behaviour, packaging and platform support.

- [ ] **R11.1 Define stable command, flag, input, output and exit-code contracts.**
- [ ] **R11.2 Add streaming or bounded-memory JSONL processing** for large datasets.
- [ ] **R11.3 Add structured machine-readable errors** alongside human diagnostics.
- [ ] **R11.4 Test supported Linux/macOS/Windows or explicitly narrow platform support.**
- [ ] **R11.5 Publish package installation, upgrade, rollback and migration guidance.**
- [ ] **R11.6 Add end-to-end tests from installed package artifacts**, not source worktrees only.
- [ ] **R11.7 Add performance and failure-injection tests.**

### R12 — HTTP API, MCP and adapters: 48% → 100%

**100% definition:** Supported service and integration surfaces are versioned, secured, observable, load-tested and independently deployed.

- [ ] **R12.1 Define versioned API/MCP contracts** and compatibility policy.
- [ ] **R12.2 Add authentication, authorization and tenant isolation** where the surface is networked or shared.
- [ ] **R12.3 Add rate limits, request-size limits, timeout/cancellation and backpressure.**
- [ ] **R12.4 Add structured logs, metrics, traces and correlation IDs.**
- [ ] **R12.5 Run load, concurrency, restart and failure-injection tests.**
- [ ] **R12.6 Declare and validate service SLOs.**
- [ ] **R12.7 Complete at least two independent downstream integrations.**

### R13 — Evaluation and reproducibility: 95% → 100%

**100% definition:** Every accepted capability claim is linked to immutable, independently reproducible evidence in a canonical registry, including negative and superseded results.

- [x] **R13.1 Create a machine-readable accepted-evidence registry** — accepted. `reports/evidence-registry.json` with 24 historical entries verified against committed sources. One historical path discrepancy corrected during the work. Status: accepted — issue #358, PR #363, merge SHA `6594f4b`, evidence `reports/evidence-registry.json`
- [x] **R13.2 Add automated consistency checks** — accepted. `packages/eval/test/evidence-registry-consistency.test.ts` cross-references tracker ledger against registry and fails on any mismatch. Status: accepted — issue #358, PR #363, merge SHA `6594f4b`, evidence `packages/eval/test/evidence-registry-consistency.test.ts`
- [ ] **R13.3 Require exact model-weight hashes where practical** or document an accepted equivalent identity mechanism.
- [ ] **R13.4 Add external or separate-environment replication** of key parse, retention and compaction results.
- [x] **R13.5 Expand datasets and repeated sampling** — accepted partial. Extended multilingual corpus (32 items), repeated-run manifests, mutation corpus (80 items), held-out scorer eval set (16 items) and threshold sweep data all committed. No repeated live measurements executed yet. Status: accepted partial — issues #353/#356, PRs #361/#365, merge SHAs `867f316`/`5e05a56`
- [ ] **R13.6 Version percentile/statistical conventions** and verify independent recomputation.
- [ ] **R13.7 Preserve superseded evidence and correction lineage** without rewriting history.

### R14 — Operational reliability: 48% → 100%

**100% definition:** Declared deployments meet measured availability, latency, recovery and capacity objectives under normal and fault conditions.

- [x] **R14.1 Add streaming timing instrumentation** — accepted. Opt-in `completeStreaming()` method captures TTFT and token-generation timing. Existing non-streaming `complete()` unchanged. Tests used mock HTTP transport. Status: accepted — issue #357, PR #364, merge SHA `f665e10`, evidence `packages/eval/src/model.ts`, `packages/eval/test/model-streaming.test.ts`
- [x] **R14.2 Resolve cold-weight preflight ambiguity** — accepted. `scripts/verify-audit-endpoints.sh` now reports `pass`/`cold`/`absent`/`error` as distinct states. Status: accepted — issue #357, PR #364, merge SHA `f665e10`, evidence `scripts/verify-audit-endpoints.sh`, `scripts/verify-audit-endpoints.test.mjs`
- [ ] **R14.3 Add sustained load and concurrency tests** across supported endpoints.
- [x] **R14.4 Test process crash, router restart, timeout, cancellation, disk pressure and partial-output recovery** — accepted partial. Connection-reset and timeout recovery tested via mock server; no silent retry or corrupted evidence. Crash, router restart, disk pressure and partial-output recovery remain unproven. Status: accepted partial — issue #357, PR #364, merge SHA `f665e10`, evidence `packages/eval/test/model-streaming.test.ts`
- [ ] **R14.5 Control or explicitly model caching and thermal-order bias** in performance evidence.
- [ ] **R14.6 Add health/readiness probes and failover procedures.**
- [ ] **R14.7 Declare SLOs and complete a measured soak period.**
- [ ] **R14.8 Run backup, restore and rollback exercises.**

### R15 — Security, governance and rollback: 57% → 100%

**100% definition:** The supported system has an independently reviewed threat model, secure deployment controls, incident response, dependency integrity and tested rollback.

- [ ] **R15.1 Update the threat model** for real deployment topology and data flows.
- [ ] **R15.2 Complete external security review or penetration testing.**
- [ ] **R15.3 Add secret management, least privilege and tenant isolation guidance/tests.**
- [ ] **R15.4 Add dependency, provenance and supply-chain controls** including lockfile/artifact verification.
- [ ] **R15.5 Run prompt-injection and semantic-confusion red-team suites** against supported product flows.
- [ ] **R15.6 Run incident, rollback and compromised-evidence exercises.**
- [ ] **R15.7 Map privacy, retention, deletion and audit requirements** for target deployments.

### R16 — External adoption and ecosystem: 20% → 100%

**100% definition:** Several unrelated products use the same core representation successfully under published compatibility and support contracts.

- [ ] **R16.1 Select one narrow internal pilot** such as multilingual preference/constraint memory with original-text retention.
- [ ] **R16.2 Define pilot success and rollback criteria** before implementation.
- [ ] **R16.3 Complete at least two unrelated product pilots** using the same Lunum-Sem contract.
- [ ] **R16.4 Retain user corrections, fallback rates, operational failures and cost/quality measurements.**
- [ ] **R16.5 Publish anonymized integration case studies** including negative results.
- [ ] **R16.6 Establish package/release governance and downstream upgrade support.**
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

## Current recommended sequence

This tracker does not autonomously assign work. The vision owner chooses priority. Based on the current evidence, the highest-leverage candidate sequence is:

1. Resolve the canonical contracts in #342 (modality enum) and #360 (canonicalization null/undefined inconsistency).
2. Define hard semantic invariants for role identity and other safety-critical differences (R5.1, R5.1a, R6.1).
3. Only then make an explicit owner calibration decision using the #365 threshold sweep data (R5.5).
4. Execute the new multilingual repeated-run manifests after native review and vocabulary reconciliation (R2.2, R2.6).
5. Implement real repeated-pass retention drift measurement (R3.3).
6. Continue context-compaction (R7), deployment (R11/R12/R14) and product-pilot work (R16).

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
