# Experiment Claim: Schema-to-TypeScript Drift Checking

| Field | Value |
|---|---|
| **Worker** | orchestrator |
| **Role** | Worker agent |
| **Area** | A — Repository reliability |
| **Work-queue item** | P0: Add schema-to-TypeScript drift checking |
| **Branch** | `agent/orchestrator/repository-reliability/schema-drift` |
| **Experiment ID** | schema-drift-check |
| **Date** | 2026-07-15 |
| **Dataset** | N/A (deterministic task) |
| **Dependencies** | None |
| **Completion condition** | Schema changes in `schemas/` automatically generate or verify TypeScript types in `packages/core/src/types.ts` via a script, with positive/negative fixtures, CI integration, and migration documentation |
