# Near-semantic scorer threshold sweep (#356, readiness R5.4)

- Run: `2026-07-26T15-56-41-813Z` (2026-07-26T15:56:41.813Z)
- Baseline commit: `aeb23fa604d98acf1c1db3130055f6fe4f424578`
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
| 0.50 | 8 | 22 | 0 | 86 | 0.267 | 1.000 | 0.421 | 0.810 |
| 0.55 | 8 | 22 | 0 | 86 | 0.267 | 1.000 | 0.421 | 0.810 |
| 0.60 | 8 | 18 | 0 | 90 | 0.308 | 1.000 | 0.471 | 0.845 |
| 0.65 | 8 | 14 | 0 | 94 | 0.364 | 1.000 | 0.533 | 0.879 |
| 0.70 | 8 | 14 | 0 | 94 | 0.364 | 1.000 | 0.533 | 0.879 |
| 0.75 | 8 | 12 | 0 | 96 | 0.400 | 1.000 | 0.571 | 0.897 |
| 0.80 **(frozen)** | 8 | 8 | 0 | 100 | 0.500 | 1.000 | 0.667 | 0.931 |
| 0.85 | 6 | 4 | 2 | 104 | 0.600 | 0.750 | 0.667 | 0.948 |
| 0.90 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |
| 0.95 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |
| 1.00 | 1 | 0 | 7 | 108 | 1.000 | 0.125 | 0.222 | 0.940 |

## Frozen threshold (0.8) detail

At the frozen 0.8 threshold: precision 0.500, recall 1.000, F1 0.667, accuracy 0.931 (8 false positives out of 116 pairs).

Pairs still scoring at or above 0.8 despite being labeled negative (still-live false positives at the frozen threshold):

- `role-remind-en` (mutation-false-positive-v2): similarity 0.829
- `role-approve-en` (mutation-false-positive-v2): similarity 0.852
- `role-remind-el` (mutation-false-positive-v2): similarity 0.829
- `role-approve-el` (mutation-false-positive-v2): similarity 0.852
- `role-remind-es` (mutation-false-positive-v2): similarity 0.829
- `role-approve-es` (mutation-false-positive-v2): similarity 0.852
- `role-remind-id` (mutation-false-positive-v2): similarity 0.829
- `role-approve-id` (mutation-false-positive-v2): similarity 0.852

## Net

This is data only. `packages/core/src/near-semantic-fingerprints.ts`, `packages/core/src/compare.ts`, and the 0.8 threshold were not modified to produce or in response to these numbers. Whether to recalibrate the threshold given this precision/recall curve remains an owner decision.
