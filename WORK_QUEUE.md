# OpenLunum work queue

Agents choose one area and create an experiment-specific branch. Priority is evidence quality before aggressive optimization.

## P0 — repository reliability

- [x] Strict TypeScript reference implementation.
- [x] Reproducible pnpm lockfile and CI.
- [x] Agent onboarding, experiment protocol, and local-model runner.
- [x] Add schema-to-TypeScript drift checking.
- [x] Add release provenance and signed artifacts.

## P1 — semantic contract

- [x] Define semantic identity projection: decide which annotations/provenance affect fingerprints.
- [x] Expand typed time, quantity, uncertainty, reference, and modality structures.
- [x] Add canonical conformance vectors and property tests.
- [x] Version and document fingerprint migration from 0.1.

## P1 — multilingual parsing

- [x] Establish English and Greek parse baselines on `multilingual-core-v1`.
- [x] Add Spanish and Indonesian baselines.
- [x] Build error taxonomy for entity, role, negation, condition, quantity, time, and ambiguity failures.
- [x] Add explicit abstention/clarification outputs for low-confidence parses.

## P1 — realization

- [x] Implement Lunum-Sem -> English and Greek realization experiments.
- [x] Add protected-literal and independent semantic scoring.
- [x] Add round-trip self-consistency as a secondary metric only.
- [x] Add Spanish and Indonesian after English/Greek gates are credible.

## P2 — renderers and tokenizer profiles

- [x] Measure `generic-en-pivot/0.1` with exact target tokenizers.
- [x] Implement safe, short, and tight profiles without changing semantics.
- [x] Add llama.cpp-compatible tokenizer counting.
- [x] Add full-prompt quality gates for local models.

## P2 — context and retrieval

- [x] Build category/risk/confidence policy datasets.
- [x] Measure natural vs Lunum vs mixed context downstream quality.
- [x] Add multilingual retrieval and false-equivalence tests.
- [x] Design near-semantic fingerprints separately from exact identity.

## P2 — adoption

- [x] Package and verify the OpenUnum adapter in shadow mode.
- [x] Add MCP/local service reference implementation.
- [x] Add conformance reports for hook/plugin/CLI integrations.

## P2 — agent-state protocol

- [x] Encode plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs in a validated Lunum-compatible format.

## P2 — native model protocol

