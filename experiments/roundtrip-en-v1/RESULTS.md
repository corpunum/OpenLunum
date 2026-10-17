# R4: English round trip (EN → Lunum → EN, Rust render): results

**Run 2026-10-17. Self-reviewed.** Pre-registration: [PREREGISTRATION.md](PREREGISTRATION.md), with amendment 1.

## Verdict: PASS by the pre-registered bars. The level (b) evidence is weak: the two judges barely agree.

| # | Bar | Result |
|---|---|---|
| 1 | Rust render = TS render on 100% of covered records | **49 / 49: PASS** |
| 2 | SuperGemma says the code states the sentence's content on ≥ 80% of ≥ 30 covered; ≤ 10% false "yes" on 20 controls | **48 / 49 = 98%: PASS**; controls 1 / 20 false "yes" (valid) |

## Run

- Extraction: `claude-sonnet-5-5`, package v25 (contract `lunum-agent/0.19`), commit `c381be98`, 200 Tatoeba sentences. Three items never fetched the contract (`CONTRACT_UNBOUND`); under amendment 1 each was re-run once at `b5f9864e`. Two became valid; `rt1-82c61fa5322209c0` failed again (no tool call at all) and counts as **not run**.
- Notional cost: $19.79 + $0.19 (Max plan, no API charge). SuperGemma on the Ally and Qwen on Halogen: about 25 minutes each.
- Rendering: `crates/lunum-render` CLI (PR #730) at `b5f9864e`.
- Files: [`score.json`](score.json), [`rust-renders.jsonl`](rust-renders.jsonl), [`judgements-gemma.json`](judgements-gemma.json), [`judgements-qwen.json`](judgements-qwen.json); raw run: [`reports/independent-evaluation/2026-10-17-rt1-sonnet/`](../../reports/independent-evaluation/2026-10-17-rt1-sonnet/) (Tatoeba, CC-BY).

## Coverage (the real headline)

| Items | Run | Parses | Sentence copies | **Covered** | Abstains | Invalid (not run) |
|---|---|---|---|---|---|---|
| 200 | 200 | 78 | 29 | **49 (24.5%)** | 122 | 1 |

As predicted (20 to 30%), but it is the main limit: three quarters of plain English sentences get no record from Sonnet under the frozen contract, and 29 of the 78 parses are sentence copies. The Greek-frames baseline (9/50 English covered) and the ADR 0027 v2 gate (26/120) agree.

## The judges

| Judge | "States content" | Controls false "yes" |
|---|---|---|
| SuperGemma (Google lineage, the bar) | 48 / 49 = 98% | 1 / 20 |
| Qwen 3.8 Flash (Alibaba lineage, reported) | 33 / 49 = 67% | 0 / 20 |

**Agreement 34 / 49 = 69%, Cohen's kappa 0.08.** Both judges are valid on controls, but they disagree on 15 items, always SuperGemma "yes" and Qwen "no". SuperGemma is lenient; Qwen is strict. Level (b) as defined needs an agreement rate. This one is poor, so the 98% should not be quoted alone.

**My own reading of the 16 items Qwen rejected (self-review, not a bar).**

| Reading | Count | Items |
|---|---|---|
| Real errors | 6 | "Tom asked **me** if I were hungry" drops "me"; "Do you like cheese?" → `topic(subject=you like cheese)` (the question is lost: the extractor gave it `kind: simple_fact`); "There were a lot of people in the park" → `describe(subject=the park, attribute=There were a lot of people)` (roles garbled); "Tom **will** be ready" → modality `intention` (future, not intention); "Tom **knows** …" → `believe` (factive lost); "Tom never **saw** Mary" → `read` (wrong predicate; SuperGemma's only "no") |
| Approximations | 2 | "gave" and "brought" → `send` |
| Content kept | 8 | `describe` records whose filler holds the predicate words, e.g. `describe(subject=tom, attribute=swims very fast)`. Qwen rejects the frame; the content is there |

On that reading, 41 to 43 of 49 (84 to 88%) state the content, still above 80%, but one reader is not a judge.

## What this shows

- **The Rust path works.** Rust store, identity and rendering reproduce the TypeScript output exactly on fresh live records.
- **Where a record exists, it mostly keeps the meaning.** The failures come from the extractor, not the renderer: a wrong predicate (saw → read), a wrong modality (will → intention), a lost participant. The validator accepts all of them, because each word is in the source or the frame allows it.
- **The renderer does not show `kind`.** That is how `generic-en-pivot/0.2` is designed, and it is not a port error. It did not cause any failure here: the one question that lost its mood was already a `simple_fact` in the record (corrected on 2026-10-17; the first version of this file blamed the renderer).
- **What was not measured:** level (c), and any English rendering for people to read. The code is a pivot notation.

## Against the predictions

| Prediction | Outcome |
|---|---|
| Coverage 20 to 30% | **Right** (24.5%) |
| Bar 1 passes | **Right** |
| Bar 2 about 60% likely | Passed with the lenient judge; on Qwen's strict reading it would have failed (67%) |
