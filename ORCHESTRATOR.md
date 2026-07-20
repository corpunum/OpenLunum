# OpenLunum orchestrator runbook

This is the stable operational runbook for the local orchestrator, human maintainer, or strong-model coordinator. Start with `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`.

This file is not an append-only activity diary. Durable state belongs in GitHub issues, pull requests, architecture decision records, and accepted evidence.

## Mission

Turn the Lunum vision into bounded, independently reviewable work while protecting semantic correctness, reproducibility, safety, repository health, branch hygiene, and compute/Actions budgets.

The orchestrator is not responsible for keeping workers constantly busy. Idle is correct when no issue is ready.

## Canonical state

Use these sources in order:

1. GitHub issues — backlog, readiness, assignment, blockers, and acceptance.
2. GitHub milestones — roadmap and release grouping.
3. Pull requests — active candidates and review state.
4. Exact-head checks and accepted evaluation reports — verification evidence.
5. `STATUS.md` — periodically reconciled summary.
6. `ORCHESTRATOR.md` and `docs/REPOSITORY_OPERATING_MODEL.md` — stable process.
7. Git history and the research archive — historical context only.

`CAMPAIGN.md` and `WORK_QUEUE.md` are archive pointers. Never use them to select or claim work.

## Local paths

| Purpose | Path |
|---|---|
| Primary checkout | `/home/corpunum/OpenLunum` |
| Review/orchestrator worktree | `/home/corpunum/openlunum-workers/review` |
| Core/schema/render worker | `/home/corpunum/openlunum-workers/core` |
| Eval/data/evidence worker | `/home/corpunum/openlunum-workers/eval` |
| Integration/CLI/API worker | `/home/corpunum/openlunum-workers/integration` |
| Canonical onboarding | `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md` |
| One-shot dispatcher | `scripts/pi-dispatch-once.sh` |
| Worker task prompt | `scripts/pi-task-prompt.md` |
| Assignment template | `scripts/WORKER_ASSIGNMENT.example.md` |
| Legacy compatibility loop | `scripts/pi-loop.sh` |
| Merge policy | `scripts/pi-merge-policy.mjs` |
| Merge automation | `scripts/pi-merge-loop.sh` |
| Local health orchestrator | `scripts/pi-orchestrator.sh` |
| Worker assignments/logs | `reports/orchestrator/` |
| Historical loop telemetry | `reports/pi-loop/` |
| Experiment reports | `reports/experiments/` |

The primary checkout may be reset by local automation. Perform orchestrator edits from the review worktree or a dedicated issue worktree.

## Repository and process limits

- At most three active implementation pull requests repository-wide.
- At most one active implementation pull request per worker.
- One issue per branch and one branch per issue.
- Use `work/<worker>/<issue-number>-<short-name>`.
- Do not push a remote branch until a coherent candidate is worth sharing.
- Squash merge accepted work.
- Delete branches after merge or explicit rejection.
- Never create campaign, status, sync, completion, or idle branches.
- Target `main` plus no more than three active task branches.
- More than six remote branches is a cleanup warning.
- More than eight remote branches is a hard dispatch stop until every excess ref is deleted or documented as an exception.

The current dispatcher uses a global lock at `/tmp/openlunum-pi-dispatch-once.lock`. Only one dispatcher process may run at a time. The orchestrator may dispatch different local workers sequentially and retain up to three active candidate PRs, but it must not bypass the lock or invent unsupported parallel dispatch.

## Roles

### Vision owner

Chooses milestone priorities, semantic/product tradeoffs, protected-data policy, release/support claims, and exceptional budget increases.

### Local orchestrator

Reconciles state, selects ready issues, prevents overlap, writes explicit assignments, spawns one-shot workers, chooses change tiers, requests evaluation, protects budgets, and decides whether a candidate may proceed to acceptance checks.

### Worker

Implements or experiments on one assigned issue, publishes failures and limitations, opens one draft pull request for a coherent candidate, and exits.

### Independent evaluator or reproducer

Evaluates a fixed candidate SHA on appropriate holdout, protected, adversarial, or product data and reports reproducible results without modifying the candidate.

