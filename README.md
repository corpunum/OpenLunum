# OpenLunum

> **Technology:** Lunum  
> **Specification line:** Lunum-I — Lunum Interlingua  
> **Status:** pre-1.0 research-to-reference implementation

OpenLunum develops **Lunum**, a model-facing semantic intermediate representation designed to preserve meaning across human languages, create stable retrieval identities, and render selected context in forms measured for the model and tokenizer actually in use.

Lunum is not compressed English and it is not a claim that one artificial spelling is optimal for every model. Its architecture separates canonical meaning from model-facing rendering:

```text
human language or structured product state
              ↓
Lunum-Sem — canonical, language-independent semantics
              ↓
Lunum-FP  — deterministic exact and near-semantic identity
              ↓
Lunum-Code — measured model/tokenizer-specific rendering
              ↓
natural fallback whenever compact representation is unsafe
```

## Current state (July 2026)

| Metric | Value |
|---|---|
| Core test suite | **1,221 tests, 93 suites, 0 failures** |
| CI checks | 5 required (verify, schema-drift, quality-gates, report-validation, protected-data-boundary) |
| Workspace packages | 6 (`core`, `eval`, `cli`, `api`, `mcp`, `adapter-openunum`) |
| Commits on main | 638 |
| Issues resolved | 105 |
| Languages covered | 12 (EN, EL, ES, ID, JA, KO, ZH, AR, PT, FR, DE, RU) |
| Model families tested | 3 (Qwen, Gemma, Llama) with 6 frozen profiles |

### Readiness summary

| Level | Estimate | Meaning |
|---|---:|---|
| Research/reference platform | **95%** | Strong architecture, comprehensive conformance corpus, reproducible evidence |
| Controlled internal pilot | **82%** | Core paths usable with narrow domains and mandatory natural-language fallback |
| General production dependency | **62%** | Substantial foundations; broad operational and live evidence gaps remain |

### Capability readiness

| Capability | Readiness |
|---|---:|
| Canonical semantic layer | **95%** |
| Multilingual parsing | **85%** |
| Round-trip semantic retention | **90%** |
| Exact semantic identity | **92%** |
| Near-semantic comparison | **80%** |
| Safety-critical preservation | **78%** |
| Context compaction and token savings | **48%** |
| Model-specific rendering | **82%** |
| Cross-language memory and retrieval | **58%** |
| Agent-state and handoffs | **80%** |
| CLI integration | **68%** |
| HTTP API, MCP and adapters | **68%** |
| Evaluation and reproducibility | **97%** |
| Operational reliability | **54%** |
| Security, governance and rollback | **64%** |
| External adoption and ecosystem | **28%** |

### Detailed capability status

