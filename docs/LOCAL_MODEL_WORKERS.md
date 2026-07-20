# Local model workers

OpenLunum supports local OpenAI-compatible chat servers so bounded experiments and implementation tasks can run without per-call API cost. The runner does not assume a specific model family.

Local workers are assignment-driven. They do not continuously scan archived queues or invent work. The local orchestrator begins with `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`.

## Configure a model

Copy `profiles/models/local-openai-compatible.example.json` and set the local endpoint and model identifier. API keys are optional and referenced through an environment-variable name, never stored in the profile.

```bash
pnpm model:doctor -- --profile profiles/models/my-model.json
```

The doctor checks `/models`, records the returned model identity when available, and performs no paid network call unless the profile points to one.

Record quantization, server build, chat template, context size, generation settings, hardware, and seed where supported. Different quantizations or chat templates are different evaluation environments.

Do not start or restart a model server unless an approved issue requires it and current GPU traffic permits it. Avoid loading multiple 35B-class models simultaneously on the current hardware.

## Persistent worktrees, disposable branches

A worker may keep a persistent local worktree for dependencies, caches, and configuration:

```text
~/openlunum-workers/core
~/openlunum-workers/eval
~/openlunum-workers/integration
```

Before each assignment, synchronize the worktree to `origin/main` and create a fresh local branch:

```text
work/<worker>/<issue-number>-<short-name>
```

Do not push the remote branch until the worker has a coherent candidate worth sharing. The remote branch is deleted after squash merge or explicit rejection. Do not maintain permanent remote branches per worker.

## Dispatch one assignment

Create a local assignment in the selected worker worktree:

```bash
worktree=/home/corpunum/openlunum-workers/eval
cp "$worktree/scripts/WORKER_ASSIGNMENT.example.md" \
  "$worktree/reports/orchestrator/WORKER_ASSIGNMENT.md"
$EDITOR "$worktree/reports/orchestrator/WORKER_ASSIGNMENT.md"
```

Then run:

```bash
pnpm worker:dispatch -- "$worktree"
```

The dispatcher:

- refuses to run without an explicit assignment;
- validates issue, worker, branch, and tier metadata;
- refuses reused local or remote branches;
- synchronizes the worktree to `origin/main`;
- invokes the worker exactly once;
- archives the consumed assignment and log locally;
- exits instead of selecting another task.

The current dispatcher uses a global lock at `/tmp/openlunum-pi-dispatch-once.lock`. One dispatcher process may run at a time. The orchestrator may spawn different worker lanes sequentially and may retain up to three active issue-linked candidate PRs, but it must not bypass the lock or run concurrent dispatchers until a reviewed per-lane locking design is accepted.

A persistent service may call the dispatcher only when a valid assignment file exists. It must not run a rapid campaign loop or invoke a model while idle.

## Branch and PR budget

- maximum one active implementation PR per worker;
- maximum three active implementation PRs repository-wide;
- steady-state target is `main` plus no more than three active task branches;
- more than six remote branches requires cleanup review;
- more than eight remote branches blocks new worker dispatch until cleanup or documented exceptions;
- workers never create status, campaign, sync, completion, or idle branches.

## Appropriate work for local workers

- Implement one well-defined issue.
- Generate parse or realization candidates within declared budgets.
- Explore bounded prompt/profile variants.
- Run deterministic tests and summarize failures.
- Propose controlled-vocabulary additions.
- Prepare reproducible manifests and reports.
- Open one draft PR for a coherent candidate.

## Work requiring orchestration

- Decide whether two meanings are truly equivalent.
- Approve schema, fingerprint, or canonicalization changes.
- Modify protected gold data.
- Declare language, model, tokenizer, safety, maturity, or support status.
- Merge safety-policy, release, or production-serving changes.
- Increase a task budget after the declared limit is exhausted.
- Change dispatcher concurrency or shared GPU allocation.

## Draft and Actions behavior

Workers iterate locally and publish draft PRs. Expensive hosted checks are reserved for the acceptance boundary.

- Run targeted tests and `pnpm verify` locally before marking ready.
- Do not push diagnostic commits merely to trigger Actions.
- Mark ready only when routine edits are finished and required evaluation is complete.
- If a ready PR needs changes, convert it back to draft before pushing.
- Never weaken required checks to save quota.

## Worker result contract

Each dispatch ends with one result:

- `candidate` — one coherent draft PR exists;
- `blocked` — a specific dependency, baseline failure, endpoint, credential, or decision is missing;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

The worker does not immediately begin another issue. The orchestrator reviews the result and creates a new assignment only when justified.
