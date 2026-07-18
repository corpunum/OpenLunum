# Retention Regression Gate

## Metadata
- **Worker**: qwen
- **Area**: retention
- **Branch**: agent/qwen/retention-regression-gate
- **Start Date**: 2026-07-18
- **Status**: in-progress

## Work Item
**WORK_QUEUE v4 — P1 multilingual retention (release gate 3):**
- [x] Run parse+realize round-trip retention experiments on all 4 languages
- [ ] **Add a retention regression gate to CI: if any language drops below the baseline threshold recorded in the first run, the build fails.**

## Description

Implement a retention regression gate that:
1. Records baseline thresholds per language after the first run
2. Compares subsequent runs against stored baselines
3. Detects critical (>20pp drop) and warning (10-20pp drop) regressions
4. Fails the build if any critical regression is detected

## Files Created
- `packages/eval/src/baseline-store.ts` — Baseline store module with save/load, regression detection, and CLI helpers
- `packages/eval/test/baseline-store.test.ts` — 15 comprehensive tests

## Test Coverage
- Save/load round-trip persistence
- Load null for missing store
- Record baseline from current metrics
- Default baseline with conservative values
- No regression when metrics match baseline
- Critical regression detection (>20pp drop)
- Warning regression detection (10-20pp drop)
- Missing baseline handling for some languages
- Critical overrides warning
- Mixed critical/warning across languages
- Accurate regression details
- Dataset SHA256 preservation
- Printed summary output
- Zero metrics edge case

## Regression Thresholds
- Critical: >20 percentage point drop
- Warning: >10 percentage point drop
- Passes CI if no critical regressions
