# Issue #11 Audit Fix — Malformed Retrieval Fixtures Abort Without Evidence Bundle

- **Worker**: agent/qwen
- **Area**: issue-11-audit-fixes
- **Branch**: agent/qwen/issue-11/malformed-retrieval-bundle
- **Start Date**: 2026-07-18
- **Issue**: #11 (6/8) — Malformed retrieval fixtures abort without evidence bundle
- **Dataset**: No changes to protected datasets

## Hypothesis

The retrieval runner throws errors during fixture validation BEFORE writing evidence files. If a malformed fixture causes a throw, the entire run aborts with no output. Fix: catch errors per-fixture and still produce the complete evidence bundle with error status.

## Changes

- **`packages/eval/src/retrieval-runner.ts`**:
  - Wrapped per-fixture processing in try/catch
  - Errors now produce error results (status: 'error') instead of aborting
  - Evidence bundle always written even when some fixtures fail
  - Error result includes: status: 'error', error message, empty candidate/expected arrays

- **`packages/eval/test/retrieval.test.ts`**:
  - Updated "rejects duplicate IDs in candidates" test: expects error result instead of throw
  - Updated "rejects duplicate IDs in expectedRelevant" test: expects error result instead of throw
  - Added "malformed fixtures produce evidence bundle" test: writes malformed fixture, verifies error result and bundle exist

## Evidence

- All 210 unit tests pass (0 failures)
- Smoke suite passes with unchanged dataset hash
- Malformed fixtures now produce complete evidence bundle
