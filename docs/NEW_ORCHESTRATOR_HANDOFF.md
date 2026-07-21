# New Orchestrator Handoff

This document is the bootstrap handoff for a replacement OpenLunum orchestrator.

## Repository and source of truth

The canonical GitHub repository is:

```text
corpunum/OpenLunum
```

GitHub issues are the canonical backlog and decision record. Pull requests are candidate changes, not the source of task selection. Local reports and old branches may be stale, rejected, generated noise, or historical evidence.

Never continue from this document's snapshot without first reconciling the live repository and the local machine.

## First action: synchronize local state

Use the existing local checkout when available:

```bash
cd /home/corpunum/OpenLunum
git fetch --prune origin
git checkout main
git reset --hard origin/main
```

If that path does not exist, clone the GitHub repository and then perform the same fetch/reset sequence.

Record the exact current `origin/main` SHA before making decisions:

```bash
git rev-parse origin/main
```

At the time this handoff was written, the last verified `main` was:

```text
585939b2c458f5235135263797002ec37d0bc35e
```

Treat that SHA only as a historical checkpoint. The live SHA is authoritative.

## Read these files before continuing work

Read them in this order:

1. `START_HERE.md`
2. `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`
3. `ORCHESTRATOR.md`
4. `docs/REPOSITORY_OPERATING_MODEL.md`
5. `AGENTS.md`
6. `scripts/WORKER_ASSIGNMENT.example.md`
7. `scripts/pi-dispatch-once.sh`

Also inspect the current implementation of every active service script before trusting its name or comments.

## Reconcile live GitHub and local services

Before selecting work, inspect:

```bash
repo="corpunum/OpenLunum"

gh pr list --repo "$repo" --state open --limit 100
gh issue list --repo "$repo" --state open --limit 100
git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sort

systemctl --user list-units --all | grep -Ei 'openlunum|pi-(loop|worker|review|merge|docs|orchestrator)|nightly' || true
systemctl --user list-timers --all | grep -Ei 'openlunum|pi-(loop|worker|review|merge|docs|orchestrator)|nightly' || true
```

For each open PR, verify its linked issue, branch, exact head SHA, draft state, current-head review findings, workflow runs and whether independent evaluation is required.

For each remote branch, classify it as:

- `main`;
- active issue-linked work with an active PR;
- merged or fully contained and deletable;
- rejected/noise and deletable;
- explicitly preserved unique proposal with a bounded issue;
- unknown and requiring inspection.

## Immediate containment priorities

Do not dispatch product or evaluation work until the local automation state is reconciled.

Check these issues first, in this order:

1. **#276** — disable the autonomous merge bot and every direct-to-`main` auto-revert path.
2. **#274** — disable or redesign the autonomous nightly controller that can run models and create issues, branches and PRs.
3. **#275** — retire persistent reviewer, Ally and docs model loops or convert them into true one-shot assignment consumers.
4. **#271** — retire the legacy primary Pi campaign loop and route work through the one-shot dispatcher.
5. **#255** — complete branch cleanup and post the exact remaining branch count and exception list.
6. **#188** — attach live GitHub branch-protection/ruleset evidence and negative bypass tests.

Until those controls are verified, stop and disable confirmed services or timers invoking:

```text
scripts/nightly-window.sh
scripts/pi-loop.sh
scripts/pi-review-loop.sh
scripts/pi-loop-ally.sh
scripts/pi-docs-loop.sh
scripts/pi-merge-loop.sh
```

Do not let `scripts/pi-orchestrator.sh`, a nightly exit trap, systemd or another supervisor restart them.

Persistent processes may monitor health or assignment presence only. They must not invoke models, select issues, create branches, create issues or PRs, write review labels/comments, mark PRs ready, merge, revert or push to `main`.

## Pending product and evaluation sequence

After operational containment and branch cleanup:

1. **#272** — prove at least two named local OpenAI-compatible endpoints are stable using repeated health and structured-output probes. Separate transport failures from malformed output and evaluator parsing.
2. **#270** — fix parse-prompt and vocabulary gaps using non-leaked examples on a fresh branch. This is Tier 3 and requires an independent evaluator bound to the exact candidate SHA.
3. **#253** — only after #272 and #270 are accepted, run the immutable EN/EL/ES/ID parse and retention baseline matrix. Do not calibrate thresholds from rejected or infrastructure-dominated runs.
4. **#263** — obtain a maintainer decision for the CLI `pipeline` command: implement a real parser/classifier path, rename/deprecate it, or explicitly deny it safety authority.

Always re-read the live issue body and comments. This ordering may change when dependencies are accepted or new blockers are found.

## Required operating rules

- One issue, one worker, one temporary branch and one coherent draft PR.
- Branches use `work/<worker>/<issue-number>-<short-name>`.
- Use `scripts/pi-dispatch-once.sh` or `pnpm worker:dispatch -- <worktree>` for exactly one explicit assignment.
- The assignment must be validated, archived and consumed before the model is invoked.
- No assignment means zero model calls and zero repository or GitHub mutation.
- Never select work from `WORK_QUEUE.md`, campaign prompts, claims files, idle capacity, open-PR scans or all commits since a timestamp.
- Never create campaign, idle, status, sync, completion or unassigned evidence branches.
- Target `main` plus at most three active task branches.
- More than six remote branches is a cleanup warning.
- More than eight remote branches is a hard dispatch stop.
- Keep PRs draft during local iteration.
- Tier 3 work requires independent evaluation bound to the exact current head SHA.
- Use hosted Actions only once at the acceptance boundary after local review and required evaluation are coherent.
- Reject stale-SHA, skipped, cancelled, failed, missing or no-step checks.
- Merge only through an explicit exact-head maintainer/orchestrator action.
- Use squash merge, close/update the linked issue, delete the remote branch and prune.
- Never push directly to `main`, including automated reverts.
- Local model labels or comments are advisory only and never merge authority.

## Bootstrap prompt for the replacement orchestrator

```text
You are taking over orchestration of the GitHub repository corpunum/OpenLunum. First synchronize the local checkout to live origin/main, then read START_HERE.md, docs/LOCAL_ORCHESTRATOR_ONBOARDING.md, ORCHESTRATOR.md, docs/REPOSITORY_OPERATING_MODEL.md, AGENTS.md, scripts/WORKER_ASSIGNMENT.example.md and scripts/pi-dispatch-once.sh. Reconcile all live PRs, issues, branches, Actions runs, systemd services and timers before acting. Continue pending work from GitHub issues, not stale local queues or reports. Prioritize operational containment and branch cleanup in #276, #274, #275, #271, #255 and #188; then handle #272, #270, #253 and #263 in dependency order. Use one-shot explicit assignments, work/<worker>/<issue>-... branches, draft PRs, exact-head review, independent Tier 3 evaluation, one acceptance Actions cycle, squash merge and branch deletion. Do not permit autonomous model loops, issue/PR creation, review labels, merging, direct pushes to main, or dispatch while the remote branch count exceeds eight. Report the live state and your first safe action before changing anything.
```

## Handoff discipline

When handing orchestration to another system again, update this file through an issue-linked PR. Keep it focused on bootstrap procedure and active dependency order; durable implementation details and evidence belong in the relevant GitHub issues and accepted documentation.
