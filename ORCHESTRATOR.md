# OpenLunum orchestrator runbook

This document is the stable operational runbook for a human or strong-model orchestrator. It is not an append-only activity diary. Durable decisions belong in issues, pull requests, architecture decision records, and accepted evidence.

Read `docs/REPOSITORY_OPERATING_MODEL.md` before dispatching work.

## Mission

The orchestrator turns the Lunum vision into bounded, independently reviewable work while protecting semantic correctness, reproducibility, safety, and repository health.

The orchestrator is not responsible for keeping workers constantly busy. Idle is correct when no issue is ready.

## Canonical state

Use these sources in order:

1. GitHub issues — backlog, readiness, assignment, blockers, and acceptance.
2. GitHub milestones — roadmap and release grouping.
3. Pull requests — active candidates and review state.
4. Exact-head checks and evaluation reports — verification evidence.
5. `STATUS.md` — periodically reconciled summary.
6. `WORK_QUEUE.md` — historical roadmap only.

Do not infer current work from old branches, old claims files, dashboard counts, or unchecked markdown entries without comparing them to GitHub issues and current `main`.

## Local paths

| Purpose | Path |
|---|---|
| Primary checkout | `/home/corpunum/OpenLunum` |
| Review/orchestrator worktree | `/home/corpunum/openlunum-workers/review` |
| Suggested core worker | `/home/corpunum/openlunum-workers/core` |
| Suggested eval worker | `/home/corpunum/openlunum-workers/eval` |
| Suggested integration worker | `/home/corpunum/openlunum-workers/integration` |
| Worker dispatcher/legacy loop | `scripts/pi-loop.sh` |
| Worker task prompt | `scripts/pi-task-prompt.md` |
| Merge policy | `scripts/pi-merge-policy.mjs` |
| Merge automation | `scripts/pi-merge-loop.sh` |
| Local health orchestrator | `scripts/pi-orchestrator.sh` |
| Worker flags and logs | `reports/pi-loop/` |
| Orchestrator flags and logs | `reports/orchestrator/` |
| Experiment reports | `reports/experiments/` |

The primary checkout may be reset by local automation. Perform orchestrator edits from the review worktree or a dedicated temporary worktree.

## Default repository limits

- At most three active implementation pull requests repository-wide.
- At most one active implementation pull request per worker.
- One issue per branch and one branch per issue.
- Use `work/<worker>/<issue-number>-<short-name>`.
- Squash merge accepted work.
- Delete branches after merge or explicit rejection.
- Never create campaign, status, sync, completion, or idle branches.

The orchestrator may lower the work-in-progress limit whenever active work overlaps or review/evaluation becomes the bottleneck.

## Roles

### Vision owner

Chooses milestone priorities, acceptable tradeoffs, and compute/review allocation.

### Orchestrator

Selects ready issues, assigns bounded work, prevents overlap, chooses the change tier, requests evaluation, and decides whether a candidate may proceed to acceptance checks.

### Worker

Implements or experiments on one assigned issue, publishes failures and limitations, opens one draft pull request for a coherent candidate, and exits.

### Independent evaluator

Evaluates a fixed candidate SHA on appropriate holdout, protected, or product data and reports reproducible results without modifying the candidate.

### Maintainer and merge steward

Controls `main`, protected data, releases, schema/fingerprint promotion, credentials, final support claims, and branch cleanup.

## Orchestrator check-in

Perform these steps in order.

### 1. Synchronize read-only state

```bash
cd /home/corpunum/openlunum-workers/review
git fetch --prune origin
git reset --hard origin/main
```

Then inspect:

```bash
gh pr list --repo corpunum/OpenLunum --state open
gh issue list --repo corpunum/OpenLunum --state open --limit 100
git branch -r --merged origin/main
```

Read any `reports/orchestrator/NEEDS_CLOUD`, `reports/pi-loop/STUCK`, `ESCALATED`, `THERMAL_HALT`, or `PAUSED` flags if the local filesystem is available.

### 2. Reconcile active work

For each open pull request verify:

- linked issue and assignment;
- branch follows the task naming convention;
- no other branch duplicates the issue or scope;
- candidate head SHA;
- draft/ready state;
- blocking feedback;
- exact-head workflow status;
- whether independent evaluation is required.

If the repository already has three active implementation pull requests, do not dispatch another implementation worker.

### 3. Select work

A worker may be dispatched only when an issue is marked ready and includes:

- a defined problem or falsifiable hypothesis;
- non-goals;
- acceptance criteria;
- required checks and evidence;
- a risk tier;
- iteration/model-call/time budgets where applicable;
- no unresolved semantic decision that the worker is expected to invent.

