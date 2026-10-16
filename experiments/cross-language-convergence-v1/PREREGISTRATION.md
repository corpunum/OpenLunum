# Cross-language convergence v1: pre-registration

**Committed 2026-10-16, before any model has seen these sentences.** Written by a Claude Code session and self-reviewed. This is the first held-out test under [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md).

## Question

Under the frozen contract (`lunum-agent/0.19`, package v22, `lfp:2.1`), three things are measured:
1. Do sentences with the same meaning, written by humans in English and Greek, receive the **same identity**?
2. Do two independent Greek translations of one sentence receive the same identity?
3. Does the same sentence, extracted twice, receive the same identity? The only earlier measurement is 7 of 12 ([v17 report](../../reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md)).

## Data

None of it was written by the model under test. [`select.mjs`](select.mjs) makes the selection deterministic (seed `clc-v1-2026-10-16`).

| Set | Content | Sentences |
|---|---|---|
| **S1** | The 40 EN/EL pairs of the [owner worksheet](../owner-greek-review-v1/INTAKE.md), Part C: existing human translations (EU Charter, GDPR notice, Wikivoyage, Tatoeba, WordReference), checked by the native-speaker owner. 8 are marked non-literal. | 80 |
| **S2** | 40 Tatoeba EN/EL pairs: English sentences of 4–20 words with exactly one Greek translation, seeded order | 80 |
| **S3** | 15 Tatoeba English sentences with two or more Greek translations: the first two Greek translations of each (Greek–Greek paraphrase) | 30 |
| **R2** | S1 run a second time, for stability | 80 |

`pairs.jsonl` records the grouping and is **never given to the extractor**. The request files contain source text only.

## Procedure

- **Runner:** `scripts/research/run-claude-code-source-only.mjs`.
  - Package v22, profile iteration6, the exact resolved model `claude-sonnet-5`.
  - One fresh process per sentence, serial, with Lunum MCP tools only.
- **Order:** S1, then S2, then S3, then R2. Each set gets its own output directory under `reports/independent-evaluation/2026-10-16-clc-v1/`.
- **Checkout:** clean and frozen. Preflight passed with 0 provider calls on 2026-10-16.
- **Scoring is offline:** identities are compared with each other. There are no target Sem and no gold.

## Measures

Definitions:
- **Covered:** a sentence with a core-issued `lfp:2.1` identity in the run ledger.
- **Both-covered pair:** a pair in which both sentences are covered.

| Measure | Definition |
|---|---|
| Coverage | Covered sentences ÷ all sentences, per set and per language |
| **Convergence** (S1, S2; S3 separately) | Equal identities ÷ both-covered pairs |
| **False merges** | Pairs from *different* items with equal identity. Any false merge is reported individually. |
| **Stability** (S1 against R2) | Equal identities ÷ sentences covered in both runs |
| Abstention agreement | Pairs where both sentences abstain. Reported, but **not** counted as convergence. |

## Bars, fixed now

**Evaluable:** a convergence measure is evaluable only with **at least 10 both-covered pairs** (S1 and S2 pooled, or S3 alone).

| Result | Reading |
|---|---|
| Convergence ≥ 70% | Supports cross-language identity for the covered kind of sentence. The claim is limited to that coverage. |
| 40% ≤ convergence < 70% | Inconclusive |
| Convergence < 40% | **Kill:** EN/EL identity convergence is not claimed anywhere, and the AGENTS.md principle is qualified (ADR 0026) |
| Not evaluable (< 10 both-covered pairs) | The identity layer does not reach this kind of text. It is recorded as a coverage result, and no convergence claim is made. |
| Stability ≥ 90% | The 7/12 result is not reproduced |
| Stability < 75% | **Confirms the instability.** Proposing a projection without `kind` and source-undetermined labels becomes justified (ADR 0025 path) |
| Any false merge | Reported as a correctness failure, whatever the other results |

## Prediction, recorded before the run

Coverage will be low, and lower in Greek:
- The 46 frames are mostly operational verbs.
- The seven general frames (ADR 0024) are **English only, and Greek fails closed**.

So everyday and rights-charter sentences can get an English general-frame identity, but no Greek one. **The expected result for S1 and S2 is "not evaluable: coverage"**, with few both-covered pairs, mostly the commands («Στρίψτε αριστερά», «Άκου»). S3 (Greek–Greek) is expected to be not evaluable too. If the prediction holds, it is itself the finding: under the frozen contract the identity layer does not reach ordinary bilingual text.

## Cost and approval

Per the runner documentation, a live run needs an owner-approved total budget.
- Earlier runs averaged **$0.14 per sentence** (v17: $4.08 for 30).
- Estimated actual cost:

  | Set | Estimate |
  |---|---|
  | S1 | about $11 |
  | S2 | about $11 |
  | S3 | about $4 |
  | R2 | about $11 |
  | **Total** | **about $38** |

- Requested per-item ceiling: $0.35. The reservation is therefore $28 for S1 and $95 for all four sets. The reservation is not the expected spend.

**Status: waiting for the owner's budget approval. No provider call has been made.**

## Limits

- **Single tester:** one model and one client.
- **Contamination:** Tatoeba and the EU Charter are public and likely in training data.
- **Domain:** the sentences are mostly short and everyday, not the owner's operational traffic.
- **S1 curation:** the S1 pairs were AI-selected from existing sources and checked by the owner. They were not written by the owner.
