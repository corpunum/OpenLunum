# Parallel documents v1, free measure: pre-registration (anchors)

**Committed 2026-10-16, before the selection script or the scorer was run. No model is called by this measure; it costs nothing. Self-reviewed.**

Supersedes nothing. It refines the "Anchors" measure of [PLAN.md](PLAN.md). The paid measures (meaning structure, cross-vendor judgement) get their own pre-registration and need the owner's budget approval first.

## Level

**Below level (a).** This measures the literal layer only (numbers, dates, identifiers, URLs). It says nothing about meaning, structure or identity. It checks that the language-neutral anchors Lunum already keeps agree between a professional translation and its original, and that they can tell a matched pair from a mismatched one.

## Reference

OPUS Europarl v8, EL–EN, Moses release: <https://object.pouta.csc.fi/OPUS-Europarl/v8/moses/el-en.txt.zip> (zip sha256 `b99466a78856a71dbc03e6c1089f665b70ce631cfaa5302b05aa707ef3e7dd25`). European Parliament debates with official human translation, sentence-aligned by OPUS. The corpus text is not committed; the selection records ids, line numbers and SHA-256 hashes, and the scorer refuses to run if a hash differs.

Not used: en.protothema.gr (mostly machine-translated), a model's memory of books.

## Unit and its limits

The Moses release has **no speaker or speech boundaries**. The unit is therefore a **passage of 8 consecutive aligned sentence pairs** inside one session-day document. A passage can span two speakers. It stands in for a speech; it is not one. Alignments can be 1:2 or 2:1 inside a line.

The Greek side is known to contain mixed-script damage (Latin look-alike letters inside Greek words). It is **not** cleaned and **not** excluded; the damage is part of the real data.

## Selection ([select.mjs](select.mjs), deterministic)

- Seed `parallel-document-v1:2026-10-16`.
- Documents (one per session day) with at least 40 aligned pairs are ranked by `sha256(seed|docId)`.
- For each document in rank order, up to 20 window starts are derived from `sha256(seed|docId|k)`. The first window whose 8 pairs all have 25–600 characters per side, do not start with "(", and are not identical across languages is accepted. Documents with no acceptable window are skipped and counted.
- The first **300** accepted passages are the sample.
- The script fails if the Moses line counts differ from the alignment link count.

## Measure ([anchors.mjs](anchors.mjs))

- Signature of a passage = the union, over its lines, of `unitLiterals` **numbers, dates, identifiers and URLs** from `packages/core` (so number words such as "two"/«δύο» and Greek decimal commas are handled by core, not by this script). Relative times, paths and hashes are not used (language-bound or absent).
- A passage pair is **informative** when both the EN and the EL signature are non-empty. Everything is computed on informative passages; the informative share and the empty counts are reported.
- Similarity = Jaccard of the two signatures.
- **Matched** = EN passage *i* with EL passage *i*. **Mismatched** = EN *i* with EL *j*, all *j ≠ i*, over informative passages.
- Reported: matched mean Jaccard, mismatched mean Jaccard, their ratio, **top-1** (the matched EL passage is the unique best among all informative EL passages; ties give 1/k), and AUC (probability that matched beats mismatched, ties 0.5).
- Which anchor kinds are present on only one side is tabulated, to locate failures.

## Bars (all three required)

| Measure | Bar |
|---|---|
| Matched mean Jaccard | ≥ 0.50 |
| Top-1 | ≥ 0.80 |
| Matched / mismatched mean Jaccard | ≥ 5 |

Passing means only: the literal layer is a usable cross-language signal on professionally translated parliamentary text. Failing means the literal layer disagrees across EN/EL on real translations, and the failure table says where.

## Prediction (written before running)

- I expect the informative share to be well under 100%, because many 8-sentence stretches contain no number.
- I expect top-1 to pass and the matched mean to be the uncertain bar, because translators write numbers as words, change ordinals, and the alignment drops or merges lines.

## Not done here

- No claim about meaning, structure or identity.
- No sentence-level or speech-level result. A passage window is not a speech.
- The 20-passage paid subset is not chosen here: the paid pre-registration names it, so that it cannot be picked after seeing results.
