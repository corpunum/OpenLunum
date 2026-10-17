# R4: English round trip (EN → Lunum → EN, rendered in Rust): pre-registration

**Committed 2026-10-17, before any model call on these sentences and before the Rust renderer CLI exists. Self-reviewed.**

**Question.** When Lunum turns an English sentence into a record and the Rust renderer (`crates/lunum-render`, `generic-en-pivot/0.2`, R3, PR #729) writes it back out, does the output still state what the sentence said? This is step R4 of the Rust track (R1 `lunum-sem`, R2 `lunum-store`, R3 `lunum-render`; plan approved by the owner on 2026-10-17). It measures meaning at **level (b)**: same meaning, judged by a model from a different vendor than the extractor. Exact identity (level (c)) is not claimed.

## Data ([`select.mjs`](select.mjs), deterministic)

- Seed `roundtrip-en-v1:2026-10-17`: **200** English Tatoeba sentences (CC-BY, already in the repository) of 4 to 20 words, found nowhere else in the tracked repository. That excludes every earlier gate, probe and held-out set, including both ADR 0027 gates and the Greek-frames pairs; 8 were skipped.
- [`requests.jsonl`](requests.jsonl), handles `rt1-`, bound to the frozen contract (`lunum-agent/0.19`, hash `b6fdda4c…`) through package **v25**. If main stops serving v25 before the run, an amendment rebinds the requests to the then-served package with the same contract hash before any call.

## Runs

1. **Extraction:** `claude-sonnet-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs) on the local CLI subscription login (no API key), one run, concurrency 1, item ceiling $1.00, total $200.00 (notional reservation). A run stopped by a usage limit is resumed with Sonnet after the reset; models are never mixed.
2. **Rendering:** [`score.mjs --emit`](score.mjs) writes the covered records; a `lunum-render` CLI (built after this commit by the Rust agent: stdin JSONL `{"handle","sem"}`, stdout JSONL `{"handle","code"}` or `{"handle","error"}`, profile `generic-en-pivot/0.2`) renders them.
3. **Judging:** [`judge.mjs`](judge.mjs) with SuperGemma (Ally) for the bar, then Qwen 3.8 Flash (Halogen, rig protocol) for the agreement rate.

**Covered** = a valid parse with an `lfp:2.1` identity that is not a sentence copy (a filler holding ≥ 90% of the folded source). Sentence copies would pass the judge trivially, so they are excluded and counted.

## Bars

| # | Measure | Bar |
|---|---|---|
| 1 | Rust parity: the Rust code equals TS `renderSem(sem, { profile: 'generic-en-pivot/0.2' }).code` | **100%** of covered records |
| 2 | Level (b): SuperGemma (Google lineage; the extractor is Anthropic) reads the source sentence and the Rust-rendered code and answers "does the code state the content of the sentence (who does what to whom, negation, modality)?" | **≥ 80%** of covered sentences, over **≥ 30** covered. The judge is valid only if it says "yes" to at most 10% of **20** seeded controls (a code paired with another covered sentence) |

Both must hold for R4 to pass. With fewer than 30 covered sentences the result is a **non-verdict**, published as such.

**Reported, not bars:**
- coverage (items run, parses, abstains, failures, invalid evidence, sentence copies, covered);
- the second judge's rate, its controls, and Cohen's kappa between the two judges on own items (the agreement rate that level (b) requires; the owner delegated spot checks to models on 2026-10-17);
- every "no" from SuperGemma, listed with its sentence and code, so the failure kinds can be read;
- level (c) is not measured (one run).

Scorer smoke test (in-sample, a spent set): on the ADR 0027 v2 gate's Sonnet run A, the scorer counts 26 covered of 120 run (19 sentence copies, 58 abstains, 17 failures), which is why this set has 200 items.

## Prediction

- Coverage about 20 to 30% of items (40 to 60 covered), as in the ADR 0027 gates: the frozen contract abstains often.
- Bar 1 passes (R3 had 10522/10522 parity on goldens).
- Bar 2 is uncertain, my estimate about 60%: the code drops tense, articles and some modifiers by design, and `describe`/`define` codes like `describe(subject=food, attribute=cold)` are close to the source, but multi-clause sentences may lose participants.

## Cost

About 200 Sonnet items on the Max subscription (notional ~$0.10 per item, ~$20 notional, no API charge). SuperGemma: about 1 hour on the Ally (slot from the rig coordinator). Qwen: about 1 hour on Halogen outside its busy minutes. No GPU on the rig.

## Amendment 1 (2026-10-17, after extraction, before rendering, judging or scoring): three invalid items are re-run

The extraction (`claude-sonnet-5-5`, package v25, commit `c381be98`, 200 items, notional cost $19.79) completed all 200 items. The runner marked it **invalid** because three items never fetched the contract (`CONTRACT_UNBOUND`): `rt1-6de44c2049c9ca0a`, `rt1-3e51c1c7a0689ca9` and `rt1-82c61fa5322209c0`. The other 197 rows are valid evidence.
- **Those three items are re-run once each**, with the same model, package and requests, from a clean clone at this amendment's commit (the contract hash is unchanged). If an item is invalid again, it is reported as not run, and the denominators say so.
- **Scorer:** [`score.mjs`](score.mjs) already replaces a row with invalid evidence by a valid row from a later directory (this rule was in the committed scorer; the same rule as greek-frames amendment 3).
- Nothing was rendered, judged or scored before this amendment. Bars, data and predictions are unchanged.
