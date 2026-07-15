# Agent operating model

OpenLunum is designed for many inexpensive local worker agents plus a smaller number of stronger orchestrators. The workflow intentionally separates candidate generation from semantic approval.

## Roles

### Worker agent

A local model or coding agent that selects one area, creates an experiment, runs development data, proposes implementation changes, publishes raw failures, and opens a PR. It never merges its own semantic or safety-sensitive work.

### Evaluator agent

Runs the selected candidate on holdout or product data the worker did not optimize against. It verifies hashes and reproduction commands and publishes an independent report. Prefer a different model/configuration from the worker.

### Orchestrator

A stronger model or human that compares evidence, detects benchmark gaming or semantic regressions, requests changes, and decides whether a proposal should merge. The orchestrator may combine several worker proposals only after each has independent evidence.

### Maintainer

Controls protected data, schema/fingerprint releases, integration rollout, credentials, and `main`.

## Lifecycle

```text
clone -> verify -> claim one area -> baseline -> hypothesis -> bounded iterations
      -> candidate -> protected evaluation -> report -> PR -> orchestration -> merge/reject
```

## Branch and commit rules

- Branch: `agent/<worker>/<area>/<experiment-id>`
- Keep implementation, experiment manifest, and evidence together.
- Keep protected dataset maintenance in separate branches.
- Use small commits that identify intent, for example `feat(parse): preserve nested negation`.
- Do not force-push after an evaluator has recorded a commit hash; add a new commit instead.

## Bounded autonomy

Every local-model run must have explicit limits for items, attempts per item, total calls, timeout, and optional wall-clock budget. Workers must stop instead of recursively rewriting prompts forever.

## Decision policy

A candidate is mergeable only if it improves the declared target, passes all hard gates, stays within tolerances on non-target metrics, publishes failed cases, and can be reproduced from a clean checkout. Average gains cannot override a loss of negation, conditions, entities, quantities, provenance, or safety constraints in protected categories.

## Trust boundaries

Local models may output malformed JSON, fabricate scores, edit fixtures, or overfit visible examples. Therefore metrics are computed by repository code where possible; manifests and datasets are hashed; raw outputs are retained; protected data is separated; and final approval is external to the worker loop.
