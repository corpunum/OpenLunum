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
| **Baseline** | frozen: `lunum-agent/0.19`, package v23 → **v24** (amendment 1) | `gpt-6.1-sol`, effort medium, [`run-codex-source-only.mjs`](../../scripts/research/run-codex-source-only.mjs) |
| **Change** | ADR 0029: package v24 → **v25** (amendment 1), contract 0.20 (written after the baseline) | the same |

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

## Amendment 1 (2026-10-17, before any baseline call): package numbers

On 2026-10-17 the `__proto__` bug fix (PR #723, an allowed bug fix under ADR 0025) refroze the instruction package as **v24**. Its contract is identical to v23 (`lunum-agent/0.19`, contract hash `b6fdda4c…`, instructions, frames 0.8 and protocol 0.6 all unchanged); only the served-runtime manifest differs. Main no longer serves v23's runtime, so:
- **Baseline:** package **v24** (the frozen contract 0.19, with the bug fix). The requests in `pairs.json` stay valid, because their contract hash is unchanged.
- **Change:** ADR 0029's package becomes **v25** (contract 0.20).

Nothing else changes.

## Amendment 2 (2026-10-17, before any baseline call): package numbers again, and the extractor

**Package numbers.** PR #729 (the Rust renderer port) fixed two renderer defects: the role tie-break now uses code-unit order instead of host-locale `localeCompare`, and world/modality lookups no longer read `Object.prototype`. That changed the served runtime and refroze the instruction package as **v25** (merged at `5f6570bf`). The contract text is identical: v23, v24 and v25 all carry contract hash `b6fdda4c…`, so the requests in `pairs.json` stay valid. Rendering does not feed `lfp:2.1`. Therefore:
- **Baseline:** package **v25** (frozen contract 0.19).
- **Change:** ADR 0029's package becomes **v26** (contract 0.20). [ADR 0029](../../decisions/0029-greek-source-bound-frames.md) is renumbered in the same commit.

**Extractor.** Sol's ChatGPT quota was exhausted on 2026-10-17 by the ADR 0027 gate runs, and that gate moved to Sonnet. This test does the same: both runs use **`claude-sonnet-5-5`** through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs) on the local CLI subscription login (no API key; the item ceiling is $1.00 and the total $120.00 per run, notional reservation). Models are never mixed between or within runs; a run stopped by a usage limit resumes with Sonnet after the reset.
- The judge for bar 3 stays SuperGemma (Google lineage). It is still a different vendor from the extractor (now Anthropic), which is what bar 3 requires. `judge.mjs`'s header comment still names Sol; the code is unchanged.
- The cost moves from ChatGPT quota to Max-plan usage: about 100 items per run, 200 for both.

Bars, data, scorers and predictions are unchanged.

## Amendment 3 (2026-10-17, after the baseline run, before it is scored): one invalid item is re-run

The baseline (`claude-sonnet-5-5`, package v25, commit `9fae0a7a`, 100 items, notional cost $9.69) completed all 100 items, but the runner marked the run **invalid**: one item, `gfh1-e405226cf45a0d79` (Greek), abstained without ever fetching the contract (`CONTRACT_UNBOUND`). The other 99 rows are valid evidence; the runner never counts an unbound row.
- **Re-run that one item only**, with the same model, package and requests file, from a clean clone at this amendment's commit. The contract hash and package are unchanged, so the commit difference does not touch extraction. It is not re-run more than once: if it is invalid again, the baseline reports 99 items and says so.
- **Scorer:** a row with invalid evidence is now replaced by a valid row from a later directory (`score.mjs` and `judge.mjs`, one condition each). Before this, an invalid abstain would have shadowed the re-run.
- The same rule applies to the change run.
- The raw stream of the invalid row stays archived with the run.

Bars, data and predictions are unchanged. Nothing from the baseline was scored before this amendment.
