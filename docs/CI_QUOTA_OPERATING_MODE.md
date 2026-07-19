# CI quota operating mode

This document defines how OpenLunum should operate when hosted GitHub Actions capacity is limited, and how to avoid repeating a quota-exhaustion event.

## Principles

1. **Hosted CI is acceptance evidence, not an iterative development shell.**
2. **One coherent repair bundle is cheaper and easier to review than many tiny overlapping PRs.**
3. **Local verification may prepare a branch, but it does not replace exact-head hosted verification.**
4. **A post-merge auto-revert is a last safety net, not a substitute for pre-merge checks.**
5. **Status, telemetry, temperature, claims, and documentation-sync churn must not create implementation PRs.**

## During a hosted-CI outage

- Keep implementation PRs in draft.
- Do not add `ready-for-merge` or `orchestrator-approved` merely because local verification passed.
- Do not merge protected-path, semantic-contract, migration, release, or workflow changes.
- Bundle related fixes on one current-main branch.
- Run the repository's complete local verification suite once after the bundle is coherent, rather than after every small edit.
- Record local commands, exact assertions, and the tested head SHA in the PR body.
- Mark all hosted checks as pending evidence. Never describe a no-step, skipped, missing, or quota-blocked run as green.

## Bundle boundaries

A bundle may combine changes when they share one acceptance objective and can be reviewed as one system. The pre-1.0 acceptance bundle may include:

- quality-gate workflow execution;
- migration CLI correctness;
- renderer golden evidence;
- tokenizer semantic-preservation evidence;
- their tests and directly related documentation.

A bundle must not include:

- worker claims;
- loop logs;
- temperature or velocity telemetry;
- generated temporary reports;
- unrelated documentation synchronization;
- multiple alternative implementations of the same fix.

## Before the final review push

Run locally from a clean worktree:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:strict
node --test scripts/pi-merge-policy.test.mjs
node --test scripts/run-quality-gates-ci.test.mjs
```

Then inspect:

```bash
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

The final review push should be one coherent head whenever practical. Additional pushes should respond to review findings, not produce periodic status noise.

## When hosted capacity returns

1. Delete `reports/orchestrator/CI_OUTAGE` in a reviewed commit.
2. Restore strict branch protection and the exact required check contexts.
3. Run hosted checks on the exact bundle head.
4. Confirm required checks have real workflow steps and successful conclusions.
5. Require independent review for protected paths.
6. Merge with head-SHA binding only after all acceptance evidence exists.
7. Close superseded alternative PRs only after the replacement bundle is accepted.

## Cost controls

- Keep concurrency cancellation enabled for superseded runs.
- Prefer one installation/build job that executes related checks sequentially where branch-protection semantics permit it.
- Use path filters for genuinely unrelated packages.
- Do not open automatic campaign-status or documentation-sync PRs after every merge.
- Do not rerun failed jobs until the failure has been inspected and a code or infrastructure change justifies the rerun.
- Batch documentation updates into the implementation bundle or one release-note pass after acceptance.

## Acceptance rule

A bundle is not complete because its queue items are checked, its local tests were self-reported, or an outage override allowed it to merge. Completion requires successful exact-head hosted checks, task-specific negative tests, and independent review after hosted capacity is restored.
