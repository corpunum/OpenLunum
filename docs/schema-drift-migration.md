# Schema-to-TypeScript Drift Migration Guide

## Overview

This document describes the schema-to-TypeScript drift checking system added to OpenLunum.

## What it does

- **Generates** TypeScript type interfaces from JSON Schema definitions in `schemas/`
- **Detects drift** when schemas change but types don't regenerate
- **Validates** conformance with positive/negative fixtures
- **Integrates** into CI via a new `schema-drift` job

## Files

| File | Purpose |
|---|---|
| `scripts/schema-to-ts.cjs` | Schema-to-TypeScript generator |
| `packages/core/src/types-schema.ts` | Auto-generated types (commit to repo) |
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

## Migration steps for schema changes

When changing a JSON Schema:

1. Edit the schema file in `schemas/`
2. Run `node scripts/schema-to-ts.cjs` to regenerate types
3. Verify with `npx tsc --noEmit --skipLibCheck packages/core/src/types-schema.ts`
4. Run conformance fixtures: `npx tsc && node --test packages/core/test/schema-conformance.test.ts`
5. Commit both the schema change and the regenerated types in one PR
6. If types are out of sync, CI will fail with "DRIFT DETECTED"

## Adding a new schema

1. Create `schemas/<name>.schema.json`
2. Run `node scripts/schema-to-ts.cjs` to generate the type
3. Add positive/negative fixtures to `packages/core/test/schema-conformance.test.ts`
4. Verify: `npx tsc && node --test packages/core/test/schema-conformance.test.ts`

## Known limitations

- Complex `$defs` with deep nesting may need manual refinement
- The generator produces inline object types rather than named interfaces for nested objects
- `$ref` resolution only handles file-based references and local `#/$defs/...` paths
