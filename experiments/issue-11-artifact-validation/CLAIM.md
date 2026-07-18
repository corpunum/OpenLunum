# Issue #11 Audit Fix — Artifact Validation

- **Worker**: agent/qwen
- **Area**: issue-11-audit-fixes
- **Branch**: agent/qwen/issue-11/artifact-validation
- **Start Date**: 2026-07-18
- **Issue**: #11 (2/8) — Artifact validation is circular
- **Dataset**: No changes to protected datasets

## Hypothesis

The runner creates `output.json` and `log.txt` itself, then checks they exist — so "missing-artifact" can never occur. By having the adapter declare which artifacts it actually produces, and the runner validating against that, we can correctly detect when an adapter fails to produce expected artifacts.

## Changes

- **`packages/eval/src/integration-runner.ts`**:
  - Added `AdapterResult` interface with `producedArtifacts` field
  - Renamed `artifacts` to `requiredArtifacts` in registry schema
  - Updated `test-registry` adapter to declare `producedArtifacts: ['output.json', 'log.txt']`
  - Added `test-no-output` adapter that produces NO artifacts (for testing)
  - Artifact checking now compares adapter's `producedArtifacts` against `requiredArtifacts`

- **`packages/eval/test/integration.test.ts`**: Added 3 new tests:
  - `artifact validation detects missing artifacts when adapter produces none`
  - `artifact validation passes when adapter produces all required artifacts`
  - `artifact validation detects partial artifacts`

## Evidence

- All 209 unit tests pass (0 failures)
- Smoke suite passes with unchanged dataset hash
- Circular validation fixed: runner no longer self-validates
