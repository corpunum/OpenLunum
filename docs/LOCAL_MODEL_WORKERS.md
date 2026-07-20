# Local model workers

OpenLunum supports local OpenAI-compatible chat servers so bounded experiments and implementation tasks can run without per-call API cost. The runner does not assume a specific model family.

Local workers are assignment-driven. They do not continuously scan `WORK_QUEUE.md` or invent work.

## Configure a model

Copy `profiles/models/local-openai-compatible.example.json` and set the local endpoint and model identifier. API keys are optional and referenced through an environment-variable name, never stored in the profile.

```bash
pnpm model:doctor -- --profile profiles/models/my-model.json
```

The doctor checks `/models`, records the returned model identity when available, and performs no paid network call unless the profile points to one.

Record quantization, server build, chat template, context size, generation settings, hardware, and seed where supported. Different quantizations or chat templates are different evaluation environments.

## Persistent worktrees, disposable branches

A worker may keep a persistent local worktree for dependencies, caches, and configuration:

```text
~/openlunum-workers/core
~/openlunum-workers/eval
~/openlunum-workers/integration
```

Before each assignment, synchronize the worktree to `origin/main` and create a fresh branch:

```text
work/<worker>/<issue-number>-<short-name>
```

The remote branch is deleted after merge or explicit rejection. Do not maintain permanent remote branches per worker.

## Dispatch one assignment

Create a local assignment from the example:

```bash
cp scripts/WORKER_ASSIGNMENT.example.md reports/orchestrator/WORKER_ASSIGNMENT.md
$EDITOR reports/orchestrator/WORKER_ASSIGNMENT.md
```

Then run:

```bash
scripts/pi-dispatch-once.sh /home/corpunum/openlunum-workers/eval
```

The dispatcher:

- refuses to run without an explicit assignment;
- validates issue, worker, branch, and tier metadata;
- refuses reused local or remote branches;
- synchronizes the worktree to `origin/main`;
- invokes the worker exactly once;
- archives the consumed assignment and log locally;
- exits instead of selecting another task.

A persistent system service may call the dispatcher, but it should do so only when an assignment file exists. Do not run a rapid campaign loop that repeatedly invokes a model while idle.

## Appropriate work for local workers

- Implement one well-defined issue.
- Generate parse or realization candidates within declared budgets.
- Explore bounded prompt/profile variants.
- Run deterministic tests and summarize failures.
- Propose controlled-vocabulary additions.
- Prepare reproducible manifests and reports.
- Open one draft pull request for a coherent candidate.

## Work requiring orchestration

- Decide whether two meanings are truly equivalent.
- Approve schema, fingerprint, or canonicalization changes.
- Modify protected gold data.
- Declare language, model, tokenizer, safety, maturity, or support status.
- Merge safety-policy, release, or production-serving changes.
- Increase a task budget after the declared limit is exhausted.

## Worker result contract

Each dispatch ends with one result:

- `candidate` — one coherent draft pull request exists;
- `blocked` — a specific dependency, baseline failure, or decision is missing;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

The worker does not immediately begin another issue. The orchestrator reviews the result and creates a new assignment only when justified.
