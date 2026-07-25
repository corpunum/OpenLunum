# #346 measurement — pure scorer re-scoring of committed outputs

- Scorer commit under test: `228fadd` (#346 merged)
- Method: **re-score the committed raw model outputs from #253 and #344 with the #346 scorer.** #346 changed only the near-semantic scorer, not the model or prompt, so re-scoring identical `parsedSem` outputs isolates the scorer delta with **zero model nondeterminism** — strictly more rigorous than a fresh model run, which would conflate the scorer change with the single-run variance documented in #344.
- No model endpoint was called. All figures recomputed offline from committed raw JSONL.

## 1. Target effect — role-swap false positives eliminated (false-positive review, #344 outputs re-scored)

| model | role-swap FPs (#344 scorer) | role-swap FPs (#346 scorer) | items flipped |
|---|---|---|---|
| `qwen3.6-35b` | 1 | **0** | `role-delete-es`: score 0.816 → 0.643 |
| `qwen3-coder-30b` | 2 | **0** | `role-delete-en`, `role-delete-el`: score 1.000 → 0.771 |

All three role-swap false positives are eliminated. The near-semantic scores dropped below the 0.8 threshold once the swap became visible. **No modality item and no non-role item flipped** — the fix is surgical. Because the underlying model outputs are byte-identical to #344, this delta is 100% attributable to the scorer, not to run variance.

## 2. #253 gate metrics provably unaffected

Re-scoring #253's committed parse outputs with the #346 scorer:

| model | exact (recorded → recomputed) |
|---|---|
| `qwen3.6-35b` | 9/16 → **9/16** |
| `qwen3-coder-30b` | 4/16 → **4/16** |

Exact rate is unchanged, confirming that `exactFingerprint`/`featureRecall`/`featurePrecision` (from the untouched, already-path-aware `compare.ts`) do not move. #253's gate-relevant numbers are stable under #346.

## 3. One disclosed behavioral side effect (harmless on current data)

Re-scoring #253's parse outputs, two items changed near-semantic classification: `battery-el` and `battery-es` went near-only `true → false` (score 0.810 → 0.520). These are **pre-#337** outputs where the model emitted the wrong condition predicate (`is_below` instead of gold `below`). Binding role features to the clause predicate means a wrong predicate now also invalidates that clause's role features, so a wrong-predicate parse scores lower than before.

This is arguably more correct (a clause with the wrong predicate should not earn near-credit for its roles), but it is a real behavioral change beyond the role-swap target and is disclosed here as a property of predicate-binding.

**It does not affect current data.** Re-scoring #344's parse outputs (post-#337, correct predicates) with the #346 scorer:

| model | parse classification flips (#344 outputs) |
|---|---|
| `qwen3.6-35b` | **0/16** |
| `qwen3-coder-30b` | **0/16** |

Zero flips. The side effect only manifests on wrong-predicate parses, which #337 already eliminated.

## Net

- #346 achieves its target: all role-swap false positives eliminated, isolated to the scorer with zero model variance.
- #253's gate metrics (exact, recall) are provably unchanged.
- On current-quality parses the scorer change causes no parse reclassification; the single disclosed side effect (predicate error cascading to a clause's role features) only affects wrong-predicate outputs already fixed by #337.
- **No threshold was changed.** Whether to now flag role swaps as failures via the 0.8 boundary remains an owner calibration decision.
