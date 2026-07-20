# Agent operating model

OpenLunum uses local workers to generate candidates and run experiments, but autonomy is bounded by explicit issues, work-in-progress limits, independent evaluation, and maintainer control of `main`.

The canonical repository workflow is defined in `docs/REPOSITORY_OPERATING_MODEL.md`.

## Roles

### Vision owner

Selects milestone priorities, acceptable tradeoffs, and allocation of compute and review attention. The vision owner decides whether work advances Lunum rather than merely expanding the codebase.

### Orchestrator

A strong model or human that turns ready GitHub issues into bounded assignments. It prevents duplicate work, enforces branch and WIP limits, selects the change tier, requests independent evaluation, and decides whether a candidate may proceed to acceptance checks.

The orchestrator does not keep workers continuously active. When no issue is ready, workers remain idle.

### Worker agent

A local model or coding agent assigned to exactly one issue for one run. It establishes a baseline, performs bounded work, publishes failures and limitations, opens at most one draft pull request for a coherent candidate, and exits with `candidate`, `blocked`, or `no-improvement`.

A worker never chooses its next issue, creates campaign/status work, or merges its own proposal.

### Independent evaluator

Runs a fixed candidate commit on holdout, protected, or product data the worker did not optimize against. It verifies hashes, model/profile identity, environment, and reproduction commands. It separates exact, near-semantic, invalid, timeout, and excluded outcomes and publishes negative cases.

Prefer an evaluator model or configuration different from the worker. The evaluator reports findings; it does not silently repair the candidate while evaluating it.

### Maintainer and merge steward

Controls protected data, credentials, schema/fingerprint releases, integration rollout, support declarations, and `main`. It confirms exact-head checks and head-bound review/evaluation evidence, performs the merge, updates issue state, and deletes the task branch.

## Work-in-progress limits

The default repository-wide implementation limit is three active pull requests:

- one core/schema/fingerprint/rendering lane;
- one evaluation/dataset/evidence lane;
- one CLI/API/MCP/adapter/tooling lane.

Each worker may own at most one active implementation pull request. The orchestrator should lower the limit when proposals overlap or review/evaluation is the bottleneck.

## Lifecycle

```text
ready GitHub issue
  -> orchestrator assignment
  -> synchronized persistent worktree
  -> ephemeral task branch
  -> baseline and bounded work
  -> local checks
  -> draft candidate or blocked/no-improvement result
  -> independent evaluation when required
  -> ready-for-review and hosted exact-head checks
  -> squash merge or reject
  -> branch deletion and issue/evidence update
```

Workers run once per assignment and exit. Persistent services may monitor health or dispatch work, but they must not repeatedly invoke a model when no explicit assignment exists.

## Branch and commit rules

- Persistent local worktree; disposable remote task branch.
- Branch: `work/<worker>/<issue-number>-<short-name>`.
- One issue per branch.
- One active implementation PR per worker.
- Never push directly to `main`.
- Never reuse a branch after merge or rejection.
- Do not force-push after an evaluator has recorded a commit SHA.
- Use small commits with clear intent; accepted pull requests are squash merged.
- Delete remote branches after merge or explicit rejection.

## Change tiers

### Tier 1 — mechanical

Non-semantic documentation, spelling, test organization, and low-risk tooling cleanup.

### Tier 2 — normal implementation

CLI, API, MCP, adapters, reporting, and internal refactors. These require local verification, code review, and hosted exact-head checks.

### Tier 3 — semantic or evidence-sensitive

Schema, canonicalization, fingerprints, parser scoring, protected datasets, safety policy, renderer meaning preservation, and support or maturity claims. These require independent evaluation and an orchestrator evidence decision.

## Bounded autonomy

Every local-model assignment must specify:

- issue and target outcome;
- non-goals and stop conditions;
- maximum attempts;
- maximum model calls;
- timeout or wall-clock budget;
- datasets and hashes;
- model/tokenizer profiles;
- hard gates and target metrics;
- required local and hosted checks.

Workers stop when limits are reached instead of recursively rewriting prompts or widening scope.

## Decision policy

A candidate is acceptable only when it improves the declared target, passes every hard gate, remains within tolerances on non-target metrics, publishes failures, and can be reproduced from a clean checkout.

Average gains cannot override a loss of negation, conditions, entities, quantities, time, modality, provenance, protected literals, or safety constraints.

## Trust boundaries

Local models may emit malformed output, fabricate scores, edit fixtures, overfit visible examples, or confuse implementation completion with evidentiary acceptance. Therefore:

- metrics are computed by repository code where possible;
- manifests, datasets, profiles, and candidate commits are hashed;
- raw outputs and failures are retained;
- protected data is isolated from implementation changes;
- support and maturity claims require external acceptance;
- final merge authority remains outside the worker run.
