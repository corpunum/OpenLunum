# Claim: Comprehensive Migration CLI Command

- **Worker:** agent/qwen
- **Area:** migration
- **Branch:** agent/qwen/migration/comprehensive-migrate-cli
- **Start Date:** 2026-07-19
- **Intended Dataset:** migration CLI command

## Background

WORK_QUEUE v4 notes: "Current main only rewrites `sem.schema`; it does not migrate record structure/fingerprint, validate source and destination schemas, fail closed, or write atomically."

The current `lunum migrate` CLI command only changes `sem.schema`. It needs to:
1. Migrate record structure/fingerprint (not just sem.schema)
2. Validate source and destination schemas
3. Fail closed (on errors)
4. Write atomically

## Goal

Upgrade the migration CLI command to use the comprehensive migration functions from `packages/core/src/fingerprint-migration.ts`:
- `migrateForward01to02` - forward migration with modality/time/provenance/annotation migrations
- `migrateBackward02to01` - backward migration with loss warnings
- `validateRecord` / `validateSemSchema` - source/destination validation
- Atomic writes (temp file + rename)

## Deliverables

1. Updated `lunum migrate <file> --from 0.1 --to 0.2` CLI command
2. Uses comprehensive migration functions from core
3. Validates source and destination schemas
4. Fails closed with --fail-closed flag
5. Writes atomically (temp file + rename)
6. Dry-run mode (--dry-run)
