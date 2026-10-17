# Greek frames held-out test (ADR 0029): pre-registration

**Committed 2026-10-17, before any model call on these pairs and before any ADR 0029 code is written. Self-reviewed.** The owner approved proceeding with Greek frames on 2026-10-17 (relayed by corpunum-6b); this is ADR 0025's path: held-out set → baseline under the frozen contract → change → same run → bars.

## Data ([`select.mjs`](select.mjs) → [`pairs.json`](pairs.json), deterministic, seed `greek-frames-heldout-v1:2026-10-17`)

- **30 Europarl EN/EL sentence pairs** (OPUS Europarl v8, professional translation), 25 to 200 characters per side, excluding every line parallel-document-v1 selected. Text stays outside the repository; handles and hashes are committed.
- **20 Tatoeba EN/EL pairs** (CC-BY), never used anywhere in the tracked repository:
  - T1–T10 are first or second person English whose Greek has no subject pronoun, to test pro-drop;
  - T11–T20 are the next 10 in seeded order.
- 100 source-only requests, bound to package v23 for the baseline (rebound to v24 for the change run, with the same texts and handles recomputed by the same script).

## Runs

| Run | Contract | Extractor |
|---|---|---|
| **Baseline** | frozen: `lunum-agent/0.19`, package v23 | `gpt-6.1-sol`, effort medium, [`run-codex-source-only.mjs`](../../scripts/research/run-codex-source-only.mjs) |
| **Change** | ADR 0029: package v24, contract 0.20 (written after the baseline) | the same |

Both runs use all 100 requests. A run stopped by quota is resumed with the same model after the reset; models are never mixed.

## Measures and bars (on the change run; the baseline is reported next to it)

Covered = a valid parse with an `lfp:2.1` identity that is not a sentence copy.

| # | Measure | Bar |
|---|---|---|
| 1 | Greek coverage | at least **half of English coverage** on the same 50 pairs, and at least 15 Greek sentences covered |
| 2 | Level (a): structure agreement EN↔EL on pairs covered on both sides (predicate, sorted roles, negation, modality, mood; as `structure.mjs` in clc-v1) | at least **60%**, over at least 15 pairs; T1–T10 also reported alone |
| 3 | Level (b): a cross-vendor judge (SuperGemma, Google lineage; the extractor is OpenAI) reads the Greek source and its Greek record and answers "does the record state the content of the sentence?" | at least **80%** of covered Greek sentences; the judge is valid only if it says "yes" for at most 10% of 20 seeded controls (records paired with another sentence) |
| 4 | Safety | **0** new merges in the adversarial, collision and contrast suites; **0** identity movement on a replay of every recorded English candidate |
| 5 | Deixis (T1–T10) | reported: how many covered Greek records carry a `speaker`/`addressee`-type agent, against the English side |

All five must hold for ADR 0029 to be merged. The scorer is committed before the change run.

## Prediction

- Baseline: Greek coverage near 0 (all "unsupported"), English similar to Stage 0 (about two-thirds).
- Change: Greek coverage clears bar 1.
- Bar 2 is uncertain: frame choice (`describe` vs `relate`) differs between languages even when the meaning matches.
- Bar 3 likely holds.

## Cost

ChatGPT quota, about 100k input tokens per item: about 10M per run, 20M for both. SuperGemma judge: about 1 hour on the Ally (coordinated with the rig coordinator).
