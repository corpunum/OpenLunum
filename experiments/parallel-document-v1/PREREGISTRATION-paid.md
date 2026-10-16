# Parallel documents v1, paid measures: pre-registration (DRAFT, not yet binding)

**Drafted 2026-10-16. No model has seen any of these passages. Self-reviewed.**

**Status: draft.** It becomes binding when (1) the owner approves a budget for a stage, (2) the owner names the cross-vendor judge and supplies access (open items below), and (3) an amendment commit records both. Nothing is run before that commit. The free anchor measure is already done ([results](RESULTS-anchors.md)).

## Questions

Under the frozen contract (`lunum-agent/0.19`, package v23, `lfp:2.1`, [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md)), for professionally translated EN/EL passages:

1. **Level (a), structure.** Is the multiset of meaning structures Lunum records for the English passage closer to that of its Greek translation than to those of other passages?
2. **Level (b), same meaning.** Does a bilingual judge from another vendor, shown only the Lunum records, find the true translation's records to state the same content, whatever the words?
3. **Level (c), exact identity.** Reported for completeness, no bar. Expected low ([clc-v1](../cross-language-convergence-v1/RESULTS.md): 0 of 5).

## Data

The 300-passage [selection](selection.json) (Europarl v8 EL–EN, 8 consecutive aligned pairs, seeded). **The paid sample is passages 1 to 20 in `selection.json` order**, fixed now, before any result, regardless of how many anchors they hold. Limits as in [PREREGISTRATION-anchors.md](PREREGISTRATION-anchors.md): a passage is not a speech and can span speakers. Source text stays private to the run; only ids, hashes, aggregates and costs are published.

Sentences are long: in the 300 passages the mean is 155 characters (EN) and 174 (EL), up to 516 and 577. clc-v1 used shorter sentences.

## Procedure

1. **Requests:** one source-only request per sentence (16 per passage), built by a script committed before any call. The language is recorded, nothing else is added.
2. **Extraction:** [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), exact model ID recorded, one item at a time, one fresh process per sentence, same as clc-v1. Invalid items (including `CONTRACT_UNBOUND`) are counted as **not covered**; they stay in the denominator.
3. **Level (a) score**, offline: per passage and language, the multiset of clause structures of covered sentences (predicate, sorted role names, negation, modality, mood, conditions/consequences), exactly as in [`structure.mjs`](../cross-language-convergence-v1/structure.mjs). Similarity of EN passage *i* and EL passage *j* = multiset Dice.
4. **Level (b) judgement**, after (a) is scored and frozen: the judge sees, for an English passage, its covered records and **four** Greek-passage record sets: the true translation and three seeded mismatched ones, in seeded order. It does not see the source text, the labels or which is true. It picks the set that states the same content, and for each of the four answers yes/no "same content". Prompt and seed are committed before the call.
5. **Owner spot-check:** the owner reads the actual passages for 10 seeded matched and 10 seeded mismatched pairs and marks same/different. Judge–owner agreement is reported.
6. **Publication:** every item, failure, abstention, stopped run and cost.

## Stages (cost control)

**Stage 0, pilot:** passages 1 and 2 (32 sentences). Purpose: measure Greek coverage and cost on long parliamentary sentences. Its extractions are kept and counted in Stage 1.
**Go for Stage 1 only if** Greek coverage is at least 4 of 16 **and** mean cost is at most $0.30 per item. Otherwise stop, publish the pilot, and report that the paid measure is not evaluable for this contract. That is a result, not a failure to hide.
**Stage 1:** passages 3 to 20 (288 sentences).

## Evaluability and bars

- **Evaluable only if** at least 40 sentences per language are covered across the 20 passages and at least 10 passages have at least 2 covered sentences on both sides. Otherwise the verdict is "not evaluable (coverage)" for (a) and (b), as in clc-v1.
- **Level (a):** matched mean Dice at least 2× the mismatched mean, and top-1 (true EL passage best of the evaluable passages, ties 1/k) at least 0.50.
- **Level (b):** judge top-1 pick at least 0.70 (chance 0.25), and "same content" said for at most 10% of mismatched sets. **The judge is accepted only if** its agreement with the owner on the 20 spot-checked pairs is at least 80%; otherwise (b) is reported as unvalidated.
- Reported in all cases: coverage per language, invalid counts by cause, cost per item, and the judge's own refusals.

## Prediction (written before running)

Greek coverage will again be far below English (clc-v1: 3/40 against 11/40), so Stage 0 is likely to stop the run or leave it barely evaluable. If Stage 1 runs and is evaluable, I expect level (a) to pass more easily than (b), and Greek pro-drop (dropped agents) to be the main cause of structure misses.

## Cost and budget

The estimate in [PLAN.md](PLAN.md) ($45, about $0.14 per extraction) came from short sentences. clc-v1 averaged about $0.12 per item over 300 items ($36.44), with long sentences above $0.35 ([HANDOFF.md](../../HANDOFF.md)). Europarl sentences are longer, so the honest range is **$0.15 to $0.30 per item**.

| Stage | Items | Expected spend | Reservation the runner needs (item ceiling × items) |
|---|---|---|---|
| 0 pilot | 32 | $5 to $10 | $16 at a $0.50 ceiling |
| 1 | 288 | $45 to $85 | $144 at a $0.50 ceiling |
| Judge (cross-vendor) | about 20 prompts | to be priced once the vendor is chosen | n/a |

The runner reserves every item's ceiling against the approved total before launch, so the approval must cover the **reservation**, not only the expected spend. Budget is requested for Stage 0 only; Stage 1 is requested after the pilot is published.

## Open items for the owner

1. **Budget for Stage 0:** $16 reservation (expected $5 to $10).
2. **Judge:** which non-Anthropic bilingual model, and how it is reached (API key, or you relay prompts by hand). No credentials are assumed.
3. **Owner spot-check:** 20 pairs of 8-sentence passages to read, about an hour.

## Not claimed

- Nothing here tests Lunum against the 100 / call / phone-the-police paraphrase example directly: the reference is a translation, which holds meaning fixed across languages, not across paraphrases within one.
- A passing level (a) result shows that structure agrees, not that the meaning is the same. Only (b) addresses meaning, and only if the judge validates against the owner.
