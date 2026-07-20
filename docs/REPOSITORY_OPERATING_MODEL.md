# Repository operating model

OpenLunum is a pre-1.0 research-and-engineering repository. The project benefits from local model workers, but it does not benefit from continuously running agents that manufacture branches, reports, or pull requests without a bounded assignment.

This document is the canonical operating model for local workers, evaluators, orchestrators, and maintainers.

## Principles

1. `main` is the only persistent shared development line.
2. Autonomous workers never push directly to `main`.
3. Local worktrees may persist; remote task branches must be short-lived.
4. GitHub issues are the canonical backlog and assignment state.
5. A worker receives one issue, performs one bounded run, and exits.
6. Candidate generation and acceptance are separate roles.
7. Hosted CI is an acceptance gate, not an inner development loop.
8. Claims about support or maturity require accepted, reproducible evidence.
9. Idle is a valid state. Workers must not invent work when no issue is ready.

## Branch and worktree model

### Persistent local worktrees

Each worker may keep a stable local worktree so dependencies, build caches, model profiles, and local configuration do not need to be recreated for every task.

Suggested layout:

```text
~/openlunum-workers/core
~/openlunum-workers/eval
~/openlunum-workers/integration
~/openlunum-workers/reviewer
```

A persistent worktree is not a persistent remote branch. Before every assignment, the worktree must be synchronized to `origin/main` and a fresh task branch must be created.

### Ephemeral remote branches

Use this format:

```text
work/<worker>/<issue-number>-<short-name>
```

Examples:

```text
work/qwen-core/253-baseline-manifest
work/qwen-eval/253-retention-runner
work/codex/254-ci-cost-reduction
```

Rules:

- one issue per branch;
- one open implementation pull request per worker;
- no permanent worker branches;
- no branch reuse after merge or rejection;
- no force-push after an evaluator has recorded a commit SHA;
- squash merge accepted work;
- delete merged or rejected branches immediately;
- never create campaign, status, completion, sync, or idle branches.

## Work-in-progress limits

The default repository-wide limit is three active implementation pull requests:

| Lane | Maximum active implementation work |
|---|---:|
| Core, schema, fingerprints, rendering | 1 |
| Evaluation, datasets, evidence | 1 |
| CLI, API, MCP, adapters, tooling | 1 |

An independent evaluator or reviewer may have a separate read-only or report-only worktree. It must not simultaneously become the implementation worker for the candidate it is evaluating.

The orchestrator may lower the limit when work overlaps or evidence review becomes the bottleneck. Raising the limit requires an explicit reason recorded in the relevant issue or orchestration log.

## Canonical sources of truth

Use the following hierarchy:

1. **GitHub issues** — backlog, readiness, assignment, blockers, and acceptance criteria.
2. **GitHub milestones** — roadmap and release grouping.
3. **Pull requests** — candidate implementation and evidence discussion.
4. **Accepted evidence records** — support and maturity claims.
5. **`STATUS.md`** — periodically reconciled summary, never the assignment queue.
6. **`ORCHESTRATOR.md`** — stable operations runbook, not an append-only diary.
7. **`WORK_QUEUE.md`** — historical roadmap and migration aid only.

A markdown checkbox is not a distributed lock. Assignment is represented by the issue assignee and/or an active pull request linked to the issue.

## Issue requirements

A ready worker issue should contain:

- problem statement or falsifiable hypothesis;
- explicit non-goals;
- affected work area and likely paths;
- acceptance criteria;
- required local checks;
- required hosted checks;
- evidence and reproducibility requirements;
- maximum attempts, model calls, and wall-clock budget where applicable;
- risk tier;
- dependencies and blockers.

An issue is not ready if a semantic decision, dataset choice, or success metric is still undefined.

## Roles

### Vision owner

The vision owner chooses milestone priorities, acceptable tradeoffs, and where scarce compute and review attention should be spent. The vision owner decides whether a result advances Lunum rather than merely adding code.

### Orchestrator

The orchestrator:

- selects ready issues;
- enforces work-in-progress limits;
- assigns exactly one issue to each worker run;
- prevents overlapping branches and duplicate experiments;
- chooses the appropriate change tier;
- records blockers and decisions;
- requests independent evaluation when required;
- decides whether a candidate may proceed to acceptance checks;
- keeps documentation and issue state consistent after merge.

The orchestrator must not keep workers busy for the sake of activity.

### Worker

A worker:

- synchronizes from `origin/main`;
- reads the assigned issue and relevant architecture documents;
- creates one ephemeral task branch;
- establishes the declared baseline;
- performs bounded implementation or experimentation;
- runs the required local checks;
- publishes failures and limitations;
- opens one draft pull request when a coherent candidate exists;
- exits with one of: `candidate`, `blocked`, or `no-improvement`.

