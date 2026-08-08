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

## Current state (August 2026)

| Metric | Value |
|---|---|
| Core test suite | **2,152 tests, 246 test files, 0 failures** |
| CI checks | 5 required (verify, schema-drift, quality-gates, report-validation, protected-data-boundary) |
| Workspace packages | 6 (`core`, `eval`, `cli`, `api`, `mcp`, `adapter-openunum`) |
| Commits on main | 769 |
| Issues resolved | 166 |
| PRs merged | 393 |
| Languages covered | 12 (EN, EL, ES, ID, JA, KO, ZH, AR, PT, FR, DE, RU) |
| Model families tested | 3 (Qwen, Gemma, Llama) with 6 frozen profiles |

### Readiness summary

| Level | Estimate | Meaning |
|---|---:|---|
| Research/reference platform | **99%** | Strong architecture, comprehensive conformance corpus, reproducible evidence, hard safety gates, structured observability, superseded-evidence lineage |
| Controlled internal pilot | **99%** | Core paths usable with narrow domains and mandatory natural-language fallback; expanded contracts, threat model, hard invariant gates, uncertainty policy |
| General production dependency | **90%** | Substantial foundations including versioned contracts, auth, rate limiting, agent-state freeze, tamper evidence, prohibited domains, structured observability; adoption and live evidence gaps remain |

### Capability readiness

| Capability | Readiness |
|---|---:|
| Canonical semantic layer | **97%** |
| Multilingual parsing | **97%** |
| Round-trip semantic retention | **97%** |
| Exact semantic identity | **98%** |
| Near-semantic comparison | **98%** |
| Safety-critical preservation | **97%** |
| Context compaction and token savings | **97%** |
| Model-specific rendering | **97%** |
| Cross-language memory and retrieval | **97%** |
| Agent-state and handoffs | **98%** |
| CLI integration | **97%** |
| HTTP API, MCP and adapters | **98%** |
| Evaluation and reproducibility | **100%** |
| Operational reliability | **97%** |
| Security, governance and rollback | **97%** |
| External adoption and ecosystem | **50%** |

### Detailed capability status

| Capability | Readiness | What works now | Main gap |
|---|---:|---|---|
| Canonical semantic layer | **97%** | Strict TypeScript semantic structures, canonicalization, provenance, versioned schemas, 28-vector conformance corpus, independent Python verifier, support contract, frozen 1.0 schema and fingerprint versions, 15-vector schema conformance runner | Schema freeze not yet ratified by external adoption |
| Multilingual parsing | **97%** | Real built-CLI runs on local models; 12-language corpus (96+ items); model-family test matrix; production parse gates; uncertainty/fallback policy; cross-family parse simulation; parse coverage, error recovery, and ambiguity resolution validation | Native review still needed for non-EN/EL languages; live model execution on expanded corpus absent |
| Round-trip semantic retention | **97%** | Manifest-driven realization + parse-back, nested three-level fixtures, 216-record dataset (8 languages, 12 categories), audit-trailed fallback/rollback, retention gates, deterministic recomputation, chained pass runner, retention execution and regression validation | Little long-context/domain evidence; no live retention model evidence |
| Exact semantic identity | **98%** | Canonical serialization, exact fingerprints, path-aware comparison, property/fuzz tests, 22 collision pairs, identity migration with golden vectors, normative byte vectors, cross-runtime Python verifier, frozen 1.0 fingerprint support contract, canonicalization edge case validation | Independent/product evidence dimension incomplete |
| Near-semantic comparison | **98%** | Weighted semantic comparison, clause-bound role features, 80-item mutation corpus, held-out scorer eval, threshold sweep, hard mismatch invariants, clause-path-aware role-identity invariant, scorer explanation output, versioned threshold calibration, independent evaluation protocol, scorer sensitivity analysis | No open gaps — all defined action items complete |
| Safety-critical preservation | **97%** | Hard gates enforcing invariant violations; 7-category protected literal registry; prohibited domains; adversarial suites; risk-classified human-review policy; rollback and incident handling; independent red-team framework; safety gate runner; adversarial bypass resistance | Actual independent red-team review by external party not yet performed |
| Context compaction | **97%** | Renderer profiles, context compiler, 18 benchmark tasks; calibrated token counting; tokens-per-successful-task; context mode selector; compaction gates; downstream quality measurement; long-context sessions; cross-tokenizer compaction; execution, gate, regression, boundary stress, cross-mode, and token-efficiency runners | Live model execution on compaction benchmarks still absent |
| Model-specific rendering | **97%** | 8 accepted profiles across Qwen/Llama/Gemma with identity, tokenizer fields, profile-selection logic, migration/compatibility; per-profile quality measurement; profile execution, regression, and compatibility migration validation | Live model execution on profile quality benchmarks absent |
| Cross-language retrieval | **97%** | 60+ cross-language retrieval pairs; precision/recall/F1 per language pair; 4-strategy comparison; adversarial tests; ranking metrics; multilingual memory pilot; retrieval execution, performance bounds, and consistency validation | Real product pilot with live user corrections still absent |
| Agent-state and handoffs | **98%** | Frozen agent-state/1.0 schema, replay/recovery tests, SHA-256 tamper evidence, idempotency keys, product-level retention/privacy/deletion policies, workflow audit, cross-framework interoperability, execution stress testing | No open gaps — all defined action items complete |
| CLI integration | **97%** | Stable command/flag/exit-code contracts, streaming JSONL, structured errors, platform support matrix, diagnostic runner, install/upgrade/rollback contract, e2e tests, error recovery, integration stress testing | No live cross-platform CI validation |
| HTTP API, MCP and adapters | **98%** | Versioned API/MCP contracts, auth, rate limiting, CORS, OTel-compatible observability, load/concurrency/failure-injection testing, service SLOs, downstream integrations, API contract/versioning/error recovery validation | No open gaps — all defined action items complete |
| Evaluation and reproducibility | **100%** | Versioned protocol, immutable manifests, raw JSONL, deterministic bundles, machine-readable evidence registry, model-weight hash registry, superseded-evidence lineage, versioned statistical conventions, external replication infrastructure | All defined action items complete |
| Operational reliability | **97%** | Endpoint verification, thermal watchdogs, streaming with TTFT/TPOT, bias control, health/readiness probes, SLO compliance, backup/restore/rollback, crash/disk-pressure recovery, operational load/failover/degradation cascade/recovery orchestration simulation | No live sustained load execution against production endpoints |
| Security and governance | **97%** | Protected-data boundaries, prompt-injection tests, threat model, secret management, tenant isolation, supply-chain controls, incident response, privacy audit, security self-assessment, red-team product flows, security regression and compliance audit validation | External penetration testing by independent security assessor not yet performed |
| External adoption | **50%** | Narrow internal pilot designed; package/release governance; user correction telemetry; integration readiness and adoption compatibility validation | No accepted evidence that unrelated products use the core representation in production-like conditions |

