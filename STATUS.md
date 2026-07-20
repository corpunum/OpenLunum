# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I — Lunum Interlingua  
**Workspace version:** 0.2.0  
**Maturity:** pre-1.0 research-to-reference implementation  
**Status date:** 2026-07-20

This file is a periodically reconciled summary. GitHub issues are the canonical backlog and acceptance state. Support and maturity claims require exact evidence references; implementation presence alone is not acceptance evidence.

## Architecture

OpenLunum separates canonical meaning from model-facing representation:

```text
source evidence -> Lunum-Sem -> exact/near-semantic identity
                              -> measured renderer profile
                              -> safe natural-language fallback
```

The repository owns language semantics, schemas, canonicalization, fingerprints, renderers, policies, evaluations, and conformance contracts. Products own persistence, retrieval, context budgets, safety controls, and user experience.

## Implemented foundations

The repository currently includes:

- strict TypeScript semantic types, canonicalization, serialization, and provenance;
- frozen Lunum-Sem 0.2 schema assets and migration tooling;
- exact and near-semantic fingerprint implementations;
- safe, short, and tight renderer profiles with conformance and golden-output tests;
- tokenizer and model-profile measurement tooling;
- multilingual parse and realization experiment harnesses;
- controlled predicate/role vocabulary and schema-bearing parse prompts;
- configurable model token budgets and near-semantic parse scoring;
- CLI, HTTP API, MCP, and OpenUnum adapter paths;
- reproducible experiment manifests, dataset/profile hashing, raw-result retention, and report validation;
- safety, prompt-injection, rollback, compatibility, and downstream-quality tests;
- fail-closed exact-head merge policy and protected-data boundary checks;
- assignment-driven local worker documentation and one-shot dispatcher tooling.

This list describes implemented foundations. It does not by itself declare universal correctness, language support, production readiness, or accepted model performance.

## Repository operating state

The repository uses the operating model in `docs/REPOSITORY_OPERATING_MODEL.md`:

- `main` is the only persistent shared development line;
- workers use persistent local worktrees and disposable `work/<worker>/<issue>-<name>` branches;
- GitHub issues are the backlog and assignment source of truth;
- the default repository-wide limit is three active implementation pull requests;
- workers run once for one explicit assignment and exit;
- semantic and evidence-sensitive changes require independent evaluation;
- accepted pull requests are squash merged and branches are deleted;
- campaign, status, sync, completion, and idle branches are prohibited.

The legacy persistent campaign loop is not the desired execution model. Local orchestration should use `scripts/pi-dispatch-once.sh` with a validated local assignment file.

## CI and merge controls

The merge policy requires successful current-head checks:

- `verify`;
- `schema-drift`;
- `report-validation`;
- `protected-data-boundary`;
- `quality-gates` when core/eval source paths require it.

The policy also blocks drafts, non-mergeable heads, blocking labels, current-head `NEEDS_WORK`, missing head-bound approval evidence, stale checks, failed checks, checks from unexpected producers, and workflow jobs with no recorded steps. Merges are bound to the expected head SHA.

PR workflows avoid duplicate task-branch `push` runs and defer full PR checks while a candidate remains draft. Marking a pull request ready triggers the acceptance checks.

Issue #188 remains the control-proof issue until live branch-protection configuration and enforcement are independently verified. Do not close it solely because repository policy code exists.

## Evidence status

The parse experiment path was repaired after discovering that historical live-model evidence was generated through a broken path. Repairs now present on `main` include:

- correct CLI manifest argument handling;
- delivery of the full parse system prompt;
- embedded schema shape and canonical example;
- controlled predicate/role vocabulary;
- profile-overridable model token budgets;
- fail-closed exact and near-semantic outcome scoring;
- CLI pipeline qualitative sanity check confirming it is a heuristic surface telegraph (not a real parser) — report at `reports/lunum-qualitative-sanity-check.md`.
- delivery of the full parse system prompt;
- embedded schema shape and canonical example;
- controlled predicate/role vocabulary;
- profile-overridable model token budgets;
- fail-closed exact and near-semantic outcome scoring.

Historical parse and retention reports produced before these repairs are not accepted baselines.

### CLI pipeline — not doing semantic parsing

A qualitative sanity check (July 2026, report at `reports/lunum-qualitative-sanity-check.md`) confirms: the CLI `pipeline` command does not perform semantic parsing. It always emits `kind: surface_telegraph` with one flat clause, regardless of input complexity. Category and risk are hardcoded CLI flag defaults. The real parse logic in `policy-classifier.ts` is dead code in the CLI pipeline path. Any "feature recall" or "exact match" metrics against this pipeline are computed against a fixed stopword-strip transform, not a semantic parse. This is consistent with the honest boundary statement that a production-approved parser is not yet provided.

### Immediate evidence milestone

Issue #253 is the current bounded milestone:

- run honest EN/EL/ES/ID parse and retention experiments;
- use at least two named local model environments where required by the issue;
- preserve raw item results, failures, timeouts, and exclusions;
- report exact and near-semantic-only outcomes separately;
- record dataset, profile, environment, and candidate hashes;
- establish accepted replacement baselines before threshold calibration.

Thresholds must be calibrated from accepted evidence, not retrofitted to historical broken-path results.

## Release-gate view

| Gate | Current view |
|---|---|
| Stable semantic schema and canonical serialization | Substantially implemented; changes remain Tier 3 |
| Migration rules across schema versions | Implemented and tested for current 0.1/0.2 paths |
| Multilingual semantic-retention evidence | Not accepted until issue #253 produces reviewed replacement baselines |
| Tokenizer-aware renderer profiles | Implemented with golden and preservation tests; broader model evidence remains ongoing |
| Safety and mixed-context quality gates | Implemented as prototype/reference test infrastructure; product proof remains limited |
| Three adoption paths | CLI, HTTP API, MCP, and OpenUnum adapter exist; independent product adoption evidence remains limited |
| Threat model, rollback, compatibility | Implemented and documented; continue adversarial review |
| Property and conformance tests in CI | Implemented; live branch-protection enforcement still tracked by issue #188 |

## Known organizational gaps

- A machine-readable accepted-evidence registry is not yet canonical.
- GitHub milestones and issue labels need to fully encode the proposed roadmap and work states.
- The local system service/timer configuration must be migrated from persistent campaign invocation to assignment-driven one-shot dispatch.
- Old closed-unmerged branches require local inspection for unique commits before deletion.
- Live branch-protection configuration requires independent verification before incident #188 can close.

## Honest boundary

OpenLunum has a coherent architecture, a strict reference core, migration and adoption tooling, guarded experiment infrastructure, and an improving body of evidence.

It does not yet provide:

- a production-approved general language-agnostic parser;
- universal semantic equivalence across arbitrary domains and languages;
- universal token compression across models;
- production proof across unrelated products;
- accepted replacement multilingual baselines from the repaired live-model path;
- a completed 1.0 support and compatibility guarantee.

Natural fallback remains required whenever parsing, rendering, provenance, or safety evidence is insufficient.
