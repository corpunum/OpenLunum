# Campaign Status — Phase Zero COMPLETE

## PRs GREEN

| PR | Title | Branch | CI Status |
|---|---|---|---|
| **#8** | feat(infra): schema-to-TypeScript drift checking | `fix-pr5` | ✅ **GREEN** |
| **#9** | feat(infra): report validation | `fix-pr6` | ✅ **GREEN** |
| **#10** | feat(eval): render and context runners | `render-context` | ✅ **GREEN** |

## Rebase Chain
```
fix-pr5 (PR #8) → fix-pr6 (PR #9) → render-context (PR #10)
```

---

## PR #8 — Schema Drift (Two-Way Assignability) ✅

**Code-level fix:**
- `TwoWay<T, U>` helper: `T extends U ? U extends T ? true : false : false`
- Real TwoWay checks applied between public and generated contracts

**Semantic correction applied:**
- _TwoWayRecordFingerprint: now compares Pick<LunumRecord, 'fingerprint'>
  against Pick<LunumRecordSchema, 'fingerprint'> (both actual types)
- _TwoWayRendering/_TwoWayEligibility/_TwoWayClause: descriptions updated
  to clarify these compare against expected schema-derived shapes
- Header comment updated to clarify TwoWay purpose

**CI:** verify ✅, schema-drift ✅, protected-data-boundary ✅

---

## PR #9 — Report Validation (Fail-Closed) ✅

**Code-level fixes:**
- Removed `|| true` from CI
- Added `fetch-depth: 0` to verify and report-validation jobs
- Integrity check fails closed (no expected hash = fail)
- Smoke test output created by `eval:smoke` step
- Updated baseline commit to valid repo commit (23259db)

**CI:** verify ✅, schema-drift ✅, report-validation ✅, protected-data-boundary ✅

---

## PR #10 — Render/Context Runners (Real Compiler) ✅

**Policy evaluation correction:**
- Uses `classifyEligibility({ category, risk, confidence, sourceText, semantic })` 
  to compute policy from sem
- Passes policy via `lunumMeta` to `compileContext([message], { mode: 'mixed' })`
- `compileContext` uses `message.meta.eligible === true` to select mixed output

**Source-text behavior:**
- BLOCKS if natural source text is missing (context requires natural text)
- Uses `sem.annotations?.sourceText` as natural source (NOT serialized JSON)

**Mixed-message output testing:**
- Status computed from `hasMixedOutput && mixedDiffersFromNatural`
- Verifies mixed mode actually produces different output than natural mode

**Other fixes:**
- Status from `hasOutput + resultIsValid`, not model `result.status`
- Reports written to timestamped `outputDir`, not parent `manifest.outputDirectory`

**CI:** verify ✅, schema-drift ✅, report-validation ✅, protected-data-boundary ✅

---

## Test Coverage

```
core: 19 pass, 0 fail
adapter-openunum: 2 pass, 0 fail
cli: 1 pass, 0 fail
eval: 20 pass, 0 fail
TOTAL: 42 pass, 0 fail
```

## Next Step

Awaiting maintainer merge of PRs #8 → #9 → #10. Phase 7 work-area execution begins after merge.
