# Greek diacritic folding for exact recall v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `5c9b62d` before any measurement.
- **Run date:** 2026-10-08, on the owner's rig, OpenUnum branch `feat/lunum-l1-recall`
  (harness `scripts/eval-greek-fold-recall.mjs`, on top of `scripts/eval-lunum-locator.mjs`
  `export`/`build`/`qa`).
- Private data: aggregates only. Exports, QA set and indexes stay in a private cache dir (mode 700).
- Self-reviewed by the authoring agent (Claude); no manual labels.

## Data

- Fresh read-only export: 21,115 user/assistant messages (41.2 MB), 21 secret-shaped tokens redacted.
- 1,433 distinct Greek words of 7+ letters; 522 candidate lexemes after the rarity filter (1–3
  relevant messages); **57 excluded as overlapping the old source-locator-v1 Greek set** (same
  word or same folded stem). 60 lexemes drawn with seed `20261009` → 180 queries (A, U, I).
- Control: 170 hash/id/path items rebuilt by the source-locator-v1 harness over the new export.

## Results (recall@5)

| Backend | A as written | U unaccented | I inflected unaccented | **U ∪ I** | control (170) | composite (control + I) |
| --- | --- | --- | --- | --- | --- | --- |
| fts5-prod (live word query) | 1.000 | 0.033 | 0.000 | 0.017 | 0.512 | 0.378 |
| shipped (live + prefix fallback) | 1.000 | 0.283 | 0.283 | 0.283 | 0.847 | 0.700 |
| **candidate (shipped + greekFold)** | **1.000** | **1.000** | **0.983** | **0.992** | **0.847** | **0.883** |
| reference: folded index (not shipped) | 1.000 | 1.000 | 0.983 | 0.992 | 0.853 | 0.887 |

Fallback latency, candidate: Greek p50 0.03 ms / p95 0.07 ms; control p95 1.8 ms (shipped: 2.0 ms).
The folded reference index would cost 58.8 MB on disk; the candidate needs no index.

The composite (0.883) is the analogue of the post-hoc 0.87 in source-locator-v1, now on a fresh
held-out set.

## Against the bar

| Condition | Result | Pass |
| --- | --- | --- |
| U ∪ I recall@5 ≥ 0.85 | 0.992 | yes |
| U ∪ I ≥ shipped + 0.20 | 0.992 vs 0.283 | yes |
| A not lower than shipped | 1.000 = 1.000 | yes |
| control results identical | identical top-5 lists on all 170 items | yes |
| fallback p95 ≤ 10 ms | 1.8 ms | yes |

**Decision: pass.** `exactRecall.greekFold` defaults to on (it only acts when `exactRecall`
is enabled). OpenUnum env override: `OPENUNUM_LUNUM_EXACT_RECALL_GREEK_FOLD=1|0`.

## Not measured

Precision of the extra prefix hits (words differing only by accent, e.g. πότε/ποτέ). They only
fill slots left after whole-word hits.
