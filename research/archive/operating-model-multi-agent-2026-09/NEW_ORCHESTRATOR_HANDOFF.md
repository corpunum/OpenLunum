# New Orchestrator Handoff

This is the bootstrap handoff for a replacement OpenLunum orchestrator. It describes how to recover the live state safely; it is not permission to trust a stale snapshot or continue from old local state.

## Repository and source of truth

The canonical GitHub repository is:

```text
corpunum/OpenLunum
```

GitHub issues are the canonical backlog, acceptance contract and decision record. Pull requests are candidate changes. A merged PR proves that code entered `main`; it does **not** by itself prove that local services were stopped/reloaded, GitHub rulesets were configured, Tier 3 evaluation was independent, or evidence requirements were completed.

Never select work from `WORK_QUEUE.md`, campaign prompts, claims files, idle capacity, historical reports or unclassified old branches.

## First action: synchronize local state

Use the existing checkout when available:

```bash
cd /home/corpunum/OpenLunum
git fetch --prune origin
git checkout main
git reset --hard origin/main
git rev-parse origin/main
```

If the path does not exist, clone `corpunum/OpenLunum` and perform the same fetch/reset sequence.

At the 2026-07-21 acceptance audit, the historical `main` checkpoint was:

```text
3dd6185b4c046e4b64b9b0412ae0423cb5cccc4a
```

That SHA is only a checkpoint. The current live `origin/main` is authoritative.

## Read these files before acting

Read in this order:

1. `docs/NEW_ORCHESTRATOR_HANDOFF.md`
2. `START_HERE.md`
3. `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`
4. `ORCHESTRATOR.md`
5. `docs/REPOSITORY_OPERATING_MODEL.md`
6. `AGENTS.md`
7. `scripts/WORKER_ASSIGNMENT.example.md`
8. `scripts/pi-dispatch-once.sh`

Then inspect the current implementation of every relevant script and the complete live issue comments. File names, comments and issue state may lag reality.

## Reconcile GitHub and the local machine

Before changing anything, inspect:

```bash
repo="corpunum/OpenLunum"

gh pr list --repo "$repo" --state open --limit 100
gh issue list --repo "$repo" --state open --limit 100
gh run list --repo "$repo" --limit 100
git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sort

systemctl --user list-units --all | grep -Ei 'openlunum|pi-(loop|worker|review|merge|docs|orchestrator)|nightly' || true
systemctl --user list-timers --all | grep -Ei 'openlunum|pi-(loop|worker|review|merge|docs|orchestrator)|nightly' || true
```

For each open PR, verify the linked issue, branch, exact head SHA, draft state, current-head findings, actual workflow job steps and whether independent evaluation is required.

For every remote branch, classify it as:

- `main`;
- active issue-linked work with an active PR;
- merged or fully contained and deletable;
- rejected/noise and deletable;
- explicitly preserved unique work with a bounded issue;
- unknown and requiring inspection.

Do not dispatch while more than eight non-main remote branches exist. The last auditable branch-cleanup record still reported approximately 45 non-main branches, so the live count must be recomputed rather than inferred from issue #255 being closed.

## Important audit result

A replacement orchestrator merged PRs #279–#286 rapidly. The code changes may be useful and must be inspected rather than blindly reverted or reimplemented. However, the acceptance audit reopened the related issues because the required proof was incomplete.

Recent merged checkpoints to inspect include:

```text
dedf525e  #276 operational automation changes
b301db68  #274 nightly-controller changes
5e09f9f2  #275 reviewer/Ally/docs loop changes
ce9b23e6  #271 primary-loop changes
52bda689  #272 endpoint report
10b9b922  #270 prompt/vocabulary changes
7da65b5d  #253 parse baseline artifacts
3dd6185b  #263 CLI pipeline change
```

Do not create a new implementation PR until you determine whether the missing work is code, machine-state transition, GitHub configuration, evaluation or documentation evidence.

## Corrected priority order

### 1. Live enforcement and machine-state proof

Handle these first:

1. **#188 — GitHub merge enforcement**
   - Attach live branch-protection and/or ruleset JSON.
   - Verify required exact check contexts and admin/bypass behavior.
   - Demonstrate that failed, missing, cancelled, skipped, stale-SHA and no-step checks cannot merge.

2. **#276 — merge bot/direct-main containment**
   - Inspect the merged code before changing it.
   - Post service/timer disable and reload status.
   - Prove no active service can merge, auto-close issues, auto-revert or push directly to `main`.
   - Confirm the only accepted merge path is explicit, exact-head and squash-based.

3. **#274 — nightly controller containment**
   - Post the installed timer/service state.
   - Run a bounded no-assignment cycle and prove zero model calls, zero GitHub writes and zero repository mutation.
   - Prove no exit trap or supervisor restarts retired loops.

