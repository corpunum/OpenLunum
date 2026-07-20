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

A local orchestrator should begin with [`docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`](docs/LOCAL_ORCHESTRATOR_ONBOARDING.md), then use [`ORCHESTRATOR-PROMPT.md`](ORCHESTRATOR-PROMPT.md).

`CAMPAIGN.md` and `WORK_QUEUE.md` are archive pointers. GitHub issues are the canonical backlog, readiness, assignment, blocker, and acceptance state. Historical operating material is indexed under [`research/archive/operating-model-pre-issue-driven/`](research/archive/operating-model-pre-issue-driven/README.md).

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
- one active implementation PR per worker;
- at most three active implementation PRs repository-wide by default;
- steady state is `main` plus no more than three active task branches;
- more than eight remote branches blocks new dispatch until cleanup or documented exceptions;
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

The dispatcher refuses to run without a valid assignment, rejects reused branches, invokes the worker once, archives local runtime evidence, and exits. The current dispatcher has one global lock, so dispatchers run sequentially unless a reviewed per-lane locking change is accepted.

## GitHub Actions budget

Pull requests remain draft during local iteration and review. Run targeted checks and `pnpm verify` locally, request independent evaluation when required, and mark a coherent candidate ready only when routine pushes are finished. If a ready PR needs changes, return it to draft before pushing.

Hosted Actions are exact-head acceptance evidence, not the development loop. Never weaken required checks to save quota, and do not add recurring full-repository workflows without an explicit reviewed budget.

## Core boundaries

- `Lunum-Sem` is language-neutral structured meaning.
- Lunum-Code is a renderer profile, not canonical semantics.
- Natural source text, language, provenance, and protected literals are retained.
- Heuristic surface records are not canonical semantics.
- Fingerprint or canonicalization changes require versioning, golden vectors, migration rules, and independent review.
- Implementation and protected evaluation data are not modified in the same PR.
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
- maximum attempts, model calls, time, hardware, and Actions budget;
- raw failures, exclusions, errors, and timeouts;
- exact reproduction commands;
- what the result does not prove.

Development results become proposals only after deterministic validation. Support or reference claims require independent evaluation and maintainer acceptance.

## Current ordered work

The local orchestrator should process current work in this order unless the vision owner changes it:

1. issue #255 — historical branch cleanup;
2. issue #253 — honest EN/EL/ES/ID parse and retention baselines after confirming two named local endpoints;
3. issue #188 — live merge-control and branch-protection proof;
4. issues #256 and #257 — accept or reject two preserved distinct proposals.

Historical reports produced by the broken parse path are not accepted baselines. Threshold calibration follows accepted replacement evidence.
