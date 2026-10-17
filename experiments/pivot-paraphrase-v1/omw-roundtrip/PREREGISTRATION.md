# Pivot miner vs an independent wordnet gold: pre-registration

**Committed 2026-10-17, before [`score.mjs`](score.mjs) has run on these items. No model call. Self-reviewed.**

## Question

Does [`pivot-miner`](../../../tools/pivot-miner), mining professional translations, find the Greek word a dictionary gives for an English word? And does the new **lemma mode** (UniMorph lemma classes on both sides) find it more often than surface forms?

This is a measurement of the tool, the corpus layer under the owner's "meaning, not words" direction. It is **not** a measurement of Lunum records at any of the three levels.

## Gold, independent of the tool and the corpora

[Open Multilingual Wordnet 2.0](https://github.com/omwn/omw-data/releases/tag/v2.0) (archive sha256 `c369a2ad…8d7d`, the pin already in the repository's resource manifest). An English lemma and a Greek lemma are translations when they share a synset. Nouns and verbs, single words only. The gold for an English word is the set of Greek lemmas over **all** its synsets.

## Items ([`select.mjs`](select.mjs) → [`items.json`](items.json), deterministic)

- Seed `pivot-omw-roundtrip-v1:2026-10-17`; English words with Greek gold (13,931) whose Europarl line frequency is 20 to 20,000 (4,893), ranked by `sha256(seed|word)`; the first **300**.
- No item was chosen after running the miner on it. The functional check of lemma mode used the police phrases, which are not items.

## Procedure ([`score.mjs`](score.mjs))

- `pivot-miner translate` for each English word, no round trip, four configurations: Europarl surface, Europarl lemma (**primary**), OpenSubtitles first 10M pairs surface and lemma (secondary).
- The first **5 single-word** Greek candidates are kept. Candidates and gold are mapped to lemma classes with the miner's own rules (`--classify`, UniMorph Greek), in every configuration alike, so both modes are scored the same way.
- **Correct** at k when one of the first k candidates is in the gold's classes. A query with no candidates counts as wrong.
- Reported: top-1, top-5, items with no candidates, and the paired discordant counts (McNemar) between modes.

## Bars (primary, Europarl)

| | Bar |
|---|---|
| H1: lemma mode helps | lemma top-5 ≥ surface top-5 + 0.05 |
| H2: usable | lemma top-5 ≥ 0.60 |

## Known limits, stated before the result

- **The gold is incomplete and sense-fine.** "shoes" has only «θέση» («in someone's shoes»); "better" has only its verb senses. A correct translation missing from the wordnet counts as wrong, so absolute accuracy is a lower bound. H1, a paired comparison on the same items and gold, is less affected than H2.
- UniMorph lacks some forms (Greek subjunctives such as «καλέσω»); unknown words stay as they are.
- Single words only; the owner's examples are phrases. A phrase test needs a phrase gold, which this is not.

## Prediction (written before running)

Surface top-5 around 0.45, lemma top-5 around 0.60: H1 passes, H2 is a coin flip because of the gold's gaps. OpenSubtitles lower than Europarl for this parliamentary-frequency sample.
