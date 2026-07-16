# Schema-to-TypeScript Drift Migration Guide

## Overview

This document describes the schema-to-TypeScript drift checking system in OpenLunum.

## What it does

- **Generates** TypeScript type interfaces from JSON Schema definitions in `schemas/`
- **Detects drift** when schemas change but types don't regenerate
- **Validates** conformance with compile-time two-way assertions between actual public and actual generated types
- **Integrates** into CI via a new `schema-drift` job

## Files

| File | Purpose |
|---|---|
| `scripts/schema-to-ts.cjs` | Schema-to-TypeScript generator |
| `packages/core/src/types-schema.ts` | Auto-generated types (commit to repo) |
| `packages/core/src/types-schema-conformance.ts` | Compile-time two-way checks (actual public ↔ actual generated) |
| `packages/core/test/schema-conformance.test.ts` | Runtime + compile-time conformance tests |
| `packages/core/test/fixtures/negative-compile-fixture.ts` | Negative compile fixture (excluded from build) |
| `.github/workflows/ci.yml` | CI drift check job |
| `docs/schema-drift-migration.md` | This document |

## Two mechanisms

### 1. Schema-to-generated dry-run drift detection

Run `node scripts/schema-to-ts.cjs --dry-run` to check whether `types-schema.ts` matches the current schemas in `schemas/`. This compares generated types against JSON Schema definitions only. It does **not** check public SDK types.

### 2. Public ↔ Generated compile-time checks

`types-schema-conformance.ts` proves that selected shared fields on public SDK types (`LunumSem`, `LunumRecord`) are structurally compatible with the corresponding generated schema types (`LunumSemSchema`, `LunumRecordSchema`). The check uses `TwoWay<T, U>` which requires both `T extends U` and `U extends T`.

The negative compile fixture (`test/fixtures/negative-compile-fixture.ts`) deliberately mutates an actual generated contract (`Omit<LunumSemSchema, 'world'>` + `world: number`) and asserts it against the public type. Running `tsc` on this fixture must produce a single intentional TS2322 diagnostic, proving the compile-time mechanism detects incompatibilities.

## Compile-time checks performed

| Check | Public type | Generated type | What it verifies |
|---|---|---|---|
| `LunumSem` world/kind | `Pick<LunumSem, 'world' \| 'kind'>` | `Pick<LunumSemSchema, 'world' \| 'kind'>` | Both sides are structurally compatible strings |
| `LunumSem` schema const | — | `LunumSemSchema['schema']` | Const value is exactly `"lunum-sem/0.1-draft"` |
| `LunumRecord` fingerprint | `Pick<LunumRecord, 'fingerprint'>` | `Pick<LunumRecordSchema, 'fingerprint'>` | Both sides are string |
| `LunumRecord.sem` world/kind | `Pick<LunumRecord['sem'], 'world' \| 'kind'>` | `Pick<LunumRecordSchema['sem'], 'world' \| 'kind'>` | Nested schema fields are compatible strings |
| `LunumRecord.source.text` | `Pick<LunumRecord['source'], 'text'>` | `Pick<LunumRecordSchema['source'], 'text'>` | Source text is string on both sides |

## Migration steps for schema changes

When changing a JSON Schema:

1. Edit the schema file in `schemas/`
2. Run `node scripts/schema-to-ts.cjs` to regenerate types
3. Verify: `node scripts/schema-to-ts.cjs --dry-run` (must report no drift)
4. Verify: `pnpm build` (conformance assertions must compile)
5. Verify: `pnpm verify` (all tests including negative compile fixture must pass)
6. Commit both the schema change and regenerated types in one PR

## Known limitations

- **Not all public types are checked.** Only `LunumSem` and `LunumRecord` shared fields with direct generated counterparts are in the TwoWay assertions. `LunumRendering`, `EligibilityDecision`, and `Clause` were removed from TwoWay checks because they compared against hand-written shapes rather than actual generated types.
- **Not all fields are checked.** Only a small set of core fields (world, kind, fingerprint, source.text) are in the TwoWay assertions. Fields like `clauses`, `references`, `renderings`, and `policy` are not in the TwoWay assertions.
- **No recursive structural check.** The TwoWay assertion on `LunumRecord.sem` checks only `world` and `kind`, not the full `clauses` structure. Recursive types like `LunumClause` are not recursively checked.
- **No rendering or eligibility checks.** `LunumRendering`, `EligibilityDecision`, and `Clause` TwoWay checks were removed because they used hand-written shapes (e.g., `{ eligible: boolean; category: string; risk: Risk; confidence: number; reasons: string[] }`) rather than actual generated schema types.
- **The negative fixture is excluded from normal build.** `test/fixtures/negative-compile-fixture.ts` is excluded from `tsconfig.json` so it is not compiled during `pnpm build`. The `pnpm test` suite runs `tsc` on it explicitly with `spawnSync` and asserts the expected TS2322 error.
- **CI dry-run does not check public types.** The `--dry-run` mode compares generated types against JSON Schema only. It does not verify public SDK type compatibility.
- **No protection against public type widening.** If a public type becomes more permissive (e.g., `world: string | null` instead of `world: string`), the TwoWay check may still pass if the generated type also accepts it. The check is structural, not semantic.