### Maintainer and merge steward

Controls `main`, protected data, releases, schema/fingerprint promotion, credentials, final support claims, merge authority, and branch deletion.

## Persistent versus one-shot processes

Persistent local processes may monitor health or assignment presence, but must not invoke models while idle, select issues, create branches, convert drafts to ready, or merge.

One-shot processes include implementation workers, experiment workers, evaluators, reproducers, cleanup batches, and release/evidence tasks. Each exits after one bounded assignment.

Do not restart paused workers or shared GPU services merely to use available compute. Check active traffic and issue authorization first. Avoid loading two 35B-class models simultaneously on the current hardware.

## Orchestrator check-in

Perform these steps in order.

### 1. Synchronize read-only state

```bash
cd /home/corpunum/openlunum-workers/review
git fetch --prune origin
git checkout main
git reset --hard origin/main
```

Inspect:

```bash
repo="corpunum/OpenLunum"
gh pr list --repo "$repo" --state open --limit 100
gh issue list --repo "$repo" --state open --limit 100
git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sort
```

Read, but do not automatically clear, `NEEDS_CLOUD`, `STUCK`, `ESCALATED`, `THERMAL_HALT`, and `PAUSED` flags when the local filesystem is available.

Inspect services without guessing their names:

```bash
systemctl --user list-units --all | grep -Ei 'openlunum|pi-(loop|worker|orchestrator)' || true
systemctl --user list-timers --all | grep -Ei 'openlunum|pi-(loop|worker|orchestrator)' || true
```

Disable only a confirmed legacy campaign loop. Preserve non-generative watchdogs and health reporting.

### 2. Reconcile branches and active work

For each open pull request verify:

- linked issue and assignment;
- one branch for one issue;
- branch naming convention;
- candidate head SHA;
- draft/ready state;
- blocking feedback;
- exact-head workflow status;
- whether independent evaluation is required.

Classify every remote branch as:

- `main`;
- active issue-linked PR head;
- merged or fully contained;
- rejected/abandoned and safe to delete;
- explicitly preserved unique proposal;
- unknown and requiring inspection.

If the repository exceeds the branch or PR budget, do not dispatch another worker. Issue #255 is the current historical cleanup ledger.

### 3. Select work

A worker may be dispatched only when an issue is ready and includes:

- defined problem or falsifiable hypothesis;
- goal and non-goals;
- affected lane and likely paths;
- acceptance criteria;
- required local and hosted checks;
- evidence and reproducibility requirements;
- change tier;
- attempt/model-call/time/hardware budgets where applicable;
- dependencies, blockers, and stop conditions;
- evaluator requirement for Tier 3 work.

Do not ask the worker to invent an unresolved semantic decision, benchmark, policy, or success metric.

### 4. Classify the change

#### Tier 1 — mechanical

Non-semantic documentation, spelling, test organization, and low-risk tooling cleanup.

#### Tier 2 — normal implementation

CLI, API, MCP, adapter, reporting, and internal implementation work.

#### Tier 3 — semantic or evidence-sensitive

Schema, canonicalization, fingerprints, parser scoring, protected data, safety policy, renderer meaning preservation, and support/maturity claims.

Tier 3 requires independent evaluation bound to the current candidate SHA and an orchestrator evidence decision before acceptance checks.

### 5. Write one explicit assignment

In the selected worktree:

```bash
cp scripts/WORKER_ASSIGNMENT.example.md reports/orchestrator/WORKER_ASSIGNMENT.md
$EDITOR reports/orchestrator/WORKER_ASSIGNMENT.md
```

The assignment must identify issue, worker, lane, branch, tier, goal, non-goals, acceptance, checks, evidence, budgets, dependencies, evaluator, and stop conditions.

### 6. Dispatch once

```bash
pnpm worker:dispatch -- /home/corpunum/openlunum-workers/<lane>
```

The dispatcher validates the assignment, resets the worktree to `origin/main`, refuses reused branches, archives the assignment and log locally, invokes the worker once, and exits.

A worker ends with:

