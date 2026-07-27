# Verdict: PR/Issue #366 — Phase 1 readiness tracker reconciliation

**Verdict: PASS**

**Bound to candidate SHA:** `4ec9f2c` (full: `4ec9f2ce3c88a357e4482c6a5e44569399e59d5a`)
Branch: `work/readiness/366-phase1-reconcile`
`git log --oneline -1 4ec9f2c` → `4ec9f2c docs: reconcile Phase 1 readiness evidence (#366)`

Evaluated by an independent read-only reviewer. No files were modified except this verdict file. No model was run. Issues #342 and #360 were not resolved.

---

## 1. PR verification — PASS

All six PRs confirmed MERGED via `gh pr view <n> --json number,state,mergeCommit,mergedAt`, and every merge SHA matches `reports/evidence-registry.json` entries 25–30 exactly (verified programmatically, all `True`):

| PR | State | Merge SHA (gh) | Registry SHA | Match |
|---|---|---|---|---|
| #359 | MERGED | 26a0943040b2f4beb9d643a8fb98329e10727a7e | same | yes |
| #361 | MERGED | 867f31620ed28111697c26a3c028853615bffe2f | same | yes |
| #362 | MERGED | d97f01b34768e5b90dd52fb0d2664882bf23bb1a | same | yes |
| #363 | MERGED | 6594f4b76202f75681006f66fb88e2e6ba362492 | same | yes |
| #364 | MERGED | f665e10df264d52bc5a768b10360ebf1778c62b9 | same | yes |
| #365 | MERGED | 5e05a56879a7feea646db422d8844420a4d2ddb4 | same | yes |

## 2. Score changes — PASS

Read `docs/LUNUM_READINESS.md` in full.

- Overall readiness table unchanged: 88% / 68% / 42% (lines 42–44) — confirmed.
- Capability summary table vs. section headings, all matched:
  - R3 Round-trip semantic retention: table **80%** (line 67), heading "R3 — ... : 80% → 100%" (line 110). Match.
  - R4 Exact semantic identity: table **86%** (line 68), heading "R4 — ... : 86% → 100%" (line 122). Match.
  - R5 Near-semantic comparison: table **70%** (line 69), heading "R5 — ... : 70% → 100%" (line 135). Match.
  - R6 Safety-critical preservation: table **64%** (line 70), heading "R6 — ... : 64% → 100%" (line 148). Match.
  - R13 Evaluation and reproducibility: table **95%** (line 77), heading "R13 — ... : 95% → 100%" (line 232). Match.
  - R14 Operational reliability: table **48%** (line 78), heading "R14 — ... : 48% → 100%" (line 244). Match.
- Change-log rows (lines 371–376) each cite a scoring-dimension rationale (e.g. "Deterministic verification +2%", "empirical evidence −5%", "Implemented contract +2%, deterministic verification +3%"), with net deltas that arithmetically match the before/after percentages shown. All six rows present, none generic.

## 3. Threshold sweep — PASS

Read `reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/sweep.jsonl` directly (not the report prose) and parsed the 0.8 and 0.85 rows programmatically:

- 0.8: `{truePositive: 8, falsePositive: 8, falseNegative: 0, trueNegative: 100, precision: 0.5, recall: 1.0, f1: 0.6667}` — matches checklist and tracker text (R5.4, line 143) exactly.
- 0.85: `{truePositive: 6, falsePositive: 4, falseNegative: 2, trueNegative: 104, precision: 0.6, recall: 0.75, f1: 0.6667}` — matches tracker's cited "At 0.85: TP 6, FP 4, FN 2, TN 104, precision 0.600, recall 0.750, F1 0.667" (line 143) exactly.

## 4. #360 canonicalization — PASS

Read `packages/core/test/identity-collision-corpus.test.ts` in full (22 curated pairs, all real, executable `node:test` assertions — not prose). The specific "time:null vs omission" and "explicit undefined role vs omission" findings actually live in the sibling file added by the same PR #359, `packages/core/test/identity-property-fuzz.test.ts` (both files are cited together in registry entry 25 and ledger row 25), containing:
- `test('FINDING: omitted clause.time vs explicit clause.time=null do NOT canonicalize identically', ...)`
- `test('FINDING: omitted role key vs role value explicitly set to undefined do NOT canonicalize identically', ...)`

Ran the compiled tests directly: `node --test dist/test/identity-collision-corpus.test.js dist/test/identity-property-fuzz.test.js` in `packages/core` → **35/35 pass**, including both FINDING tests, confirming the divergence is real and reproducible, not a hypothetical claim.

`gh issue view 360 --json state` → `OPEN`, confirmed.

## 5. Tracker/registry consistency — PASS

- Ledger rows in `docs/LUNUM_READINESS.md` between "## Evidence and evaluation ledger" and "## Evidence interpretation rules": counted 30 data rows (lines 287–316, header at 285/286 excluded).
- `reports/evidence-registry.json` `entries` array length: 30 (`registryVersion: 1`, `generated: "2026-07-27"`).
- Compared all 30 `ledgerText` values against the tracker's "Evidence" column in row order: exact 1:1 match for every row, including PR groupings (`PRs #312, #318, #319, #320`), bare PR references (`PR #336`, `PR #350`, `PR #335`), the doc reference (`` `docs/MIXED_CONTEXT_QUALITY.md` ``), and the issue-only row (`Issue #342`).

## 6. Conservative wording — PASS

- `> **General production-ready:** **No**` — present verbatim at line 11.
- Searched the whole document for "production-ready", "production-grade", "ready for production" (case-insensitive): three hits, none an affirmative claim —
  - line 11: "General production-ready: **No**" (negative)
  - line 210: "...production-grade diagnostics..." — this is inside an R11 **100% definition** (an aspirational target the CLI has not yet met), not a claim of current state
  - line 391: "Lunum is **production-promising but not generally production-ready**" (explicit negative)
- Final "Honest current conclusion" section (lines 389–406) lists what Lunum is *not yet* credible as, consistent with conservative framing.

## 7. Open issues — PASS

- `gh issue view 342 --json state` → `OPEN`
- `gh issue view 360 --json state` → `OPEN`

## 8. Evidence paths — PASS

Programmatically checked every `evidencePaths` entry for registry rows 25–30 with `os.path.exists()` against the repo root — **0 missing**. All paths for PRs #359, #361, #362, #363, #364, #365 evidence (test files, dataset files, manifests, experiment run directories/reports) exist on disk at this SHA.

---

## Summary

All 8 checklist items pass. PR/merge-SHA/registry/tracker/issue-state cross-references are internally consistent, the #360 canonicalization findings are real and independently reproducible via the actual test suite, evidence paths for the newly reconciled entries all resolve to real files, threshold-sweep numbers in the tracker are verbatim reproductions of the underlying JSONL data, and the document's production-readiness wording remains conservative with no affirmative production-ready claims.

## Concerns (non-blocking)

- Working tree at time of review had two unrelated uncommitted modifications (`reports/orchestrator/velocity.csv`, `reports/pi-loop/temps.csv`) present before this review began; they are outside the scope of #366 and were not touched or evaluated.
- `packages/core/dist/` compiled test artifacts were used to execute the identity tests rather than rebuilding from source; a `tsc` diff was not performed, though the source `.ts` test files were read in full and match the compiled behavior observed (35/35 pass, including the two named FINDING tests).
- This verdict does not re-validate ledger rows 1–24 in as much depth as 25–30, since the task scope was specifically the Phase 1 reconciliation (rows 25–30); the row-count and ledgerText-match check in item 5 above does, however, cover all 30 rows.
