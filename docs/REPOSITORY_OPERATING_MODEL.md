# Repository operating model

OpenLunum is a pre-1.0 research-and-engineering repository. The project benefits from local model workers, but it does not benefit from continuously running agents that manufacture branches, reports, or pull requests without a bounded assignment.

This is the canonical repository-wide operating model. Local orchestrators begin with `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`.

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
10. Branch count, model calls, GPU occupancy, reviewer attention, and GitHub Actions minutes are explicit budgets.

`CAMPAIGN.md` and `WORK_QUEUE.md` are archive pointers. They are not active instructions.

## Branch and worktree model

### Persistent local worktrees

Each lane may keep a stable local worktree so dependencies, build caches, model profiles, and local configuration do not need to be recreated for every task.

Suggested layout:

```text
~/openlunum-workers/core
~/openlunum-workers/eval
~/openlunum-workers/integration
~/openlunum-workers/review
```

A persistent worktree is not a persistent remote branch. Before every assignment, synchronize to `origin/main` and create a fresh task branch.

### Ephemeral task branches

Use:

```text
work/<worker>/<issue-number>-<short-name>
```

Rules:

- one issue per branch;
- one branch per issue;
- one open implementation PR per worker;
- no permanent worker branches;
- no branch reuse after merge or rejection;
- no force-push after an evaluator records a candidate SHA;
- no remote push until a coherent candidate is worth sharing;
- squash merge accepted work;
- delete merged or rejected branches immediately;
- never create campaign, status, completion, sync, or idle branches.

## Work-in-progress and branch limits

The default repository-wide limit is three active implementation PRs:

| Lane | Maximum active implementation work |
|---|---:|
| Core, schema, fingerprints, rendering | 1 |
| Evaluation, datasets, evidence | 1 |
| CLI, API, MCP, adapters, tooling | 1 |

An independent evaluator or reviewer may use a separate read-only or report-only worktree. It must not become the implementation worker for the candidate it evaluates.

Remote branch budget:

- steady-state target: `main` plus heads of active issue-linked PRs;
- target maximum: `main` plus three active task branches;
- cleanup warning: more than six total remote branches;
- hard dispatch stop: more than eight total remote branches unless every exception is documented in a cleanup issue.

The orchestrator may lower WIP whenever work overlaps or review/evaluation is the bottleneck. Raising WIP requires an explicit reason in the affected issues.

## Canonical sources of truth

Use this hierarchy:

1. **GitHub issues** — backlog, readiness, assignment, blockers, and acceptance criteria.
2. **GitHub milestones** — roadmap and release grouping.
3. **Pull requests** — candidate implementation and evidence discussion.
4. **Accepted evidence records** — support and maturity claims.
5. **`STATUS.md`** — periodically reconciled summary, never the assignment queue.
6. **`docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`** — local coordination entry point.
7. **`ORCHESTRATOR.md`** — stable operations runbook.
8. **Git history and `research/archive/`** — historical context only.

A markdown checkbox is not a distributed lock. Assignment is represented by a ready issue and an explicit local assignment file.

## Issue requirements

A ready issue contains:

- problem statement or falsifiable hypothesis;
- goal and explicit non-goals;
- affected lane and likely paths;
- acceptance criteria;
- required local and hosted checks;
- evidence and reproducibility requirements;
- maximum attempts, model calls, wall-clock time, and hardware budget where applicable;
- change tier;
- dependencies, blockers, and stop conditions;
- evaluator requirement for Tier 3 work.

An issue is not ready if a semantic decision, dataset choice, success metric, or authority boundary is undefined.

## Roles

### Vision owner

Chooses milestone priorities, acceptable tradeoffs, semantic/product decisions, protected-data policy, release/support claims, and scarce compute/review allocation.

### Local orchestrator

- reconciles issues, PRs, branches, worktrees, services, and model endpoints;
- enforces WIP and branch budgets;
- selects ready issues;
- assigns exactly one issue to each worker run;
- prevents overlap and duplicate experiments;
- chooses the change tier;
- protects model, time, GPU, branch, and Actions budgets;
- requests independent evaluation when required;
- decides whether a candidate may proceed to hosted acceptance checks;
- keeps issue, evidence, branch, and summary documentation consistent after merge.

The orchestrator must not keep workers busy for the sake of activity.

### Worker

- synchronizes from `origin/main`;
- reads the assigned issue and relevant architecture documents;
- creates one ephemeral local task branch;
- establishes the declared baseline;
- performs bounded implementation or experimentation;
- runs required local checks;
- publishes failures and limitations;
- opens one draft PR when a coherent candidate exists;
- exits with `candidate`, `blocked`, or `no-improvement`.

A worker may not select another issue or create a status/campaign report after completing its assignment.

### Independent evaluator or reproducer

- evaluates a fixed candidate commit;
- does not modify the candidate;
- uses holdout, protected, adversarial, or product data not optimized by the worker when applicable;
- verifies dataset, profile, environment, and commit hashes;
- reproduces declared commands;
- separates exact, near-only, invalid, timeout, error, and excluded outcomes;
- reports negative cases and limitations.

Prefer a different model or configuration from the implementation worker.

### Maintainer and merge steward

Controls `main`, protected data, credentials, releases, schema/fingerprint promotion, final support claims, merge authority, and branch cleanup.

## Process model

