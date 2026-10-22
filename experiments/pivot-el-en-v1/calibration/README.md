# Owner judge calibration (plan stage P3 prep)

P3 (docs/PLAN-rust-engine-language-pairs.md) judges the Greek round trip with two judges (SuperGemma + Sol). Before their verdicts count, they are checked against the owner's own labels on the same kind of item. This directory holds the 40-item worksheet the owner fills in by hand.

## Files
- `WORKSHEET-owner.md`: what the owner sees (Greek original, round-tripped Greek, four boxes, a comment line). Item numbers only; no hint which items are controls.
- `items.jsonl`: one line per item (`id` = worksheet number), including the **private answer key** (`isControl`, `controlKind`), the Greek original, the English pivot and its meaning flags, the model's round-trip Greek (`roundTripGreek`), the text actually shown (`shownGreek`; differs from `roundTripGreek` only for controls), guard results, and the Tatoeba attribution. The human English side is kept in `humanEnglishNotShown`. Do not send this file to the owner.
- `select-candidates.mjs` -> `candidates.json` (selection), `roundtrip.mjs` -> `roundtrip-raw.jsonl` (raw model output), `build-worksheet.mjs` (items + worksheet). Rerunning them reproduces the worksheet from the same raw file; no model call after `roundtrip.mjs`.

## Selection (deterministic)
Tatoeba EN-EL pool (`datasets/third-party/tatoeba-eng-ell-2026-10`, CC-BY 2.0 FR), English 4-20 words, Greek 4-14 words; minus the 160 held-out and 20 dev pairs of `pivot-el-en-v1` (excluded by sha256 of their strings; their text was not read), minus any sentence found elsewhere in the tracked repository; sha256 order with seed `pivot-el-en-v1:calibration:2026-10-22`; one pair per sentence. 32 ordinary items from the first 36 candidates, plus 8 controls from candidates whose Greek has negation, modality or a number. Worksheet order: sha256 with seed `pivot-el-en-v1:calibration:order:2026-10-22`.

## Items
Greek original -> English (`pivot-translate/0.1`, `buildPivotPrompt`, Qwen `qwen3.8-flash-next-uncensored-lean` on Halogen, temperature 0) -> Greek (`buildRenderPrompt` with the hop-1 flags, same model). The ordinary items are the unedited second-hop Greek (so they include natural errors: paraphrase, lost register, wrong case). Guard failures are kept (`hop*GuardPass`), not filtered; they are items too.

**8 controls**, a known meaning change injected by a string edit into the round-tripped Greek: 3 negation flips (`δεν` removed), 2 may->must («μπορώ να» -> «πρέπει να»), 2 must->may, 1 number change (2:30 -> 4:30). Expected owner label: **different**. An owner who says «ίδιο» on a control was inattentive on that item; if more than 2 of 8 are missed, the whole worksheet is treated as unreliable and re-collected.

## Parsing the filled worksheet
For each `## N` section take the four `- [ ]` lines; a box counts as marked if it matches `\[[xXχΧ✓✔]\]`. Label = `same` / `mostly_same` / `different` / `cant_tell` in the order printed. Exactly one box marked is valid; none or several -> item `unlabelled` (reported, excluded). For `mostly_same` the text after «χάθηκε:» is the note; the `Σχόλιο:` line is free text. Report: labelled items, control hit rate, label distribution.

## Use
1. Owner labels are collapsed to a binary level-(b) verdict, `same` and `mostly_same` = **equivalent**, `different` = **not equivalent**; `cant_tell` items are dropped from agreement (count reported). A strict variant (`mostly_same` = not equivalent) is reported alongside.
2. Each judge (SuperGemma, Sol) receives the same Greek pair with the P3 level-(b) question and returns the same binary verdict (and, in a second pass, the 4-way label).
3. Per judge: raw agreement with the owner, Cohen's kappa (binary and 3-way same/mostly/different), and the confusion matrix, on the labelled non-control items, plus control detection (the share of the 8 controls the judge calls not equivalent; target 8/8). Judge-vs-judge agreement uses the same measures.
4. The P3 bar "judge agreement >= 75%" is read against the owner-based agreement as well; a judge with kappa < 0.4 against the owner, or that misses more than 1 control, is not used for P3 verdicts. These thresholds are set here before any judge is run on the worksheet.

Attribution: Tatoeba sentences, CC-BY 2.0 FR (see the dataset README for contributors).