- [x] Add protocol annotations for Lunum-native model compatibility (token mappings, instruction templates, fallback profiles for non-native models). (PR #69)

## P2 — error observability

- [x] Add error tracking, circuit-breaker, and revert-capability types to support observable and reversible failure modes.

## P2 — downstream quality gates

- [x] Add task-success metrics and quality gates that verify downstream task quality is preserved when using Lunum context vs raw text.

## Claiming work

Create `experiments/<experiment-id>/CLAIM.md` with worker, area, branch, start date, and intended dataset. A claim prevents accidental duplication; it does not reserve an area indefinitely.


---

# WORK_QUEUE v2 — evidence and hardening (2026-07-17)

v1 (above) is fully landed. v2 turns implementations into evidence and reference code into adoptable infrastructure.

All v2 items implemented and merged as of 2026-07-18.

## P1 — evidence

- [x] Run parse experiments (EN/EL/ES/ID) against local models via the eval runner; publish per-language metrics reports. (PR #50)
- [x] Run realization experiments (EN/EL/ES/ID) with protected-literal scoring; publish reports. (PR #62)
- [x] Token Atlas: measure natural vs safe/short/tight renderings with exact tokenizer counts on at least 3 named local models. (PR #61)

## P1 — semantic contract hardening

- [x] Implement fingerprint migration utilities (code, not just docs): detect version, migrate records, golden vectors. (PR #66, maintainer-reviewed)
- [x] Wire conformance property tests into CI as hard gates (idempotence, key-order independence, fingerprint stability). (PR #51)

## P2 — adoption

- [x] MCP server hardening: error contracts, input validation, conformance test suite. (PR #52)
- [x] OpenUnum shadow-mode live integration test against the real product runtime. (PR #57)

## P2 — renderer

- [x] Renderer profile selection driven by Token Atlas measurements (per-model best profile). (PR #55)

---

# WORK_QUEUE v3 — Issue #11 completion (2026-07-18)

All 5 blockers resolved and merged. Issue #11 can be closed.

- [x] Schema field mismatch: align `integrationId`/`selectedIntegration` across code, types, schema. (PR #81, #82)
- [x] Retrieval negative matrix: duplicate IDs, empty sets, aggregate MRR, maxItems, manifest gates. (PR #76)
- [x] Integration negative matrix: timeout, thrown-error, malformed output, missing artifacts, schema-mismatch. (PR #77)
- [x] Tests use temp dirs instead of repo paths. (PR #81)
- [x] Report validator with integrity hash (known-good + tampered). (commit c2a0f25)

---

# WORK_QUEUE v4 — pre-1.0 release gates (2026-07-18)

v1-v3 are fully landed. v4 targets the 8 release gates from STATUS.md to move the project from experiment/prototype to reference-stable.

Most v4 implementation work has landed, but the queue is **not mechanically complete**. A maintainer audit on 2026-07-19 reopened three claims whose current evidence does not satisfy the stated acceptance text. Do not report v4 as 100% accepted until the unchecked items below are repaired and independently reviewed.

## P0 — schema stability (release gate 1)

- [x] Freeze Lunum-Sem schema 0.2: audit all `additionalProperties` constraints, lock field names, add a schema version migration test that reads a 0.1 record and produces a valid 0.2 record. *(PR #83 merged)*
- [x] Add JSON Schema `$ref` cross-references between experiment.schema.json, protected-eval.schema.json, and the core Lunum-Sem schema so tools can validate the full graph. *(PR #146 merged)*
- [x] Schema changelog: create `schemas/CHANGELOG.md` documenting every breaking change with migration instructions. *(exists on main)*

## P0 — migration rules (release gate 2)

- [x] Implement bidirectional fingerprint migration tests: 0.1→0.2 forward, 0.2→0.1 lossy backward with explicit data-loss warnings. *(PR #144, #149 merged)*
- [ ] Add a migration CLI command: `lunum migrate <file> --from 0.1 --to 0.2` that transforms records in place with a dry-run mode. *(Current main only rewrites `sem.schema`; it does not migrate record structure/fingerprint, validate source and destination schemas, fail closed, or write atomically. Draft repair: PR #178.)*
- [x] Golden migration vectors: add 20+ fixture pairs (0.1 input → expected 0.2 output) covering every structural change. *(golden-migration-vectors.test.ts on main)*

## P1 — multilingual retention (release gate 3)

- [x] Run parse+realize round-trip retention experiments on all 4 languages (EN/EL/ES/ID) against at least 2 local models; publish pass/fail per-language metrics. *(PR #176)*
- [x] Add a retention regression gate to CI: if any language drops below the baseline threshold recorded in the first run, the build fails. *(PR #167, #180 merged)*
- [x] Measure cross-lingual retrieval precision: query in language A, retrieve semantically equivalent records in language B. *(PR #92 merged)*

## P1 — renderer measurement (release gate 4)

- [ ] Upgrade renderer profiles from "Experiment" to "Reference": add deterministic golden-output tests for safe/short/tight on 10+ diverse inputs. *(The current 15-input suite checks invariants and relative properties but does not commit and compare exact approved profile outputs. Draft documentation correction: PR #185.)*
- [ ] Add a tokenizer-optimization pass: for each named local model in Token Atlas, produce a model-specific tight profile that provably does not change semantics. *(Current main sets `optimizedFingerprint = entry.fingerprint` and compares the value to itself, so preservation is tautological. Draft repair: PR #184.)*
- [x] Renderer conformance suite: property tests that every profile preserves round-trip canonicalization. *(renderer-conformance.ts + test on main)*

## P1 — safety and quality gates (release gate 5)

- [x] Implement mixed-context quality gates: measure downstream task accuracy with natural vs Lunum vs mixed context on at least 3 task types. *(PR #118 merged)*
- [x] Add prompt-injection resistance tests: craft 10 adversarial inputs that attempt to corrupt Lunum-Sem records through the parser; all must be detected or rejected. *(PR #117 merged)*
- [x] Quality gate CI integration: run quality gates on every PR that touches `packages/core/src/` or `packages/eval/src/`. *(PR #151 merged)*

## P1 — adoption paths (release gate 6)

- [x] Verify the OpenUnum adapter end-to-end: install, configure, run in shadow mode, compare outputs to direct API — publish a conformance report. *(merged on main)*
- [x] Add a second adoption path: standalone CLI pipeline (`lunum parse | lunum realize | lunum render`) with documented examples. *(packages/cli exists on main)*
- [x] Add a third adoption path: HTTP API reference server (extend the MCP package or create `packages/api`) with OpenAPI spec and integration tests. *(packages/api exists on main)*

## P2 — threat model and rollback (release gate 7)

- [x] Expand `docs/THREAT-MODEL.md` with concrete mitigations for each threat (not just listings) and add a test for each parser-hallucination and renderer-ambiguity case. *(PR #126 merged)*
- [x] Implement rollback process: given a Lunum-Sem record and its provenance chain, revert to the original natural-language source with verification. *(PR #154 merged)*
- [x] Add a compatibility matrix: which schema versions work with which package versions, tested in CI. *(PR #128 merged)*

## P2 — near-semantic fingerprints (from STATUS.md "Design" → implementation)

- [x] Implement near-semantic fingerprint generation: feature extraction, configurable similarity threshold, LSH or embedding-based bucketing. *(near-semantic-fingerprints.ts on main)*
- [x] Add near-semantic retrieval tests: query by near-fingerprint, verify recall vs exact fingerprint, measure false-positive rate. *(near-semantic-retrieval.test.ts on main)*
- [x] Near-semantic + exact fingerprint interop: a single record carries both, and queries can specify which type to match. *(PR #137 merged)*

## P2 — hardening

- [x] Add `packages/core` API stability tests: snapshot all public exports and fail CI if any are removed or have breaking signature changes without a major version bump. *(api-stability.test.ts on main)*
- [x] Error observability integration: wire circuit-breaker and revert-capability types into the eval runner so experiments auto-halt on repeated failures. *(PR #119 merged)*
- [x] Add a `pnpm verify --strict` mode that also runs slow property tests, schema-drift checks, and the full eval smoke suite — gate nightly on this. *(PR #111 merged)*

## Claiming work

Same rules as v1: create `experiments/<experiment-id>/CLAIM.md` with worker, area, branch, start date. One item per PR.
