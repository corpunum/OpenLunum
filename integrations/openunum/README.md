# OpenUnum reference integration

OpenUnum is the first detailed adoption example. It is not part of Lunum core.

## Current baseline

The inspected OpenUnum commit is recorded in `integration.json`. At that point OpenUnum already had:

- message, plan, and plan-step fields for code, semantic JSON, fingerprint, and metadata;
- a local `src/memory/lunum.mjs` sidecar implementation;
- shadow compression logs;
- natural text retained as canonical message content;
- plan and assistant-message sidecar generation;
- a configuration namespace for Lunum memory.

Its local module remained a simplified ASCII/English telegraph and rough-token implementation rather than the full Lunum architecture. Live model context was still built from natural content, and the normal user-message path did not consistently create sidecars.

## State on 2026-11-11

The baseline above is the 2026-07-15 inspection and is kept as written. Since then OpenUnum vendors the built core in-tree (no package dependency) and checks it against a pin:

- pinned core: `5f6570bf`, the newest commit with the frozen contract `lunum-agent/0.19`; the 0.21/0.22 candidates on `main` are not vendored until a contract is released ([ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md));
- live: the discourse view under context pressure ([ADR 0021](../../decisions/0021-discourse-records.md), held-out result in [discourse-live-gate-v1](../../experiments/discourse-live-gate-v1/RESULTS.md)) and exact recall ([source-locator-v1](../../experiments/source-locator-v1/RESULTS.md));
- off: semantic identity, model extraction and mixed context mode, which issue no identity on that traffic ([discourse-unit-identity-v1](../../experiments/discourse-unit-identity-v1/RESULTS.md)).

The current working state is in [HANDOVER.md](../../HANDOVER.md).

## Intended dependency graph

```text
OpenUnum chat/memory runtime
          ↓
src/memory/lunum-adapter.mjs
          ↓
@corpunum/lunum plus @corpunum/lunum-openunum (pinned release)
```

OpenUnum keeps ownership of database migrations, context budgets, retrieval, feature flags, safety, UI, and rollout. The adapter maps those decisions to Lunum APIs.

Read:

1. `CURRENT_STATE.md`
2. `GAP_ANALYSIS.md`
3. `ADOPTION_PLAN.md`
4. `AGENTS.md`

Then run the contract test from the OpenLunum workspace.
