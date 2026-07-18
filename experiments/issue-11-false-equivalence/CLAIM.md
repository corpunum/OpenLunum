# Issue #11 Audit Fix — False-Equivalence Fixture Contradictory

- **Worker**: agent/qwen
- **Area**: issue-11-audit-fixes
- **Branch**: agent/qwen/issue-11/false-equivalence
- **Start Date**: 2026-07-18
- **Issue**: #11 (5/8) — False-equivalence fixture contradictory
- **Dataset**: Modified test fixture (not protected dataset)

## Hypothesis

The false-equivalence fixture had `french` as both expected-relevant AND designated false-equivalent. This allows a correct hit on `french` to also count as false-equivalent. Fix: use a record NOT in expected-relevant as the false-equivalence example.

## Changes

- **`packages/eval/test-fixtures/retrieval/fixtures/false-equivalence-query.json`**:
  - Changed `falseEquivalenceIds` from `["french", "france"]` to `["english"]`
  - `french` is only in expectedRelevant (correct hit)
  - `english` is in both topK and falseEquivalenceIds (true false-equivalent)
  - `english` is NOT in expectedRelevant, so no contradiction

- **`packages/eval/test/retrieval.test.ts`**:
  - Added assertions to verify `french` is NOT in falsePositives
  - Added assertions to verify `english` IS in falsePositives

## Evidence

- All 209 unit tests pass (0 failures)
- Smoke suite passes with unchanged dataset hash
- No more contradictory false-equivalence designation