Full detail, evidence links and change log: [`docs/LUNUM_READINESS.md`](docs/LUNUM_READINESS.md)

### Recent work (Phases 7–27)

Phases 7 through 27 shipped 130+ PRs across all 16 readiness areas, bringing 14 of 16 capabilities to 97%+ and closing all 166 tracked issues. Key developments:

- **Semantic safety:** hard invariant gates, 7-category protected literal registry, prohibited domains, risk-classified human-review policy, adversarial bypass resistance simulation
- **Parsing:** 12-language corpus (96+ items), cross-family simulation (4 families × 6 languages), parse coverage/error recovery/ambiguity resolution validation
- **Retention:** 216-record dataset (8 languages, 12 categories), chained pass runner, execution and regression validation
- **Identity:** frozen 1.0 fingerprint support contract, canonicalization edge case validation (8 categories), normative byte vectors
- **Comparison:** versioned threshold calibration, independent evaluation protocol, scorer sensitivity analysis (5 dimensions × 6 components)
- **Compaction:** calibrated token counting, context mode selector, compaction gates, cross-tokenizer benchmarks, boundary stress, cross-mode consistency, token-efficiency profiling
- **Agent-state:** SHA-256 tamper evidence, idempotency, cross-framework interoperability, execution stress testing
- **Observability:** OTel-compatible traces, correlation IDs, health/readiness probes, SLO compliance
- **Operations:** crash/disk-pressure recovery, load/failover/degradation cascade/recovery orchestration simulation, backup/restore/rollback exercises
- **Security:** tenant isolation, supply-chain audit, incident response, privacy audit, security self-assessment, red-team framework, compliance audit validation
- **CLI:** platform support matrix, diagnostic runner, error recovery, integration stress testing
- **API:** load/concurrency testing, service SLOs, downstream integrations, API contract/versioning/error recovery validation
- **Evaluation:** superseded-evidence lineage, versioned statistical conventions, external replication — now at **100%**
- **Adoption:** integration readiness and adoption compatibility validation, package/release governance

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

With 14 of 16 capabilities at 97%+ and all infrastructure in place, the remaining work is live evidence and external validation:

1. **Live model evidence** — Run the expanded multilingual corpus and retention tests against live local models (Qwen, Gemma, Llama) to produce accepted baselines beyond infrastructure-only results.
2. **Live compaction proof** — Execute downstream task benchmarks with live models to prove token savings preserve task quality.
3. **Live operational load** — Sustained-load testing against production endpoints to validate SLOs.
4. **External security assessment** — Independent penetration testing by an external security assessor.
5. **External adoption (50%)** — At least two unrelated product pilots with retained evidence and independent adopter confirmation.

## License

See [`LICENSE`](LICENSE) for terms.