Assign one issue to one worker. Include the issue number and target outcome in the dispatch instruction.

### 4. Classify the change

#### Tier 1 — mechanical

Non-semantic documentation, spelling, test organization, and low-risk tooling cleanup.

#### Tier 2 — normal implementation

CLI, API, MCP, adapter, reporting, and internal implementation work.

#### Tier 3 — semantic or evidence-sensitive

Schema, canonicalization, fingerprints, parser scoring, protected data, safety policy, renderer preservation, and support/maturity claims.

Tier 3 requires independent evaluation and an orchestrator evidence decision before merge.

### 5. Dispatch once

A worker run must be bounded and one-shot. It exits with:

- `candidate` — a coherent draft pull request exists;
- `blocked` — a specific dependency or decision is missing;
- `no-improvement` — the bounded attempt did not produce an acceptable candidate.

Do not immediately redispatch a worker after `blocked` or `no-improvement`. Resolve the issue definition, evidence, or strategy first.

### 6. Review and evaluate

For every candidate:

- review the complete diff;
- verify local-check commands and results;
- inspect failed cases and exclusions;
- reject unsupported support, maturity, or production claims;
- bind reviews and evaluations to the current head SHA;
- use a different evaluator model/configuration where practical.

A worker's own tests are necessary but not sufficient evidence for Tier 3 acceptance.

### 7. Use hosted CI at the acceptance boundary

Workers iterate locally. Full hosted checks should run when the candidate is coherent and ready for review.

- Do not create diagnostic commits merely to trigger Actions.
- Re-run only invalidated or failed jobs where possible.
- Never remove or weaken a required check to save budget.
- Do not accept stale checks from another commit.

The merge policy requires successful exact-head checks and head-bound approval evidence.

### 8. Merge or reject

Before merge confirm:

- the pull request targets `main`;
- it is not draft;
- the head SHA has not changed since the final review/evaluation;
- all required checks passed on that exact head;
- no blocking labels or unresolved current-head findings remain;
- issue acceptance criteria are satisfied;
- protected implementation and protected data are not co-edited.

Use squash merge and an expected-head guard. After merge:

- close or update the linked issue;
- delete the remote task branch;
- prune local worktrees/branches;
- reconcile `STATUS.md` only when accepted capabilities changed;
- record accepted evidence references for support or maturity claims.

Reject and delete branches that are obsolete and contain no unique work worth preserving.

## Branch cleanup procedure

Safe automatic cleanup includes branches attached to merged pull requests and branches fully contained in `main`.

```bash
repo="corpunum/OpenLunum"

gh pr list \
  --repo "$repo" \
  --state closed \
  --search "is:merged" \
  --limit 500 \
  --json headRefName,isCrossRepository \
  --jq '.[] | select(.isCrossRepository == false) | .headRefName' |
sort -u |
while IFS= read -r branch; do
  [[ -z "$branch" || "$branch" == "main" ]] && continue
  gh api --method DELETE "repos/$repo/git/refs/heads/$branch" 2>/dev/null || true
done
```

For closed-unmerged branches, first inspect unique commits:

```bash
git fetch --prune origin
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | grep -v '^origin/main$'); do
  count=$(git rev-list --count "origin/main..$ref")
  printf '%5s %s\n' "$count" "$ref"
done
```

Do not delete a closed-unmerged branch with unique commits until the maintainer confirms abandonment or preservation elsewhere.

## Local health boundaries

Local watchdogs may restart dead infrastructure and report failures, but they are not authorized to invent work, merge semantic changes, bypass required checks, or convert stale branches into new pull requests.

Never restart shared GPU services such as OpenUnum, ComfyUI, or TTS merely to free resources for a worker. Check for active model traffic before loading another large model. Avoid loading two 35B-class models simultaneously on the current hardware.

## Current strategic priority

Issue #253 is the current bounded evidence milestone: run honest EN/EL/ES/ID parse and retention baselines after the repaired prompt, token-budget, controlled-vocabulary, and near-semantic paths.

Historical runs from the broken parse path are not accepted baselines. Threshold calibration follows accepted baseline evidence; it does not precede it.

Persistent worker activity should remain off until the local orchestrator implements assignment-driven one-shot dispatch. A worker with no explicit issue assignment must exit without invoking an implementation campaign.

## Escalate to the vision owner when

- the semantic interpretation cannot be decided mechanically;
- protected data or release policy must change;
- a milestone tradeoff is required;
- evidence is contradictory or cannot be reproduced;
- budget must be increased beyond the issue limits;
- a support or maturity declaration is proposed;
- branch protection or merge-control guarantees cannot be verified.
