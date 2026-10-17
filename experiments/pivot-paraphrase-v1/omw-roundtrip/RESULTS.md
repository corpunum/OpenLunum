# Pivot miner vs an independent wordnet gold: results

**Run 2026-10-17 against the [pre-registration](PREREGISTRATION.md) (commit `26c1e3c`, pushed before the run). No model call; cost $0; CPU only. Self-reviewed.** Output: [results.json](results.json).

| Configuration | Top-1 | Top-5 | No candidates |
|---|---|---|---|
| Europarl, surface | 0.373 | **0.540** | 12 |
| **Europarl, lemma (primary)** | 0.347 | **0.500** | 8 |
| OpenSubtitles 10M, surface | 0.447 | 0.587 | 24 |
| OpenSubtitles 10M, lemma | 0.423 | 0.547 | 19 |

Paired top-5, items right in only one mode: Europarl 23 surface-only against 11 lemma-only; OpenSubtitles the same, 23 against 11.

| Bar | Result | Verdict |
|---|---|---|
| H1: lemma top-5 ≥ surface top-5 + 0.05 | 0.500 vs 0.540 | **Fail** (lemma mode is worse) |
| H2: lemma top-5 ≥ 0.60 | 0.500 | **Fail** |

The prediction (lemma about 0.60, H1 passing) was wrong in direction. OpenSubtitles did better than Europarl, also against the prediction.

## Why (post-hoc, found after the result)

For many unrelated English words, lemma mode returned the **same** five Greek words («συζήτηση, πρώτος, επίπεδο, ασφάλεια, εργασία»). Cause: a defect in `lemma_map`. It merged lemmas that share any inflected form, **transitively**, and in UniMorph English the chains built giant classes: "card", "dance", "strip" and "game" all became one class labelled `aba`, "knowledge" and "news" became `abgusht`. A query for "card" then searched a token found in a large share of all lines. The lemma idea was not what failed; this implementation of it was.

**The verdicts stand.** A corrected binary (no transitive merging; each form maps to its own lemmas only) is run on the same items under [amendment 2](PREREGISTRATION.md) as **post-hoc** evidence, reported below when it finishes.

## What else this invalidates

- The lemma-mode attestation counts in [`results/candidates-lemma.json`](../results/candidates-lemma.json) and the two `verified-*-lemma.summary.json` files, and **[WORKSHEET-v1.md](../WORKSHEET-v1.md)**, were produced by the same defective lemma mode: an English phrase containing a merged word could be counted as attested. They are superseded by a regenerated worksheet (v2) built with the corrected binary; v1 is kept as published and marked superseded.
- The surface-mode results and the [exploration](../EXPLORATION.md) (surface mode only) are not affected.

## Limits (as pre-registered)

The wordnet gold is incomplete and sense-fine, so absolute accuracy is a lower bound: «πειθαρχία» for "discipline" and «κόπωση» for "fatigue" count as wrong because the Greek wordnet lists other words.

## v2, corrected lemma mode (post-hoc, amendment 2) — [results-v2.json](results-v2.json)

| Configuration | Top-1 | Top-5 | Paired top-5 (surface-only / lemma-only) |
|---|---|---|---|
| Europarl, surface | 0.373 | 0.540 | |
| Europarl, lemma | 0.367 | **0.540** | 7 / 7 |
| OpenSubtitles 10M, surface | 0.450 | 0.583 | |
| OpenSubtitles 10M, lemma | 0.447 | **0.590** | 5 / 7 |

(Surface rows differ by at most one item from the original run because the corrected lemma table also changes how candidates are classified when scored.)

**With the defect removed, lemma mode ties surface mode on single words.** The pre-registered H1 would still fail. Reading, post-hoc: the scorer maps every candidate to its lemma before checking it against the gold, so surface mode already gets lemma credit at scoring time; for single dictionary words lemma indexing can only change counts, not find new words. Lemma mode's benefit shows on phrases (in OpenSubtitles «καλώ την αστυνομία» matches 439 lines in lemma mode against 9 in surface mode), which this single-word test does not measure. A phrase-level gold is needed to measure that, and none exists yet.

Known cost of the fix: without merging, UniMorph's variant lemmas stay apart. «τηλεφώνησε» is filed under τηλεφωνάω, so a query «τηλεφωνώ» no longer meets it. Merging true variants (lemmas sharing most of their forms, without chains) is a design question left open, not tuned on these items.
