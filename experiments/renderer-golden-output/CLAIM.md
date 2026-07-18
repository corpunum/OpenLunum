# Renderer Golden Output Tests

## Metadata
- **Worker**: qwen
- **Area**: renderer
- **Branch**: agent/qwen/renderer/golden-output
- **Start Date**: 2026-07-18
- **Status**: in-progress

## Work Item
**WORK_QUEUE v4 — P1 renderer measurement (release gate 4):**
- [ ] Upgrade renderer profiles from "Experiment" to "Reference": add deterministic golden-output tests for safe/short/tight on 10+ diverse inputs.

## Description

Add deterministic golden-output tests that verify safe/short/tight profiles produce consistent, predictable output across diverse semantic inputs.

## Files Created
- `packages/core/test/renderer-golden-output.test.ts` — 12 tests with 15 diverse input records

## Test Coverage
- Deterministic output for all 15 inputs × 3 profiles = 45 profile runs
- Safe preserves annotations/provenance, short/tight reduce
- Safe preserves more than short preserves more than tight
- Determinism: same input → same result
- Predicates always preserved
- Warnings for removed metadata
- Config retrieval and modification
- 15 diverse inputs: simple, negated, nested conditions, modality, annotations, provenance, consequences, multiple clauses, time, long text, empty roles, references, complex mixed

## Verification
- `pnpm build` — green
- `pnpm verify` — all tests pass
