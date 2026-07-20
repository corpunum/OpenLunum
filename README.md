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

## North star

A product records meaning once, retains the original evidence, retrieves that meaning across languages, and renders only the representation best suited to the receiving model and task.

```text
source evidence -> canonical semantics -> stable identity -> measured rendering -> safe use
```

Token compression alone is not success. Success requires meaning preservation, downstream task quality, safety, reversibility, compatibility, and reproducible evidence.

## Start here

Humans, coding agents, and research agents should read:

1. [`START_HERE.md`](START_HERE.md)
2. [`VISION.md`](VISION.md)
3. [`AGENTS.md`](AGENTS.md)
4. [`docs/REPOSITORY_OPERATING_MODEL.md`](docs/REPOSITORY_OPERATING_MODEL.md)
5. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
6. [`docs/EXPERIMENT_PROTOCOL.md`](docs/EXPERIMENT_PROTOCOL.md)
7. [`docs/EVALUATION_PROTOCOL.md`](docs/EVALUATION_PROTOCOL.md)
8. [`STATUS.md`](STATUS.md)

`WORK_QUEUE.md` preserves historical roadmap context. GitHub issues are the canonical backlog, readiness, assignment, and acceptance state.

## Bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

Node 22 and pnpm 10.13.1 are required.

## Repository operating model

OpenLunum uses persistent local worktrees and disposable remote task branches.

```text
work/<worker>/<issue-number>-<short-name>
```

Key rules:

- workers receive one explicit ready GitHub issue;
- one issue per branch;
- one active implementation pull request per worker;
- at most three active implementation pull requests repository-wide by default;
- workers run once and exit with `candidate`, `blocked`, or `no-improvement`;
- autonomous workers never push to or merge into `main`;
- semantic and evidence-sensitive work requires independent evaluation;
- accepted work is squash merged and its branch is deleted;
- workers do not create campaign, status, sync, completion, or idle branches.

See [`docs/REPOSITORY_OPERATING_MODEL.md`](docs/REPOSITORY_OPERATING_MODEL.md) for the complete role, branch, issue, CI, and acceptance model.

## Local worker dispatch

Create a local one-shot assignment:

```bash
cp scripts/WORKER_ASSIGNMENT.example.md reports/orchestrator/WORKER_ASSIGNMENT.md
$EDITOR reports/orchestrator/WORKER_ASSIGNMENT.md
pnpm worker:dispatch -- /home/corpunum/openlunum-workers/eval
```

The dispatcher refuses to run without a valid assignment, rejects reused branches, invokes the worker once, archives local runtime evidence, and exits.

## Core boundaries

- `Lunum-Sem` is language-neutral structured meaning.
- Lunum-Code is a renderer profile, not canonical semantics.
- Natural source text, language, provenance, and protected literals are retained.
- Heuristic surface records are not canonical semantics.
- Fingerprint or canonicalization changes require versioning, golden vectors, migration rules, and independent review.
- Implementation and protected evaluation data are not modified in the same pull request.
- A model cannot be the only judge of its own output.

## Main areas

OpenLunum contains:

- a strict TypeScript semantic core;
- canonical serialization and exact/near-semantic fingerprints;
- safe, short, and tight renderer profiles;
- multilingual parsing and realization experiment tooling;
- tokenizer and model-profile measurement;
- migration and compatibility tooling;
- CLI, HTTP API, MCP, and OpenUnum adoption paths;
- reproducible experiment manifests and reports;
- semantic, safety, rollback, and quality gates;
- local worker, evaluator, and orchestration infrastructure.

Current implementation status and honest limitations are maintained in [`STATUS.md`](STATUS.md). Capability lists in prose are summaries, not acceptance evidence.

## Experiment expectations

Behavior-changing and evidence-changing work should declare:

- issue and hypothesis;
- baseline commit;
- dataset identifier and SHA-256;
- model, tokenizer, quantization/build, chat template, and generation settings;
- hard gates and target metrics;
- maximum attempts, model calls, and time budget;
- raw failures, exclusions, errors, and timeouts;
- exact reproduction commands;
- what the result does not prove.

Development results become proposals only after deterministic validation. Support or reference claims require independent evaluation and maintainer acceptance.

## Current strategic evidence milestone

Issue #253 is the current bounded milestone for honest EN/EL/ES/ID parse and retention baselines after repairs to the parse prompt, token budget, controlled vocabulary, and near-semantic scoring path.

Historical reports produced by the broken parse path are not accepted baselines. Threshold calibration follows accepted replacement evidence.

## Vision

Lunum aims to become:

1. a semantic interlingua for agent memory;
2. a stable exact and near-semantic identity layer;
3. a tokenizer-aware model-context representation;
4. a safe mixed-context compiler;
5. a protocol for inspectable agent state;
6. an adoption standard across unrelated products;
7. an evidence-driven project where failures are observable and reversible.

Read [`VISION.md`](VISION.md) for the complete long-term direction.

## Honest boundary

OpenLunum is not yet a production-approved general language-agnostic parser, a universal compression system, or proof of correctness across arbitrary models and products. It is a pre-1.0 architecture, reference core, experiment framework, and growing body of reproducible evidence.
