# WORKSHEET-v2 fill by models (owner-delegated): pre-registration

**Committed 2026-10-17 before any judge call. Self-reviewed.**

**Owner decision (2026-10-17, about 10:00 local, relayed by the orchestrating session corpunum-6b):** the owner delegates [WORKSHEET-v2](../WORKSHEET-v2.md): "you fill it or ask SuperGemma on the ROG Ally". The result is **level (b), model consensus**. It is labelled as such everywhere and is **not owner gold**.

## Items ([`items.json`](items.json), by `fill.mjs items`, deterministic)

- **156 pairs**: exactly the rows of WORKSHEET-v2 (attested EN/EL pairs, at most 12 per seed).
- **20 seed checks**: each seed's English with its AI-drafted Greek.
- **40 controls**: each seed's English with the seed Greek of two other seeds, chosen by hash. They mean something different, so the expected label is D.
- Seeded order, mixed across seeds and kinds; judges see no counts, no proposer, no corpus.

## Judges

| Pass | Judge | Vendor |
|---|---|---|
| A | `supergemma4-Q5_K_M` (ROG Ally router, temperature 0) | Google lineage |
| B | `gpt-6.1-sol`, effort medium (`codex exec`, tools off) | OpenAI |
| C, disagreements only | `gpt-6-luna`, effort medium | OpenAI |

Batches of 10 pairs, the same prompt for every judge ([`fill.mjs`](fill.mjs)). Labels: S same, B broader/narrower, I implies or local equivalent, D different, X not natural Greek. An unparseable batch leaves its labels empty (counted as unresolved, not retried).

## Gold rule ([`score.mjs`](score.mjs))

- A and B agree → that label.
- Otherwise C breaks the tie if it matches A or B; else **unresolved**, listed for the owner.
- **Judge validity:** a judge whose false-"S" rate on the 40 controls exceeds **10%** is marked invalid. If either A or B is invalid, the gold is reported but marked unreliable.
- Reported: A–B agreement and Cohen's kappa, false-"S" on controls per judge, gold distribution, and agreement on pairs SuperGemma itself proposed (it proposed many of them, so it may favour them).

## Prediction

Agreement around 0.6 to 0.7 (five labels, S versus B is subjective). Sol passes the controls; SuperGemma is the more likely to fail them. Most attested pairs will be S or B; the X label will catch a few forms.

## Use

The consensus gold feeds a later pre-registered phrase round-trip test and the Greek lexicon of the renderer, always labelled level (b), model consensus. Unresolved items wait for the owner.

## Amendment 1 (2026-10-17, before any SuperGemma label was produced): token budget

The first SuperGemma pass returned **no labels**: the Ally router serves SuperGemma with reasoning on, and `max_tokens: 600` was spent entirely on hidden reasoning (`finish_reason: length`, empty content) for every batch. That pass was stopped after 3 batches; it produced nothing to see or compare.

- `max_tokens` for SuperGemma is now 6000. One diagnostic call on batch 0 confirmed it then answers in the required format (its labels were seen by the author; the full pass recomputes batch 0 at temperature 0 and its result is the one used).
- The full SuperGemma pass is rerun from the start. Nothing else changes. The Sol pass was not affected (Codex has its own budget).

## Amendment 2 (2026-10-17, before any third-pass call): Qwen replaces Luna as judge C

The ChatGPT quota is exhausted and the owner re-routed OpenAI work (relayed by corpunum-6b). Judge C, for the 43 A/B disagreements only, is now **Qwen 3.8 Flash** (Alibaba; local Halogen; temperature 0; one request at a time; `max_tokens` 2000). The gold rule is unchanged: C breaks a tie only when it matches A or B. Qwen proposed some of the pairs (as SuperGemma did), so agreement on Qwen-proposed pairs is reported too. Run outside the live operator's busy minutes (:00–:10 and :30–:40 UTC), as the rig coordinator asked.

Scores so far (A = SuperGemma, B = Sol, seen before this amendment): A–B agreement 0.801, kappa 0.634; false "same" on controls 0 for both; gold 116 S, 14 B, 3 D, 43 unresolved.