- `candidate` — a coherent draft pull request exists;
- `blocked` — a specific dependency or decision is missing;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

Do not immediately redispatch after `blocked` or `no-improvement`. Resolve the issue definition, evidence, dependency, or strategy first.

### 7. Review and evaluate locally

While the pull request is draft:

- review the complete diff;
- verify reproduction commands and local results;
- run targeted checks and `pnpm verify` where applicable;
- inspect failed cases, retries, exclusions, and generated artifacts;
- reject unsupported production, support, maturity, language, model, tokenizer, or safety claims;
- ensure reviews and evaluations name the exact candidate SHA;
- use a different evaluator model/configuration where practical.

A worker's own tests are necessary but not sufficient for Tier 3 acceptance.

### 8. Use hosted CI only at the acceptance boundary

Workers iterate locally and PRs remain draft during routine work.

- Do not create diagnostic commits merely to trigger Actions.
- Do not mark ready while routine edits or pushes are expected.
- Mark ready once the candidate, local checks, review, and required evaluation are coherent.
- If a ready candidate needs modification, convert it back to draft before pushing.
- Re-run only failed or invalidated jobs where possible.
- Do not add nightly full-repository workflows by default.
- Keep named-model, multilingual, protected-data, strict, and release evaluations manual or milestone-triggered unless a reviewed schedule has explicit value and budget.
- Never remove, rename, skip, or weaken a required check to save quota.
- Never accept stale checks from another SHA or jobs with no real steps.

### 9. Merge or reject

Before merge confirm:

- PR targets `main`;
- PR is not draft;
- head SHA is unchanged since final review/evaluation;
- all required checks passed on that exact head with real steps;
- no blocking labels or unresolved current-head findings remain;
- issue acceptance criteria are satisfied;
- protected implementation and protected data are not co-edited;
- expected-head guard is used.

Use squash merge. After merge:

- close or update the linked issue;
- record accepted evidence references where required;
- delete the remote task branch;
- prune local branches/worktrees;
- update `STATUS.md` only when accepted capability state changed;
- verify remote branch count remains within budget.

Reject and delete obsolete branches that contain no unique work worth preserving. Preserve distinct work as a bounded issue or archive record before deleting its historical ref.

## Branch cleanup procedure

Safe automatic cleanup includes merged PR branches and branches fully contained in `main`.

```bash
repo="corpunum/OpenLunum"
git fetch --prune origin

git for-each-ref --format='%(refname:short)' refs/remotes/origin/ |
while IFS= read -r ref; do
  [[ "$ref" == "origin/main" || "$ref" == "origin/HEAD" ]] && continue
  branch="${ref#origin/}"
  if git merge-base --is-ancestor "$ref" origin/main; then
    gh api --method DELETE "repos/$repo/git/refs/heads/$branch" || true
  fi
done

git fetch --prune origin
```

For closed-unmerged branches, inspect unique commits and the associated closed PR. Delete only after the work is superseded, noise, explicitly rejected, or preserved elsewhere. Record bulk cleanup and exceptions in issue #255.

## Current ordered priorities

1. **#255 branch cleanup:** remove reviewed superseded refs and post the remaining branch count and exception list.
2. **#253 honest multilingual evidence:** confirm two named local endpoints, then run EN/EL/ES/ID parse and retention baselines. Do not calibrate thresholds first.
3. **#188 merge-control proof:** keep open until live branch protection/rulesets prove exact current contexts, stale-SHA rejection, failed/missing/no-step blocking, and controlled override behavior.
4. **#256 and #257 proposal decisions:** accept or reject the preserved semantic-group retrieval and public quality-gate CLI ideas; rebuild accepted work from current `main`.

## Escalate to the vision owner when

- semantic interpretation cannot be decided mechanically;
- protected data or release policy must change;
- a milestone tradeoff is required;
- evidence is contradictory or cannot be reproduced;
- budget must exceed the issue limits;
- support or maturity declaration is proposed;
- branch protection or merge-control guarantees cannot be verified;
- parallel worker execution requires changing the current global dispatcher lock.
