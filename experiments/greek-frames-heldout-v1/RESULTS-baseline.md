# Greek frames held-out test (ADR 0029): baseline results

**Run 2026-10-17. Self-reviewed.** This is the baseline under the frozen contract; the bars apply to the change run (package v26), which does not exist yet. Pre-registration: [PREREGISTRATION.md](PREREGISTRATION.md), with amendments 1 to 3.

## Run

- `claude-sonnet-5-5`, local CLI subscription login, package **v25** (contract `lunum-agent/0.19`, hash `b6fdda4c…`), commit `9fae0a7a`, 100 items (50 EN/EL pairs), concurrency 1.
- The runner marked the run invalid: one Greek item (`gfh1-e405226cf45a0d79`, pair T6) abstained without fetching the contract (`CONTRACT_UNBOUND`). Under amendment 3 that item was re-run once at `c381be98`; the re-run is valid (an abstain).
- Notional cost: $9.69 + $0.20 (Max plan, no API charge).
- Summaries (no source text, since Europarl text stays outside the repository): [`reports/independent-evaluation/2026-10-17-gfh1-baseline/`](../../reports/independent-evaluation/2026-10-17-gfh1-baseline/). Score: [`baseline-score.json`](baseline-score.json).

## Result

| | English | Greek |
|---|---|---|
| Parses | 14 | 0 |
| Sentence copies | 5 | 0 |
| **Covered** | **9 / 50** | **0 / 50** |
| Abstains | 36 (26 declared "unsupported") | 50 (43 declared "unsupported") |

- Bars 2, 3 and 5 have nothing to measure on the baseline: no Greek sentence is covered.
- The pro-drop pairs (T1–T10): 0 Greek covered.

## Against the predictions

- **Greek near 0: confirmed** (0/50). Greek general frames are refused by the contract (`language_unsupported`), whatever the model.
- **English about two-thirds: wrong.** 9/50 English sentences were covered (18%), against Sol's 11/16 in parallel-document-v1 Stage 0. Sonnet abstains far more often under the frozen contract, mostly declaring the sentence unsupported. This makes bar 1 of the change run ("Greek coverage at least half of English coverage, and at least 15 Greek sentences") hard to reach with this extractor: if English stays near 9, Greek needs 15 covered, more than English itself.

## What this means

The baseline confirms the problem ADR 0029 addresses (Greek is refused). It also shows that **coverage, not identity, is now the main limit** of the frozen contract with Sonnet: 18% here, 22% on the ADR 0027 v2 gate (26/120), 25% on R4 (49/200). The pre-registered bars are not changed by this.