| Capability | Readiness | What works now | Main gap |
|---|---:|---|---|
| Canonical semantic layer | **95%** | Strict TypeScript semantic structures, canonicalization, provenance, versioned schemas, 28-vector conformance corpus, independent Python verifier, support contract, frozen 1.0 schema and fingerprint versions | Schema freeze not yet ratified by external adoption |
| Multilingual parsing | **85%** | Real built-CLI EN/EL/ES/ID runs on two local models; 12-language corpus (96+ items); model-family test matrix (3 families, 6 profiles); production parse gates; uncertainty/fallback policy | Native review needed for non-EN/EL; no live model execution on expanded corpus |
| Round-trip semantic retention | **90%** | Manifest-driven realization + parse-back, nested three-level fixtures, 216-record dataset (8 languages, 12 categories), audit-trailed fallback/rollback, retention gates and deterministic recomputation | No live retention model evidence; repeated-pass chaining is plan only |
| Exact semantic identity | **92%** | Canonical serialization, exact fingerprints, path-aware comparison, property/fuzz tests, 22 collision pairs, identity migration with golden vectors, normative byte vectors, cross-runtime Python verifier | 1.0 fingerprint support contract not yet frozen |
| Near-semantic comparison | **80%** | Weighted semantic comparison, clause-bound role features, 80-item mutation corpus, held-out scorer eval, threshold sweep, hard mismatch invariants, clause-path-aware role-identity invariant, scorer explanation output | Threshold calibration awaits owner decision |
| Safety-critical preservation | **78%** | Hard gates enforcing verdict on invariant violations; 7-category protected literal registry; prohibited domains; adversarial suites for policy classification | Human-review requirements not formalized; incident handling unproven |
| Context compaction | **48%** | Renderer profiles, context compiler, 18 benchmark tasks across 6 downstream categories with compression metrics | Infrastructure only — no live model execution or exact tokenizer counts |
| Model-specific rendering | **82%** | 8 accepted profiles across Qwen/Llama/Gemma with identity, tokenizer fields, profile-selection logic, migration/compatibility tests and fallback | Per-profile downstream quality measurement still absent |
| Cross-language retrieval | **58%** | 60+ cross-language retrieval pairs across 6 language pairs with precision/recall/F1 | No live model retrieval evidence; no embedding/hybrid comparison |
| Agent-state and handoffs | **80%** | Frozen agent-state/1.0 schema, replay/recovery tests, SHA-256 tamper evidence, idempotency keys and duplicate detection | Interoperability and long-running workflow proof absent |
| CLI integration | **68%** | Stable command/flag/exit-code contracts, streaming JSONL, structured machine-readable errors | Platform packaging and installed-artifact testing incomplete |
| HTTP API, MCP and adapters | **68%** | Versioned API/MCP contracts, auth, rate limiting, CORS, OTel-compatible structured logging with traces and correlation IDs | Sustained load testing, SLOs and independent deployments unproven |
| Evaluation and reproducibility | **97%** | Versioned protocol, immutable manifests, raw JSONL, deterministic bundles, machine-readable evidence registry, model-weight hash registry | External replication and superseded-evidence lineage remain |
| Operational reliability | **54%** | Endpoint verification, thermal watchdogs, streaming with TTFT/TPOT, load-soak and concurrency test infrastructure | Sustained load execution, failover, SLOs, crash recovery unproven |
| Security and governance | **64%** | Protected-data boundaries, prompt-injection tests, threat model eval vectors, exact-head merge controls | No external security assessment or tenant isolation proof |
| External adoption | **28%** | Narrow internal pilot designed with success/rollback criteria | No production-like evidence from unrelated products |

Full detail, evidence links and change log: [`docs/LUNUM_READINESS.md`](docs/LUNUM_READINESS.md)

### Recent work (Phase 7 + 8)

Phase 7 and 8 shipped 23 PRs covering:

- **Semantic safety:** hard invariants (negation-flip, role-identity, obligation-permission, condition-change, protected-literal) converted to hard product gates that block false `match` verdicts
- **Protected literals:** 7-category registry (quantity, date, identifier, range, url, path, structured-ref)
- **Uncertainty policy:** confidence scoring with 6 evidence factors, automatic fallback to natural text
- **Identity migration:** forward/backward classification with golden vectors proving #360 fixes
- **Retention rollback:** audit-trailed rollback when round trips fail or become ambiguous
- **Prohibited domains:** hard blocks for legal/medical/financial/destructive domains
- **Agent-state:** tamper evidence (SHA-256 hash chains), idempotency keys, duplicate detection
- **Observability:** JSON-structured logging, OTel-compatible traces, correlation IDs
- **Parse gates:** multi-scope evaluator with safety invariant floors
- **Support contract:** versioned compatibility and support commitments
- **Independent verifier:** Python cross-implementation byte/fingerprint validator

## North star

A product records meaning once, retains the original evidence, retrieves that meaning across languages, and renders only the representation best suited to the receiving model and task.

```text
source evidence -> canonical semantics -> stable identity -> measured rendering -> safe use
```

