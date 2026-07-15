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

## Intended dependency graph

```text
OpenUnum chat/memory runtime
          ↓
src/memory/lunum-adapter.mjs
          ↓
@corpunum/lunum (pinned release)
```

OpenUnum keeps ownership of database migrations, context budgets, retrieval, feature flags, safety, UI, and rollout. The adapter maps those decisions to Lunum APIs.

Read:

1. `CURRENT_STATE.md`
2. `GAP_ANALYSIS.md`
3. `ADOPTION_PLAN.md`
4. `AGENTS.md`

Then run the contract test from the OpenLunum workspace.
