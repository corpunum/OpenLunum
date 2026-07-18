# Issue #11 Audit Fix — Deep Schema Validator

- **Worker**: agent/qwen
- **Area**: issue-11-audit-fixes
- **Branch**: agent/qwen/issue-11/schema-validator-deep
- **Start Date**: 2026-07-18
- **Issue**: #11 (1/8) — Integration schema validator is shallow
- **Dataset**: No changes to protected datasets

## Hypothesis

The integration schema validator in `packages/eval/src/integration-runner.ts` only checks whether required keys exist — it does NOT validate types, enums, nested structures, or reject unexpected fields. Implementing real deep validation against the registry's declared nested `data` structure will correctly reject adapter output with wrong types, invalid enums, extra fields, and nested data shape mismatches.

## Changes

- **`packages/eval/src/integration-runner.ts`**: Replaced shallow `validateAgainstSchema` with deep validator that supports:
  - Type checking (string, number, boolean, object, array)
  - Enum value validation
  - Required field checking
  - Nested object structure validation
  - `additionalProperties: false` support for rejecting extra fields
  - Array item validation
- **`packages/eval/test/integration.test.ts`**: Added 3 new integration-level tests for deep validation
- **`packages/eval/test/integration-schema-validator.test.ts`**: New dedicated test file with 10 unit tests covering:
  - Required fields
  - Wrong types rejection
  - Invalid enums rejection
  - Extra fields rejection (additionalProperties: false)
  - Extra fields allowed (additionalProperties not false)
  - Nested object structures
  - Nested data shape mismatch
  - Empty schema
  - Array items validation
  - Registry schema with valid adapter output

## Evidence

- All 219 unit tests pass
- All 10 deep validation unit tests pass
- Smoke suite passes with unchanged dataset hash
