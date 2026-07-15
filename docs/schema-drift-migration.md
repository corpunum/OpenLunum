# Schema-to-TypeScript Drift Migration Guide

## Overview

This document describes the schema-to-TypeScript drift checking system added to OpenLunum.

## What it does

- **Generates** TypeScript type interfaces from JSON Schema definitions in `schemas/`
- **Detects drift** when schemas change but types don't regenerate
- **Validates** conformance with positive/negative fixtures
- **Integrates** into CI via a new `schema-drift` job
- **Proves** generated types conform to the public SDK via compile-time assertions

## Files

| File | Purpose |
|---|---|
| `scripts/schema-to-ts.cjs` | Schema-to-TypeScript generator |
| `packages/core/src/types-schema.ts` | Auto-generated types (commit to repo) |
| `packages/core/src/types-schema-conformance.ts` | Compile-time bidirectional checks |
| `packages/core/test/schema-conformance.test.ts` | Positive/negative conformance fixtures |
| `.github/workflows/ci.yml` | CI drift check job |
| `docs/schema-drift-migration.md` | This document |

## How it works

1. Run `node scripts/schema-to-ts.cjs` to regenerate `types-schema.ts` from `schemas/*.schema.json`
2. The generator handles:
   - Simple types, enums, constants
   - Nested objects with required/optional properties
   - Cross-file `$ref` references between schemas
   - Local `$defs` with recursive references
3. Run `node scripts/schema-to-ts.cjs --dry-run` to check for drift without regenerating
4. CI runs the dry-run on every push/PR

## Compile-time bidirectional checks

`types-schema-conformance.ts` proves the public SDK types are compatible with the generated schema types:

- `LunumSemSchema` fields must exist on public `LunumSem`
- `EligibilityDecision` must match schema requirements
- `LunumRendering` must have required fields
- Recursive types like `LunumClause` must preserve structure
- Schema `const` values must match expected strings

If schemas change but public types don't, the build fails.

## Migration steps for schema changes

When changing a JSON Schema:

1. Edit the schema file in `schemas/`
2. Run `node scripts/schema-to-ts.cjs` to regenerate types
3. Verify: `node scripts/schema-to-ts.cjs --dry-run`
4. Verify: `pnpm build` (conformance assertions must compile)
5. Verify: `pnpm test` (conformance fixtures must pass)
6. Commit both the schema change and regenerated types in one PR

## Adding a new schema

1. Create `schemas/<name>.schema.json`
2. Run `node scripts/schema-to-ts.cjs` to generate the type
3. Add positive/negative fixtures to `packages/core/test/schema-conformance.test.ts`
4. Verify: `pnpm verify`

## Known limitations

- Complex `$defs` with deep nesting may need manual refinement
- The generator produces inline object types rather than named interfaces for nested objects
- `$ref` resolution only handles file-based references and local `#/$defs/...` paths