```text
ready issue
  -> orchestrator assignment
  -> clean persistent worktree synchronized to main
  -> local ephemeral task branch
  -> baseline
  -> bounded one-shot worker
  -> local checks
  -> coherent draft PR or blocked/no-improvement report
  -> code review
  -> independent evaluation when required
  -> ready-for-review
  -> exact-head hosted checks
  -> squash merge or reject
  -> issue/evidence update
  -> branch deletion and pruning
```

Persistent daemons may monitor health or assignment presence. They must not repeatedly invoke a model when no assignment exists, select work, create branches, convert drafts to ready, or merge.

The current one-shot dispatcher uses a global lock at `/tmp/openlunum-pi-dispatch-once.lock`. Supported operation is one dispatcher process at a time. Multiple lanes may retain active issue-linked candidate PRs, but concurrent dispatch requires a separately reviewed per-lane locking change.

## Change tiers

### Tier 1 — mechanical

Examples: spelling fixes, non-semantic documentation corrections, test organization, and low-risk tooling cleanup.

```text
worker -> targeted checks -> draft PR -> review -> acceptance checks -> merge
```

### Tier 2 — normal implementation

Examples: CLI features, API behavior, reporting, adapters, and internal refactors.

```text
worker -> local verify -> draft PR -> code review -> acceptance checks -> merge
```

### Tier 3 — semantic or evidence-sensitive

Examples: schema, canonicalization, fingerprints, parser scoring, protected datasets, safety policy, renderer meaning preservation, and support or maturity claims.

```text
worker candidate -> independent evaluator/reproducer
-> orchestrator evidence decision -> strict exact-head checks
-> maintainer merge or rejection
```

Average gains cannot override losses of negation, conditions, entities, quantities, time, modality, provenance, protected literals, or safety constraints.

## Worker assignment and result contract

Assignments use `scripts/WORKER_ASSIGNMENT.example.md` and are placed at:

```text
reports/orchestrator/WORKER_ASSIGNMENT.md
```

Dispatch with:

```bash
pnpm worker:dispatch -- <worktree>
```

The dispatcher refuses missing or malformed assignments, reused branches, and simultaneous dispatcher processes. It archives the assignment and log locally and exits after one model invocation.

Worker results:

- `candidate` — a coherent draft PR exists;
- `blocked` — a named dependency, decision, endpoint, credential, or baseline is missing;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

The orchestrator must review the result before writing another assignment.

## GitHub Actions budget policy

Local iteration uses local checks. Hosted Actions are reserved for coherent acceptance candidates.

- Keep PRs draft during routine iteration and review.
- Do not push a branch merely to obtain diagnostic CI output.
- Expensive jobs must not run while a PR is draft.
- Marking a coherent PR ready should trigger exact-head hosted checks.
- Avoid routine pushes after ready-for-review.
- If changes are required, convert the PR back to draft before pushing, re-run local checks, then mark ready again once.
- Re-run only failed or invalidated jobs where possible.
- Do not run duplicate `push` and `pull_request` workflows for the same task branch.
- Named-model, multilingual, protected-data, strict, and release evaluations should be manual or milestone-triggered unless a reviewed schedule has explicit value and budget.
- Do not add nightly full-repository workflows by default.
- Never weaken, rename, remove, skip, or spoof a required check to save budget.
- Never accept stale checks from another commit or jobs with no recorded steps.

Intended sequence:

```text
local iteration while draft
-> independent review/evaluation
-> mark ready once
-> exact-head required checks
-> merge or return to draft
```

## Pull request expectations

Every PR must:

- link its issue;
- state the change tier;
- identify the exact goal and non-goals;
- include reproduction commands and local-check results;
- identify evidence artifacts where applicable;
- disclose failures, exclusions, errors, and limitations;
- avoid unsupported support, maturity, or production claims.

For Tier 3 work, the evaluator binds its verdict to the candidate head SHA.

Before merge, confirm the PR targets `main`, is not draft, has an unchanged reviewed head, has successful required checks with real steps on that exact head, has no current blocking findings, satisfies issue acceptance, and does not co-edit protected implementation and protected data.

## Accepted evidence

Support and maturity statements should be backed by an accepted-evidence record containing at least:

- capability identifier and accepted status;
- accepted commit SHA;
- dataset identifier and hash;
- model and tokenizer profiles;
- report paths;
- approving role;
- limitations and expiry or review conditions.

Until a complete registry exists, issue acceptance and exact report references are authoritative. Prose summaries must not promote an experiment to supported or reference-stable.

## Branch cleanup and archival

Periodically remove remote branches that are:

- attached to merged PRs;
- fully contained in `main`;
- attached to explicitly rejected or closed PRs with no unique work to preserve;
- obsolete campaign, status, sync, completion, telemetry, or generated-documentation branches.

Do not automatically delete closed-unmerged branches with unique commits until the maintainer confirms abandonment or preserves the idea as an issue, patch, tag, or archive record.

Issue #255 is the current cleanup ledger. The pre-issue-driven campaign and markdown queue are indexed at `research/archive/operating-model-pre-issue-driven/README.md`.

## Current direction

Process current work in this order unless the vision owner changes it:

1. #255 — historical branch cleanup.
2. #253 — honest EN/EL/ES/ID parse and retention baselines after confirming two named local model endpoints.
3. #188 — live branch-protection and merge-control proof.
4. #256 and #257 — accept or reject preserved distinct proposals and rebuild accepted ideas from current `main`.

Threshold calibration must follow accepted baseline evidence; it must not be manufactured from historical runs produced by the broken experiment path.
