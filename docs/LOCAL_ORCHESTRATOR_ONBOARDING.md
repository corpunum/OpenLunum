# Local orchestrator onboarding

This is the canonical entry point for the local OpenLunum orchestrator.

The local orchestrator may inspect the repository, maintain worktrees, create explicit assignments, spawn bounded local workers, request independent evaluation, prepare pull requests, and perform branch hygiene. It must not run an autonomous campaign, invent work, bypass merge controls, or keep models busy merely because compute is available.

Give the orchestrator this instruction:

> Read `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`, `docs/LUNUM_READINESS.md`, and `ORCHESTRATOR-PROMPT.md`, synchronize the review worktree to `origin/main`, reconcile GitHub issues and pull requests, then continue only with explicit ready issues under the one-shot worker model.

## Required reading order

Before taking action, read:

1. `VISION.md`
2. `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`
3. `docs/LUNUM_READINESS.md`
4. `docs/REPOSITORY_OPERATING_MODEL.md`
5. `ORCHESTRATOR.md`
6. `ORCHESTRATOR-PROMPT.md`
7. `AGENTS.md`
8. `docs/EXPERIMENT_PROTOCOL.md`
9. `docs/EVALUATION_PROTOCOL.md`
10. the selected GitHub issue and its discussion

`docs/LUNUM_READINESS.md` is the living support, maturity and evidence tracker. Read it before proposing or accepting production, language, model, tokenizer, compaction, safety or adoption claims. Any score change is Tier 3 and requires linked accepted evidence plus independent validation.

`CAMPAIGN.md` and `WORK_QUEUE.md` are archive pointers. They are not schedulers or current state.

## Authority and boundaries

The vision owner decides strategic priorities, semantic tradeoffs, release/support claims, protected-data policy, and exceptional budget increases.

The local orchestrator may:

- read and reconcile repository state;
- create or refine bounded issues;
- assign one ready issue to one worker run;
- maintain persistent local worktrees;
- spawn the one-shot dispatcher;
- review worker results and request changes;
- request an independent evaluator for Tier 3 work;
- prepare draft pull requests;
- move a coherent candidate to the hosted acceptance boundary;
- squash-merge only when merge policy and maintainer authority permit;
- delete merged, rejected, contained, and explicitly abandoned branches;
- archive obsolete operational documentation and telemetry.

The local orchestrator may not:

- push worker changes directly to `main`;
- select work from archived markdown queues;
- restart paused workers or shared GPU services without authorization;
- create status, campaign, sync, completion, or idle branches;
- weaken, skip, spoof, or reuse required checks;
- approve semantic, protected-data, safety, support, or maturity claims without independent evidence;
- silently increase model calls, time, hardware, or Actions budgets;
- merge a changed head after the final review or evaluation.

## Process topology

```text
vision owner
    |
    v
local orchestrator
    |-- repository reconciliation and branch janitor
    |-- issue definition and assignment writer
    |-- worker dispatcher (one-shot)
    |       |-- core/schema/render worker worktree
    |       |-- eval/data/evidence worker worktree
    |       `-- integration/CLI/API/tooling worker worktree
    |-- independent evaluator/reproducer
    `-- merge steward and evidence recorder
```

The orchestrator is persistent only as a coordination role. Worker model invocations are ephemeral.

### Long-lived local processes

Only non-generative health and coordination processes may remain active:

- a watchdog that reports dead infrastructure;
- an assignment-file or timer trigger that invokes the dispatcher only when an assignment exists;
- local model servers intentionally started for an approved issue;
- optional read-only repository/PR monitoring.

These processes must not select issues, create branches, invoke models while idle, convert drafts to ready, or merge candidates.

### One-shot processes

The following must run once and exit:

- implementation worker;
- experiment worker;
- evaluator or reproducer session;
- branch cleanup batch;
- release/evidence generation task.

Each worker ends with exactly one result:

- `candidate` — a coherent draft pull request or evidence candidate exists;
- `blocked` — a named dependency, decision, model endpoint, credential, or baseline is missing;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

## Local worktree layout

Recommended layout:

```text
/home/corpunum/OpenLunum                    # primary checkout; automation may reset it
/home/corpunum/openlunum-workers/review     # orchestrator/reviewer worktree
/home/corpunum/openlunum-workers/core       # core/schema/render lane
/home/corpunum/openlunum-workers/eval       # evaluation/data/evidence lane
/home/corpunum/openlunum-workers/integration # CLI/API/MCP/adapter/tooling lane
```