4. **#275 — reviewer, Ally and docs lanes**
   - Post service disable/reload evidence.
   - Prove idle, malformed, stale, duplicate, replay and lock-contention cases fail closed.
   - A valid assignment must be consumed exactly once and passed into one bounded run.
   - No persistent local reviewer may write labels/comments or grant merge authority.

5. **#271 — primary legacy loop**
   - Confirm the installed service/timer uses accepted `main` code.
   - Prove no assignment causes zero model calls and zero mutations.
   - Prove one valid assignment is archived/consumed once and the process exits.

6. **#255 — branch hygiene**
   - Recompute and post the full remote-branch list and exact count.
   - Keep dispatch stopped above eight non-main branches.
   - Delete only merged, contained, rejected or explicitly superseded refs; preserve unique work behind bounded issues.

### 2. Evaluation and product evidence

Only after the operational state is safe:

1. **#272 — endpoint stability record**
   - The merged report records five HTTP 200 probes per endpoint, but acceptance still needs server/router versions, launch commands, request schema/payload, timeout and token settings, sanitized logs, immutable profile/configuration and separate transport/output/parser failure classification.

2. **#270 — Tier 3 prompt correction**
   - Inspect the merged non-leaked examples.
   - Obtain an independent evaluator verdict, separate from the implementer/orchestrator, bound to the exact accepted code SHA.
   - Provide genuine generalization evidence; hosted CI and orchestrator self-approval are not substitutes.

3. **#253 — honest multilingual baselines**
   - Treat the merged parse reports as provisional evidence only.
   - Complete the required EN/EL/ES/ID **parse and parse-plus-retention** matrix for two named models from the accepted dependency state.
   - Preserve exact, near-only, invalid and error outcomes separately.
   - Include all required reproducibility fields and false-positive review mutations.
   - Do not calibrate thresholds until #272, #270 and the full #253 acceptance are complete.

4. **#263 — CLI pipeline contract**
   - The merged change adds a prominent heuristic warning, but the default path still chooses `simple_fact` before calling `classifyByCategory`; it does not infer a category from the input text.
   - Decide and implement one honest contract: real input classification/parsing, a clearly named surface-only command, or deprecation/explicit denial of safety authority.

Always re-read the live issue body and all comments. Dependency order may change as evidence is accepted.

## Required operating rules

- One issue, one worker, one temporary branch and one coherent draft PR.
- Branches use `work/<worker>/<issue-number>-<short-name>`.
- Use `scripts/pi-dispatch-once.sh` or `pnpm worker:dispatch -- <worktree>` for one explicit assignment.
- Validate, archive and consume the assignment before invoking a model.
- No assignment means zero model calls and zero repository/GitHub mutation.
- Persistent processes may monitor health or assignment presence only.
- Never create campaign, idle, status, sync, completion or unassigned evidence branches.
- Target `main` plus at most three active task branches.
- More than six remote branches is a cleanup warning; more than eight is a hard dispatch stop.
- Keep PRs draft during local iteration.
- Tier 3 work requires independent exact-head evaluation.
- Use hosted Actions once at the acceptance boundary after local review and required evaluation.
- Inspect actual workflow jobs and steps; reject stale, skipped, cancelled, failed, missing and no-step checks.
- Merge through an explicit expected-head action using squash.
- Delete the remote branch and prune after merge or explicit rejection.
- Never push directly to `main`, including automated reverts.
- Local model comments, labels and orchestrator self-approval are advisory, not independent evaluation or merge authority.
- Do not close an issue merely because a PR merged. Check every acceptance item and attach the required proof first.

## Bootstrap prompt

```text
Take over orchestration of the GitHub repository `corpunum/OpenLunum`. Synchronize `/home/corpunum/OpenLunum` to live `origin/main`, then read `docs/NEW_ORCHESTRATOR_HANDOFF.md` and its required files. Reconcile live PRs, open issues, Actions jobs/steps, remote branches, worktrees, systemd services and timers before acting. Several changes from PRs #279–#286 are already merged, but issues #188, #276, #274, #275, #271, #272, #270, #253 and #263 were reopened because acceptance evidence is incomplete; inspect current code and issue comments rather than blindly reimplementing. First prove live GitHub enforcement, service/timer containment, zero-idle-mutation behavior and branch-budget compliance. Then complete #272, obtain independent exact-head Tier 3 evaluation for #270, finish the full parse-plus-retention matrix in #253, and resolve #263's real input-classification contract. Use one explicit issue assignment, `work/<worker>/<issue>-...` branches, draft/local iteration, one hosted acceptance cycle, exact-head squash merge and branch deletion. Never permit autonomous model work selection, GitHub writes, review authority, merging or direct pushes to `main`. Report the reconciled live state, evidence gaps and first safe action before modifying anything.
```

## Handoff discipline

When handing orchestration to another system, update this file through an issue-linked PR. Keep durable evidence in the relevant issue or accepted report, and keep this document focused on safe bootstrap, current dependencies and non-negotiable controls.
