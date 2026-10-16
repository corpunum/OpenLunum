# Parallel documents v1, free anchor measure: results

**Run 2026-10-16 against [PREREGISTRATION-anchors.md](PREREGISTRATION-anchors.md) (commit `323e886`, committed and pushed before the first run). No model call, cost $0. Self-reviewed.**

**Level: below (a).** Literal anchors only (numbers, dates, identifiers, URLs). This says nothing about meaning, structure or identity.

| | |
|---|---|
| Reference | OPUS Europarl v8 EL–EN (official human translation), zip sha256 `b99466a7…ef3e7dd25` |
| Sample | 300 passages of 8 consecutive aligned pairs, seed `parallel-document-v1:2026-10-16`, 4 documents skipped ([selection.json](selection.json), hashes only) |
| Scorer | [anchors.mjs](anchors.mjs), core `unitLiterals`; per-passage output in [anchors-results.json](anchors-results.json) |

## Result against the pre-registered bars

| Measure | Result | Bar | Verdict |
|---|---|---|---|
| Informative passages (both sides have an anchor) | **201 of 300 (67%)** | reported | 90 have no anchor on either side, 9 on one side only |
| Matched mean Jaccard | **0.947** | ≥ 0.50 | Pass |
| Top-1 (true EL passage is the best of 201) | **0.817** | ≥ 0.80 | Pass, narrowly |
| Matched / mismatched mean Jaccard | 0.947 / 0.041 = **23.3** | ≥ 5 | Pass |
| AUC | 0.991 | reported | |

The prediction recorded beforehand held on both counts: a large share of passages carry no anchor, and top-1 was the weaker bar. (It was weaker than expected; the matched mean was not the uncertain one.)

## Where it is weak

- **One third of the sample cannot be tested** by anchors at all: no number, date or identifier in 8 sentences.
- Unmatched anchors inside informative passages are all numbers: 30 appear only in English, 23 only in Greek. Dates, identifiers and URLs never diverged. Not decomposed further.
- **Top-1 by number of anchors, post-hoc** ([anchors-posthoc.mjs](anchors-posthoc.mjs), not pre-registered):

  | Anchors per side (min) | Passages | Top-1 |
  |---|---|---|
  | 1 | 69 | 0.51 |
  | 2–3 | 76 | 0.97 |
  | 4 or more | 56 | 0.98 |

  A single generic number ("1", a year) ties with other passages. The 0.817 headline is low because of those 69 passages, not because translation breaks the anchors. Anchors identify a passage only when it has two or more.

## Reading

- The literal layer **does** carry across EN/EL on professional translations: where two or more anchors exist, the matched passage is found 97–98% of the time among 200 candidates, and Greek number formats and number words are handled by core.
- This is the easy half. Numbers do not depend on word choice, so this result cannot be used as evidence about meaning. It only removes one doubt: that the layer under the meaning claim is broken across languages.
- The data limits (no speaker boundaries, mixed-script damage in some Greek lines, 8-sentence windows rather than speeches) are those listed in the pre-registration. None was filtered.

## Reproduce

```
node experiments/parallel-document-v1/select.mjs <corpus-dir> --out experiments/parallel-document-v1/selection.json
node experiments/parallel-document-v1/anchors.mjs <corpus-dir>
```
The scorer stops if any passage hash differs from the selection.
