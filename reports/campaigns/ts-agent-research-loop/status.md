# Campaign Status — Phase Zero COMPLETE

## PRs GREEN

| PR | Title | Branch | CI Status |
|---|---|---|---|
| **#8** | feat(infra): schema-to-TypeScript drift checking | `fix-pr5` | ✅ **GREEN** |
| **#9** | feat(infra): report validation | `fix-pr6` | ✅ **GREEN** |
| **#10** | feat(eval): render and context runners | `render-context` | ✅ **GREEN** |

## PR #8 — Schema Drift (Two-Way Assignability) ✅

**Code-level fix:**
- `TwoWay<T, U>` helper: `T extends U ? U extends T ? true : false : false`
- Checks applied to LunumSem, LunumClause, LunumRecord, LunumRendering, EligibilityDecision
- Tests verify TwoWay usage and detect drift at build time
- Schema const checked in both directions

**CI:** verify ✅, schema-drift ✅, protected-data-boundary ✅

## PR #9 — Report Validation (Fail-Closed) ✅

**Code-level fixes:**
- Removed `|| true` from CI
- Added `fetch-depth: 0` to verify and report-validation jobs
- Integrity check fails closed (no expected hash = fail)
- Smoke test output created by `eval:smoke` step

**CI:** verify ✅, schema-drift ✅, report-validation ✅, protected-data-boundary ✅

## PR #10 — Render/Context Runners (Real Compiler) ✅

**Code-level fixes:**
1. Uses real `compileContext([message])` from `@corpunum/lunum`
2. Eligibility from `ContextMessage.lunumMeta`, not hardcoded
3. Source text from `annotations.sourceText`, NOT `content.substring(0,200)`
4. **Eliminated model self-grading**: `result.exact` removed from status computation
5. Timestamped run directories: `{outputDir}/{timestamp}/`

**Regression tests added:**
- `runner does not trust model self-grading` — fails if result.exact/result.pass used
- `render-runner uses original source text` — fails if content.substring used
- `context-runner uses real compileContext` — fails if hardcoded eligibility

**CI:** verify ✅, schema-drift ✅, report-validation ✅, protected-data-boundary ✅

## Test Coverage

```
core: 19 pass, 0 fail
adapter-openunum: 2 pass, 0 fail
cli: 1 pass, 0 fail
eval: 17 pass, 0 fail
TOTAL: 39 pass, 0 fail
```

## Next Step

Awaiting maintainer merge of PRs #8 → #9 → #10. Phase 7 work-area execution begins after merge.
