# Near-semantic scorer threshold sweep (#356, readiness R5.4)

- Run: `2026-09-01T04-45-33-196Z` (2026-09-01T04:45:33.197Z)
- Baseline commit: `ddc5ad86513277adbd486748a16d01289205db52`
- No live model was called. Every comparison is gold LunumSem against gold LunumSem, entirely deterministic.
- **The 0.8 near-semantic threshold was NOT changed.** This is measurement only.

## Datasets

| dataset | items | sha256 |
|---|---|---|
| datasets/adversarial/mutation-false-positive-v1.jsonl | 20 | `62295f30f64acfebc3f9a4e9dae7be3e8c2526aa48a70be20152d5b6bafecc16` |
| datasets/dev/multilingual-core-v1.jsonl | 16 | `6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873` |
| datasets/adversarial/mutation-false-positive-v2.jsonl | 80 | `933e8ed78843cb2526be78e159d2192b2f9b204d3f61ed2c1513f1ee3b3e14d1` |
| datasets/dev/synthetic-mutation-sources-v1.jsonl | 16 | `0a9df9daf3c76d663e0e67c5b57cbfd8bc25fda2325e164956ccaca2ee9e7039` |
| datasets/dev/scorer-eval-heldout-v1.jsonl | 16 | `81346f423d24047906a4023d74d428067feacc82d4a198bc6270ae562114d7a5` |

## Pairs: 116 total (8 positive / 108 negative)

Negative pairs come from the mutation-tagged false-positive corpora (every mutated item vs its source, all deliberately non-matching by construction). Positive AND negative pairs also come from the independent, held-out `scorer-eval-heldout-v1.jsonl` set (#356 R5.3), which is not derived from #346's role-binding fix.

## Precision / recall across thresholds

| threshold | TP | FP | FN | TN | precision | recall | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|
| 0.50 | 8 | 1 | 0 | 107 | 0.889 | 1.000 | 0.941 | 0.991 |
| 0.55 | 8 | 1 | 0 | 107 | 0.889 | 1.000 | 0.941 | 0.991 |
| 0.60 | 8 | 1 | 0 | 107 | 0.889 | 1.000 | 0.941 | 0.991 |
| 0.65 | 8 | 1 | 0 | 107 | 0.889 | 1.000 | 0.941 | 0.991 |
| 0.70 | 8 | 1 | 0 | 107 | 0.889 | 1.000 | 0.941 | 0.991 |
| 0.75 | 8 | 0 | 0 | 108 | 1.000 | 1.000 | 1.000 | 1.000 |
| 0.80 **(frozen)** | 8 | 0 | 0 | 108 | 1.000 | 1.000 | 1.000 | 1.000 |
| 0.85 | 6 | 0 | 2 | 108 | 1.000 | 0.750 | 0.857 | 0.983 |
| 0.90 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |
| 0.95 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |
| 1.00 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |

## Frozen threshold (0.8) detail

At the frozen 0.8 threshold: precision 1.000, recall 1.000, F1 1.000, accuracy 1.000 (0 false positives out of 116 pairs).

No negative pair scores at or above 0.8 -- zero false positives at the frozen threshold on this combined corpus.

## Net

This is data only. `packages/core/src/near-semantic-fingerprints.ts`, `packages/core/src/compare.ts`, and the 0.8 threshold were not modified to produce or in response to these numbers. Whether to recalibrate the threshold given this precision/recall curve remains an owner decision.
