# Pivot paraphrase v1: first exploration (2026-10-16/17)

**Exploratory, self-reviewed, no pre-registered bar; nothing here is an identity or a claim about Lunum.** It shows what the [design](DESIGN.md) produces on real data, so that the first pre-registered measurement can be planned. Cost: $0 (local models, CPU). Corpus text is not committed; phrases, counts and model outputs are, in [`results/`](results/).

## Corpora (OPUS, Moses releases, kept outside the repository)

| Corpus | Pairs used | Register | Translation |
|---|---|---|---|
| Europarl v8 EL–EN | 1,292,180 | parliamentary | professional |
| TED2020 v1 EL–EN | 269,407 | talks | volunteer, reviewed |
| OpenSubtitles v2018 EL–EN | **first 10,000,000** of 40,492,942 | everyday dialogue | mostly amateur subtitlers: a lower-trust reference |

[`pivot-miner`](../../tools/pivot-miner) indexes Europarl in 20 s and the 10M subtitle pairs in 65 s.

## 1. The owner's example, on real translations (OpenSubtitles, [`results/police-os.jsonl`](results/police-os.jsonl))

| Query | What translators wrote | Lines |
|---|---|---|
| "call the police" (1,421 lines) | «καλέσω την αστυνομία» (240), «θα καλέσω την αστυνομία» (143), «καλέσουμε την αστυνομία» (103), «κάλεσε την αστυνομία» (106); paraphrase also gives «φωνάξω την αστυνομία» | |
| "called the police" (197) | «κάλεσα την αστυνομία» (27), «πήρα την αστυνομία» (6) | |
| «πάρε την αστυνομία» (100) | pivots "ring the police", "call the police now"; 50 lines pair it with "call the police" | 50 |
| «τηλεφώνησε στην αστυνομία» (40) | pivots "telephoned the police", "phone the police"; 4 lines with "called the police" | 4 |
| **«πάρε το 100»** (9) | **"call 911"** in 5 of 9 lines | 5 |

- «κάλεσε», «πήρε», «τηλεφώνησε», «φώναξε» + «την αστυνομία» are all attested translations of one English meaning: **the owner's example holds in professional-or-not human translation, not only in a model's opinion.**
- «πάρε το 100» ↔ "call 911": subtitlers **localise** the emergency number. That is the «πήρε το 100» case. It is not word identity and not even the same referent (100 vs 911); it is the relation ADR 0028 calls `implies` (or a locale equivalent), which only a concept layer with relations, not a hash, can carry.
- Parliamentary text cannot show this: Europarl and TED2020 have 0 lines of "call the police" ↔ «καλώ την αστυνομία».

## 2. Models propose, the corpora verify ([`propose.mjs`](propose.mjs), [`verify.mjs`](verify.mjs), [`combine.mjs`](combine.mjs))

20 seed meanings ([`seeds.tsv`](seeds.tsv); the Greek is AI-drafted, owner review pending). Each model was asked for up to 8 EN phrases, 8 EL phrases and 8 EN–EL pairs per seed, at temperature 0.

| Model (family) | Seeds answered | Pairs to check | Best evidence: exact | Stem only | None |
|---|---|---|---|---|---|
| Qwen 3.8 Flash (Alibaba), Halogen | 16 of 20 (4 requests failed after 300 s on the shared server) | 297 | 86 (29%) | 86 | 108 |
| SuperGemma (Gemma lineage), ROG Ally | 19 of 20 (1 unparseable) | 405 | 139 (34%) | 109 | 140 |
| **Proposed by both families** | | 71 | **35 (49%)** | | |
| Proposed by one family only | | 560 | 155 (28%) | | |

"Exact" = the phrase pair co-occurs in at least 3 aligned lines with G² above the p < 0.001 threshold, in at least one corpus. "Stem" = the same test after crude stemming. **Stem evidence is weak**: SuperGemma's non-word «καλέω» stem-matched «καλεί» ("calls on"). It is reported, never trusted alone.

What this shows:
- **Agreement across model families predicts attestation**: 49% against 28%. That supports the owner's idea of using several families, as a filter, not as a reference.
- **Verification catches model errors**: «καλέω» (not a Greek form), a Greek–Arabic hybrid «καُلω» from SuperGemma, invented phrases with zero lines.
- **Base forms hide attestation.** Models answer in dictionary form («τηλεφωνώ στην αστυνομία»); corpora hold inflected forms («τηλεφώνησε», «πάρε»). Lemmatisation (or asking models for inflected forms) is needed before "not attested" means much.
- Agent-domain seeds ("delete the file", "restart the service") have no attested pairs at all: none of these corpora is about software. Agent traffic needs its own bilingual source (for example, localised software documentation or UI strings via OPUS).

## 3. Weaknesses to fix before a measurement

1. Sentence alignment only: every n-gram in a translated line gets credit; long subtitle lines inflate counts.
2. Greek inflection splits one concept across many forms (αστυνομία / αστυνομίας / αστυνομικής); the crude stemmer over- and under-matches.
3. OpenSubtitles is amateur translation and only a quarter of it was indexed.
4. Paraphrase of very frequent phrases («πρέπει να») still drowns in function words.
5. The seed Greek is AI-drafted; the owner reviews it before any measurement uses it.

## Next

- Pre-register the first measurement (the held-out round-trip test in [DESIGN.md](DESIGN.md)), with lemmatised matching.
- Add a Greek lemmatiser (UD/UniMorph data already used in the 2026-09 reports) to `pivot-miner`.
- Build the first owner worksheet: per seed, the attested clusters with counts, for same / broader / implies / different.