A worker may not create a replacement task, status PR, or campaign report when its assignment is complete.

### Independent evaluator

The evaluator:

- evaluates a fixed candidate commit;
- uses holdout, protected, or product data not optimized by the worker when applicable;
- verifies dataset, profile, environment, and commit hashes;
- reproduces the declared commands;
- separates exact, near-semantic, invalid, timeout, and excluded outcomes;
- reports negative cases and limitations;
- does not modify the candidate while evaluating it.

Prefer a different model or configuration from the implementation worker.

### Maintainer and merge steward

The maintainer controls `main`, protected data, credentials, releases, schema and fingerprint promotion, and final support claims.

The merge steward confirms:

- the pull request targets `main`;
- the head SHA is unchanged from review and evaluation;
- required exact-head checks passed;
- blocking feedback is resolved;
- the issue acceptance criteria are satisfied;
- the branch is deleted after merge or rejection;
- accepted issue and evidence state are updated.

## Change tiers

### Tier 1 — mechanical

Examples: spelling fixes, non-semantic documentation corrections, test organization, and low-risk tooling cleanup.

Required path:

```text
worker -> targeted checks -> small PR -> review -> merge
```

### Tier 2 — normal implementation

Examples: CLI features, API behavior, reporting, adapters, and internal refactors.

Required path:

```text
worker -> local verify -> PR -> code review -> hosted exact-head checks -> merge
```

### Tier 3 — semantic or evidence-sensitive

Examples: schema, canonicalization, fingerprints, parser scoring, protected datasets, safety policy, renderer meaning preservation, and support or maturity claims.

Required path:

```text
worker candidate -> independent evaluator -> orchestrator evidence decision
-> strict exact-head checks -> maintainer merge
```

Average gains cannot override losses of negation, conditions, entities, quantities, time, modality, provenance, protected literals, or safety constraints.

## Worker lifecycle

```text
ready issue
  -> orchestrator assignment
  -> clean worktree synchronized to main
  -> ephemeral task branch
  -> baseline
  -> bounded candidate work
  -> local checks
  -> draft PR or blocked/no-improvement report
  -> independent evaluation when required
  -> ready-for-review
  -> hosted exact-head checks
  -> squash merge or reject
  -> delete branch
  -> update issue and accepted evidence
```

A worker process should run once for an assignment and exit. Persistent daemons may watch health or dispatch work, but they must not repeatedly invoke a model when no assignment exists.

## CI budget policy

Local iteration should use local checks. Hosted GitHub Actions should be reserved for acceptance boundaries.

- Do not run duplicate `push` and `pull_request` workflows for the same task branch.
- Expensive jobs should not run while a pull request is draft.
- Marking a pull request ready should trigger the exact-head hosted checks.
- Re-run only failed or invalidated jobs when possible.
- Strict, multilingual, named-model, and protected-data evaluations belong in sensitive-path, scheduled, manual, or milestone workflows rather than every edit cycle.
- Never weaken a required check merely to save Actions budget.

## Pull request expectations

Every pull request must:

- link its issue;
- state the change tier;
- identify the exact target and non-goals;
- include reproduction commands and local-check results;
- identify evidence artifacts where applicable;
- disclose failures, exclusions, and limitations;
- avoid unsupported support, maturity, or production claims.

For Tier 3 work, the evaluator must bind its verdict to the candidate head SHA.

## Accepted evidence

Support and maturity statements should eventually be backed by a machine-readable accepted-evidence record containing at least:

- capability identifier;
- accepted status;
- accepted commit SHA;
- dataset identifier and hash;
- model and tokenizer profiles;
- report paths;
- approving role;
- limitations and expiry or review conditions.

Until that registry exists, issue acceptance and exact report references are authoritative. Prose summaries must not silently promote an experimental result to supported or reference-stable.

## Current milestone direction

The immediate evidence milestone is honest multilingual parsing and retention evidence after the repaired prompt, token-budget, controlled-vocabulary, and near-semantic paths. Issue #253 is the current bounded unit for EN/EL/ES/ID baseline work.

Threshold calibration must follow accepted baseline evidence; it must not be manufactured from historical runs produced by the broken experiment path.

## Branch cleanup

The orchestrator or local maintenance task should periodically remove remote branches that are:

- attached to merged pull requests;
- attached to explicitly rejected or closed pull requests with no unique work to preserve;
- fully contained in `main`;
- obsolete generated documentation or campaign branches.

Do not automatically delete closed-unmerged branches that contain unique commits until the maintainer confirms they are abandoned or preserved elsewhere.
