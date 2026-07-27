# Near-semantic threshold calibration v1

**Decision**: The frozen near-semantic threshold remains **0.80**.

**Owner**: corpunum (2026-07-27)

**Status**: Confirmed — no change from the default.

## Rationale

The threshold of 0.80 was the original default in `NearSemanticFingerprintGenerator`.
After implementing hard semantic invariants (#370: role-identity, negation-flip,
condition-change, protected-literal), the threshold sweep shows perfect separation
on the current corpus:

| Metric | Value |
|---|---|
| Precision | 1.000 |
| Recall | 1.000 |
| F1 | 1.000 |
| False positives | 0 / 108 negative pairs |
| True positives | 8 / 8 positive pairs |

The previous sweep (pre-invariants, `2026-07-26T15-56-41-813Z`) showed 8 false
positives at 0.80 — all role-swap mutations that the bag-of-features scorer could
not distinguish. The hard invariants eliminate these entirely, making the scalar
threshold's job strictly easier.

## Why 0.80 and not lower

The sweep data shows perfect precision/recall down to 0.75. However:

1. **Safety margin**: 0.80 provides a 5pp buffer above the precision cliff at 0.65
   (where FP jumps from 0 to 2) and keeps recall at 1.000.
2. **Conservative posture**: lowering the threshold would admit more pairs as
   near-matches, increasing exposure to novel false-positive patterns not yet
   in the corpus.
3. **Hard invariants are the primary defense**: the invariants gate safety-critical
   semantic changes (role swaps, negation flips, condition changes, protected literal
   changes) independently of the threshold. The threshold handles the residual
   bag-of-features scoring for paraphrase detection.

## Why not higher

At 0.85, recall drops to 0.750 (2 of 8 positive pairs lost). These are legitimate
paraphrase pairs from the held-out set that score between 0.80 and 0.85 — raising
the threshold would reject valid near-matches.

## Data

- Post-invariant sweep: `reports/experiments/threshold-sweep/2026-07-27T11-28-53-359Z/`
- Pre-invariant sweep: `reports/experiments/threshold-sweep/2026-07-26T15-56-41-813Z/`
- Corpus: 116 pairs (108 negative from mutation corpora v1+v2, 8 positive + 8 negative from held-out set)
- Baseline commit: `d114f48`
- All comparisons are deterministic gold-vs-gold with no live model calls

## Constraints

- The `safetyInvariantPassRate` floor in parse gates (`packages/eval/src/parse-gates.ts`)
  is fixed at 1.0 and cannot be lowered — this is independent of the near-semantic threshold.
- Future corpus expansion (more languages, more mutation types, more held-out pairs)
  may shift the optimal threshold. This calibration should be re-run after significant
  corpus additions.
