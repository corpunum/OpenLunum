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
- Real TwoWay checks applied between public and generated contracts:
  - LunumSem core fields (world, kind)
  - LunumRecord fingerprint, sem, source
  - LunumRendering (code, profile, tokens)
  - EligibilityDecision (all required fields)
  - Clause (predicate, roles)
- Added compile-failure regression fixtures in `test/fixtures/schema-drift-failures.ts`
- Tests verify TwoWay usage and detect drift at build time

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

**Three maintainer blockers resolved:**

### Blocker 1: Removed hardcoded eligibility
- `context-runner.ts`: eligibility now computed from `validateSem(sem)`
- `lunumMeta` no longer hardcoded to `{ eligible: true, ... }`
- Eligibility derived from schema validation result

### Blocker 2: Task success computed independently of model status
- `runner.ts`: status computed from `hasOutput + resultIsValid`
- NOT from `result.status` (model self-assessment)
- Non-parse/realize tasks validated by content, not model claims

### Blocker 3: Reports written inside timestamped run directory
- `runDeterministicTask` now accepts `outputDir` parameter
- `writeRenderReport`/`writeContextReport` write to `outputDir` (timestamped)
- NOT to `manifest.outputDirectory` (parent)

**Other fixes:**
1. Uses real `compileContext([message])` from `@corpunum/lunum`
2. Source text from `annotations.sourceText`, NOT `content.substring(0,200)`
3. Timestamped run directories: `{outputDir}/{timestamp}/`

**Regression tests added:**
- `runner does not trust model self-grading` — fails if result.exact/result.pass in status
- `render-runner uses original source text` — fails if content.substring used
- `context-runner uses real compileContext` — fails if hardcoded eligibility
- `context-runner does not hardcode eligibility` — fails if validateSem not used
- `runner computes task success independently` — fails if hasOutput not checked
- `reports are written inside timestamped run directory` — fails if outputDir not passed

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