Token compression alone is not success. Success requires meaning preservation, downstream task quality, safety, reversibility, compatibility, and reproducible evidence.

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify          # typecheck + test + eval:smoke
pnpm agent:status    # check orchestration state
```

Node 22 and pnpm 10.13.1 are required.

## Documentation

| Document | Purpose |
|---|---|
| [`START_HERE.md`](START_HERE.md) | Entry point for humans and agents |
| [`VISION.md`](VISION.md) | Long-term goals and principles |
| [`AGENTS.md`](AGENTS.md) | Agent integration guide |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture |
| [`docs/LUNUM_READINESS.md`](docs/LUNUM_READINESS.md) | Production readiness tracker with evidence |
| [`docs/REPOSITORY_OPERATING_MODEL.md`](docs/REPOSITORY_OPERATING_MODEL.md) | Branch, issue, CI and acceptance model |
| [`docs/EXPERIMENT_PROTOCOL.md`](docs/EXPERIMENT_PROTOCOL.md) | How experiments are run and validated |
| [`docs/EVALUATION_PROTOCOL.md`](docs/EVALUATION_PROTOCOL.md) | Evaluation methodology |
| [`STATUS.md`](STATUS.md) | Implementation status and honest limitations |

## Core boundaries

- `Lunum-Sem` is language-neutral structured meaning.
- Lunum-Code is a renderer profile, not canonical semantics.
- Natural source text, language, provenance, and protected literals are retained.
- Heuristic surface records are not canonical semantics.
- Fingerprint or canonicalization changes require versioning, golden vectors, migration rules, and independent review.
- Implementation and protected evaluation data are not modified in the same PR.
- A model cannot be the only judge of its own output.

## Architecture

OpenLunum is a pnpm monorepo with six packages:

| Package | Description |
|---|---|
| `packages/core` | Semantic types, canonicalization, fingerprints, comparison, invariants, safety gates |
| `packages/eval` | Evaluation infrastructure, conformance corpus, model-family test matrix |
| `packages/cli` | Command-line interface for inspect, encode, migrate, quality-gate |
| `packages/api` | HTTP API with auth, rate limiting, CORS, streaming |
| `packages/mcp` | Model Context Protocol adapter |
| `packages/adapter-openunum` | OpenUnum integration adapter |

## Repository operating model

OpenLunum uses persistent local worktrees and disposable remote task branches.

```text
work/<worker>/<issue-number>-<short-name>
```

Key rules:

- workers receive one explicit ready GitHub issue;
- one issue per branch, one active implementation PR per worker;
- autonomous workers never push to or merge into `main`;
- semantic and evidence-sensitive work requires independent evaluation;
- accepted work is squash merged and its branch is deleted.

See [`docs/REPOSITORY_OPERATING_MODEL.md`](docs/REPOSITORY_OPERATING_MODEL.md) for the complete model.

## Experiment expectations

Behavior-changing and evidence-changing work should declare:

- issue and hypothesis;
- baseline commit;
- dataset identifier and SHA-256;
- model, tokenizer, quantization/build, chat template, and generation settings;
- hard gates and target metrics;
- maximum attempts, model calls, time, hardware, and Actions budget;
- raw failures, exclusions, errors, and timeouts;
- exact reproduction commands;
- what the result does not prove.

Development results become proposals only after deterministic validation.

## What's next

The following areas have the most room for improvement toward production readiness:

1. **Live model evidence** — Run the expanded multilingual corpus and retention tests against live local models (Qwen, Gemma, Llama) to produce accepted baselines beyond infrastructure-only results.
2. **Context compaction proof (48%)** — Execute downstream task benchmarks with live models to prove token savings preserve task quality.
3. **Operational reliability (50%)** — Sustained-load testing, failover, crash recovery, and declared SLOs.
4. **Near-semantic threshold calibration (70%)** — Owner decision on the 0.8 threshold given known role-swap false positives.
5. **Schema freeze** — Freeze Lunum 1.0 schema, canonicalization, and fingerprint contracts.
6. **External adoption (20%)** — At least two unrelated product pilots with retained evidence.
7. **Security assessment** — External review, tenant isolation proof, incident response exercises.

## License

See [`LICENSE`](LICENSE) for terms.
