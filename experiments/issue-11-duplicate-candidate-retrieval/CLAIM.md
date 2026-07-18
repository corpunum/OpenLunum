# Issue #11 Audit Fix — Duplicate-Candidate Retrieval Test

- **Worker**: agent/qwen
- **Area**: issue-11-audit-fixes
- **Branch**: agent/qwen/issue-11/duplicate-candidate-retrieval
- **Start Date**: 2026-07-18
- **Issue**: #11 (4/8) — Duplicate-candidate retrieval test broken
- **Dataset**: No changes to protected datasets

## Hypothesis

The "duplicate-candidate retrieval test" created a temp fixture the runner never read, made no rejection assertion, then ran against normal fixtures. Fix: make the runner actually read the duplicate fixture and assert that duplicate candidate IDs are detected/rejected.

## Changes

- **`packages/eval/test/retrieval.test.ts`**:
  - Fixed "retrieval runner rejects duplicate IDs in candidates": writes fixture with `candidates: ['a', 'b', 'a']` to standard fixtures dir, asserts `rejects(/duplicate IDs in candidates/)`
  - Fixed "retrieval runner rejects duplicate IDs in expectedRelevant": simplified to write fixture with `expectedRelevant: ['a', 'a']` to standard fixtures dir, asserts `rejects(/duplicate IDs in expectedRelevant/)`

## Evidence

- All 209 unit tests pass (0 failures)
- Smoke suite passes with unchanged dataset hash
- Duplicate detection now properly tested end-to-end
