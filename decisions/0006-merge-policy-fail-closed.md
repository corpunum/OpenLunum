# ADR 0006 — Fail-closed merge policy with exact-head binding

**Status:** Implemented (commit 88017f8)

## Context

The auto-merge bot (`scripts/pi-merge-loop.sh`) was merging PRs that carried
`ready-for-merge` or `orchestrator-approved` without verifying that CI checks
had passed on the *current* head. If a reviewer approved head A, and the author
pushed head B before merge, the bot could merge B without B having been checked.

Additionally, some PRs touched hard-protected paths (CI, agent infra, protected
data) but were auto-merged without explicit maintainer consent.

## Decision

Implement a deterministic merge policy evaluator that runs before every merge.
The policy is fail-closed: every required condition must be satisfied on the
exact head being merged, or the merge is blocked.

### Fail-closed policy

All of the following must hold before merge:

1. The PR targets `main`.
2. The PR is not a draft and is mergeable.
3. No blocking label (`needs-work`, `needs-rebase`, `maintainer-blocked`) is
   present.
4. All required CI checks pass on the current head.
5. The required approval label (`ready-for-merge` or `orchestrator-approved`)
   is present and backed by a head-bound review or comment.

### Exact-head binding

After policy evaluation succeeds, the merge bot records the head SHA and passes
`--match-head-commit <sha>` to `gh pr merge`. If the PR has been amended since
policy evaluation, the merge fails and the bot labels the PR `needs-rebase`.

### Path protection

- Hard-protected paths (CI config, agent scripts, protected data) always require
  a `claude-review` label; auto-merge only if `orchestrator-approved` is also
  present.
- Soft-protected paths (core fingerprinting, schemas, registry) require a
  reviewer comment containing `LGTM-protected` for the current head; otherwise
  escalate to `claude-review`.

## Consequences

- The merge loop now adds the `merge-policy-blocked` label when policy fails,
  instead of silently proceeding.
- Reviewers must ensure their approval comment includes the current head SHA
  and a verdict (`READY_FOR_MERGE` or `ORCHESTRATOR APPROVAL`).
- After every merge, the loop runs `pnpm verify` on main; if it fails, the
  merge is auto-reverted and the PR is labelled `needs-work`.