Persistent worktrees are allowed. Persistent remote worker branches are not.

Perform orchestrator edits in the review worktree or a dedicated issue worktree, never in a checkout that another process may reset.

## First boot and every check-in

Synchronize the review worktree:

```bash
cd /home/corpunum/openlunum-workers/review
git fetch --prune origin
git checkout main
git reset --hard origin/main
```

Inspect canonical state:

```bash
repo="corpunum/OpenLunum"

gh pr list --repo "$repo" --state open --limit 100
gh issue list --repo "$repo" --state open --limit 100
git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sort
```

Inspect local control flags without automatically clearing them:

```bash
find reports/orchestrator reports/pi-loop -maxdepth 2 -type f \
  \( -name 'NEEDS_CLOUD' -o -name 'STUCK' -o -name 'ESCALATED' \
     -o -name 'THERMAL_HALT' -o -name 'PAUSED' \) -print 2>/dev/null
```

Check for legacy services before dispatching workers:

```bash
systemctl --user list-units --all | grep -Ei 'openlunum|pi-(loop|worker|orchestrator)' || true
systemctl --user list-timers --all | grep -Ei 'openlunum|pi-(loop|worker|orchestrator)' || true
```

Do not guess service names. Disable only a confirmed legacy campaign loop, and preserve watchdog/health processes that do not invoke models while idle.

## Reconciliation algorithm

Run this logic in order:

1. Confirm the exact `origin/main` SHA.
2. List open pull requests and map each to one issue, worker, lane, branch, and exact head SHA.
3. Count remote branches and classify them as active, merged/contained, explicitly preserved, or stale.
4. Stop new dispatch if branch or PR budgets are exceeded.
5. Check issue blockers, dependencies, acceptance criteria, tier, evidence requirements, and budgets.
6. Select at most one ready issue for each free lane.
7. Write an explicit assignment and dispatch once.
8. Review the candidate locally while the PR remains draft.
9. Request independent evaluation for Tier 3 changes.
10. Mark ready only when the candidate is coherent and no further routine pushes are expected.
11. Use hosted Actions once at the acceptance boundary.
12. Merge or reject, update the issue/evidence state, and delete the branch.
13. Reconcile `STATUS.md` only when accepted capabilities or honest limitations changed.
14. Reconcile `docs/LUNUM_READINESS.md` only when linked accepted evidence changes a readiness score, action status or support boundary.

Idle is correct whenever no issue passes this sequence.

## Branch budget

Steady state is:

```text
main + heads of active issue-linked pull requests
```

Repository limits:

- maximum three active implementation pull requests repository-wide;
- maximum one active implementation pull request per worker;
- maximum one implementation branch per issue;
- no remote branch until a worker has a coherent candidate worth sharing;
- delete the task branch immediately after squash merge or explicit rejection;
- preserve unique historical work as a GitHub issue, patch, tag, or archive record before deleting its branch.

Branch-count guardrail:

- target: `main` plus no more than three active task branches;
- warning: more than six total remote branches;
- hard stop: more than eight total remote branches — create no new task branch until cleanup is complete or every exception is documented in a cleanup issue.

Issue #255 is the current cleanup ledger for the historical branch backlog. Issues #256 and #257 preserve two distinct proposals while their old branches are evaluated.

## Selecting and defining work

GitHub issues are the canonical backlog. A worker issue is ready only when it contains:

- problem statement or falsifiable hypothesis;
- goal and explicit non-goals;
- likely paths and affected lane;
- change tier;
- acceptance criteria;
- required local and hosted checks;
- evidence and reproducibility requirements;
- model-call, attempt, wall-clock, and hardware budgets where relevant;
- dependencies, blockers, and stop conditions;
- evaluator requirement for Tier 3 work.

The orchestrator must resolve undefined semantic choices before assigning the issue. A worker is not allowed to invent product policy or success criteria.

## Assignment and worker spawning

Copy the assignment example into the selected worker worktree:

```bash
worktree=/home/corpunum/openlunum-workers/eval
cp "$worktree/scripts/WORKER_ASSIGNMENT.example.md" \
  "$worktree/reports/orchestrator/WORKER_ASSIGNMENT.md"
$EDITOR "$worktree/reports/orchestrator/WORKER_ASSIGNMENT.md"
```

Then dispatch exactly once:

```bash
pnpm worker:dispatch -- "$worktree"
```

The assignment must use:

```text
work/<worker>/<issue-number>-<short-name>
```

