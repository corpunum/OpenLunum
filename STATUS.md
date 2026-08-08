# Project status

**Repository:** OpenLunum  
**Technology:** Lunum  
**Specification line:** Lunum-I — Lunum Interlingua  
**Workspace version:** 0.2.0  
**Maturity:** pre-1.0 research-to-reference implementation  
**Status date:** 2026-08-08

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
- frozen Lunum-Sem 1.0 schema and fingerprint contracts with migration tooling;
- exact and near-semantic fingerprint implementations with canonicalization edge case validation;
- safe, short, and tight renderer profiles with conformance, golden-output, regression, and compatibility migration tests;
- tokenizer and model-profile measurement tooling with calibrated per-family token counting;
- multilingual parse and realization experiment harnesses with 12-language corpus (96+ items);
- controlled predicate/role vocabulary and schema-bearing parse prompts;
- production parse gates, uncertainty/fallback policy, cross-family simulation, parse coverage/error recovery/ambiguity resolution;
- CLI, HTTP API, MCP, and OpenUnum adapter paths with stable contracts, error recovery, and stress testing;
- reproducible experiment manifests, dataset/profile hashing, raw-result retention, and report validation;
- machine-readable evidence registry with superseded-evidence lineage and versioned statistical conventions;
- safety hard gates, adversarial bypass resistance, prohibited domains, human-review policy, red-team framework;
- context compaction gates, cross-tokenizer benchmarks, boundary stress, cross-mode consistency, token-efficiency profiling;
- agent-state freeze, tamper evidence, idempotency, cross-framework interoperability, execution stress testing;
- OTel-compatible structured observability, health/readiness probes, SLO compliance verification;
- crash/disk-pressure recovery, operational load/failover/degradation cascade/recovery orchestration simulation;
- tenant isolation, supply-chain audit, incident response, privacy audit, security self-assessment;
- integration readiness and adoption compatibility validation;
- backup/restore/rollback exercises with SHA-256 integrity verification;
- fail-closed exact-head merge policy, protected-data boundary checks, and one-shot worker dispatcher.

2,152 tests across 246 test files, 769 commits, 166 issues resolved, 393 PRs merged. 14 of 16 readiness capabilities at 97%+.

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

The machine-readable evidence registry (`reports/evidence-registry.json`) tracks 24+ historical entries verified against committed sources. Evidence integrity is enforced by automated consistency checks between the tracker ledger and registry.

Key evidence milestones completed:

- Issue #253 baseline: honest EN/EL/ES/ID parse and retention experiments on two named local models;
- Threshold calibration: versioned decision chain with independent evaluation protocol;
- Superseded-evidence lineage: correction chains with history-rewrite validation;
- Versioned statistical conventions with independent recomputation verification;
- External replication infrastructure with environment compatibility and tolerance validation;
- Model-weight hash registry for 5 named models.

Evaluation and reproducibility is at **100%** — all defined action items complete. Historical parse and retention reports produced before the parse-prompt repair are not accepted baselines.

## Release-gate view

| Gate | Current view |
|---|---|
| Stable semantic schema and canonical serialization | Frozen 1.0 schema and fingerprint contracts with 15-vector conformance runner (97%) |
| Migration rules across schema versions | Implemented and tested for 0.1/0.2/1.0 paths with identity migration and golden vectors |
| Multilingual semantic-retention evidence | 216-record dataset across 8 languages, retention execution and regression validation (97%); live model baselines still needed |
| Tokenizer-aware renderer profiles | 8 profiles across 3 families with execution, regression, and compatibility migration validation (97%) |
| Safety and mixed-context quality gates | Hard invariant gates, adversarial bypass resistance, safety gate runner, human-review policy (97%); external red-team pending |
| Four adoption paths | CLI, HTTP API, MCP, and OpenUnum adapter with stress testing and error recovery; independent product adoption evidence limited (50%) |
| Threat model, rollback, compatibility | Security self-assessment, incident response, compliance audit validation (97%); external pentest pending |
| Property and conformance tests in CI | Implemented with schema conformance runner |
| Operational reliability | Health probes, SLO compliance, backup/restore, crash recovery, load/failover/cascade simulation (97%); live load pending |

## Known organizational gaps

- Live model execution on expanded corpora (parse, retention, compaction, profile quality) not yet performed.
- External security review or penetration testing by independent assessor not yet completed.
- No accepted evidence that unrelated products use the core representation in production-like conditions.
- Native-speaker review still needed for non-EN/EL translations in the expanded corpus.

## Honest boundary

OpenLunum has a coherent architecture, a strict reference core, frozen contracts, comprehensive validation infrastructure, and an extensive body of evidence across 16 readiness areas.

It does not yet provide:

- a production-approved general language-agnostic parser;
- universal semantic equivalence across arbitrary domains and languages;
- live model evidence for compaction, retention, or profile quality claims;
- production proof across unrelated products;
- externally validated security posture.

Natural fallback remains required whenever parsing, rendering, provenance, or safety evidence is insufficient.
