# Merge policy

**Status:** implemented on main (commit 88017f8)

## Overview

A deterministic merge policy evaluator (`scripts/pi-merge-policy.mjs`) checks every
candidate pull request before the merge bot attempts to merge. The policy is
**fail-closed**: if any required gate is missing, inconclusive, or not satisfied
on the exact head being merged, the merge is blocked and the PR receives the
`merge-policy-blocked` label.

## Required checks

Every PR must pass these CI checks on its current head before merge:

| Check | When required |
|---|---|
| `verify` | Always |
| `schema-drift` | Always |
| `report-validation` | Always |
| `protected-data-boundary` | Always |
| `quality-gates` | When the PR touches `packages/core/src/` or `packages/eval/src/` |

The quality-gates check is added automatically when file paths match
`packages/(core|eval)/src/...`.

## Approval gates

A PR is approved for merge when it carries one of the following labels, and the
label is backed by a matching review comment bound to the current head:

| Label | Requirement |
|---|---|
| `ready-for-merge` | A review or comment contains `REVIEW <sha>:` followed by `READY_FOR_MERGE` |
| `orchestrator-approved` | A review or comment contains `ORCHESTRATOR APPROVAL <sha>:` with a non-empty reason |

If neither label is present the PR is blocked.

## Blocking conditions

The policy blocks merge when any of the following conditions are true:

- The PR head SHA is missing.
- The PR does not target `main`.
- The PR is a draft.
- The PR is not currently mergeable (unresolved conflicts).
- A blocking label is present: `needs-work`, `needs-rebase`, or `maintainer-blocked`.
- The current head has unresolved `NEEDS_WORK` feedback in a review or comment.
- A required label (`ready-for-merge` or `orchestrator-approved`) is missing or
  not backed by a head-bound review.
- Any required check is missing, not successful, has an unexpected producer
  (not `github-actions`), or recorded zero workflow steps.
- `orchestrator-approved` is present but the comment body is empty after the
  head marker.

## Fail-closed exact-head semantics

The merge loop (`scripts/pi-merge-loop.sh`) binds every merge to the exact
commit that passed policy evaluation. It records the head SHA before merge and
passes `--match-head-commit <sha>` to `gh pr merge`. This closes the TOCTOU gap
where a reviewer could have approved an older head and the PR could be amended
before merge.

After every merge the loop runs `pnpm verify` on a detached worktree of main.
If verification fails it auto-reverts the merge and labels the PR `needs-work`
with a comment explaining the regression.

## Path protection

| Path pattern | Protection | Behaviour |
|---|---|---|
| `datasets/protected/` (except README.md), `.github/`, `scripts/pi-*`, `scripts/nightly-*` | Hard-protected | Always requires `claude-review` label; auto-merge only if `orchestrator-approved` is present |
| `packages/core/src/(canonicalize|fingerprint|derive|compare|types|types-schema)`, `schemas/`, `registry/` | Soft-protected | Auto-merge requires a reviewer comment containing `LGTM-protected` for the current head; otherwise escalates to `claude-review` |
| Everything else | Unprotected | Standard policy evaluation only |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Policy satisfied — merge is allowed |
| 1 | Policy blocked — one or more conditions failed |
| 2 | Policy evaluation failed (unexpected error) |

## Implementation

- `scripts/pi-merge-policy.mjs` — policy evaluator library and CLI
- `scripts/pi-merge-policy.test.mjs` — property tests for the evaluator
- `scripts/pi-merge-loop.sh` — auto-merge loop that calls the policy before merge