The current dispatcher uses one global lock at `/tmp/openlunum-pi-dispatch-once.lock`. Therefore the supported safe mode is one active dispatcher process at a time. The orchestrator can spawn different workers in sequence and may maintain up to three active issue branches/PRs, but it must not bypass the lock or run concurrent dispatchers until a reviewed per-lane locking change exists.

A worker must not select another issue after its assignment finishes. The orchestrator reviews the result before any new assignment is written.

## Change tiers and evaluation

### Tier 1 — mechanical

Non-semantic documentation, spelling, test organization, and low-risk tooling cleanup.

```text
worker -> targeted local checks -> draft PR -> review -> acceptance checks -> merge
```

### Tier 2 — normal implementation

CLI, API, MCP, adapters, reporting, and internal implementation work.

```text
worker -> local verify -> draft PR -> code review -> acceptance checks -> merge
```

### Tier 3 — semantic or evidence-sensitive

Schema, canonicalization, fingerprints, parser scoring, protected data, safety policy, renderer preservation, and support or maturity claims.

```text
worker candidate -> independent evaluator/reproducer
-> orchestrator evidence decision -> exact-head acceptance checks
-> maintainer merge or rejection
```

The evaluator pins the candidate SHA, does not edit the candidate, verifies dataset/model/profile hashes, preserves failures and exclusions, and reports exact, near-only, invalid, timeout, and error outcomes separately where applicable.

## GitHub Actions and quota policy

Hosted Actions are an acceptance gate, not the development loop.

Rules:

- Keep a new pull request draft during normal local iteration and review.
- Do not push a remote branch solely to obtain diagnostic CI output.
- Run targeted tests, `pnpm verify`, and applicable strict or experiment checks locally first.
- Mark the PR ready only when the diff, issue scope, local checks, and required evaluation are coherent.
- Once ready, avoid routine fixup pushes. If changes are required, convert the PR back to draft before pushing, re-run local checks, then mark ready again once.
- Re-run only failed or invalidated jobs when possible.
- Do not run duplicate push and pull-request workflows for the same candidate.
- Named-model, multilingual, protected-data, strict, and release evaluations should be manual or milestone-triggered unless a reviewed schedule has a clear value and budget.
- Do not add nightly full-repository workflows by default.
- Never remove, rename, skip, or weaken a required check to save quota.
- Never accept success from another SHA or a job with no recorded steps.

The intended hosted sequence is:

```text
local iteration while draft
-> independent review/evaluation
-> mark ready once
-> exact-head required checks
-> merge or return to draft
```

## Pull request and merge lifecycle

A worker publishes one coherent draft PR that:

- links the assigned issue;
- states the tier, goal, and non-goals;
- lists exact reproduction and local-check commands;
- records candidate head SHA and evidence paths;
- discloses failures, exclusions, errors, and limitations;
- avoids unsupported production, support, language, model, tokenizer, safety, or maturity claims.

Before merge confirm:

- PR targets `main`;
- PR is not draft;
- exact head is unchanged since final review/evaluation;
- all required checks succeeded on that exact head with real steps;
- current-head blocking findings are resolved;
- issue acceptance criteria are satisfied;
- protected implementation and protected evaluation data are not co-edited;
- expected-head guard is used.

After squash merge or rejection:

1. update or close the issue;
2. record accepted evidence references where relevant;
3. delete the remote task branch;
4. prune local branches/worktrees;
5. update `STATUS.md` only if accepted capability state changed;
6. update `docs/LUNUM_READINESS.md` only when the accepted evidence changes a score, action, support boundary or evidence ledger;
7. verify the remote branch count remains within budget.

## Current ordered priorities

Unless the vision owner changes priority, process explicit ready GitHub issues in owner-approved order. Do not infer current priority from historical prose in this file; reconcile live issue and PR state first.

Do not create work merely to maintain activity. New issues should advance the vision, close an evidence gap, reduce operational risk, or remove a confirmed blocker.

## First-session completion checklist

A newly onboarded orchestrator has completed onboarding when it can report:

- exact current `main` SHA;
- open issues and open PRs;
- total remote branch count and cleanup exceptions;
- active local services and which, if any, invoke models;
- available worktrees and model endpoints;
- whether the dispatcher assignment file exists;
- whether branch/PR budgets permit a new dispatch;
- the next ready issue and why it is ready;
- the exact local checks and Actions boundary for that issue;
- the current readiness areas affected by that issue;
- any decision that must be escalated to the vision owner.
