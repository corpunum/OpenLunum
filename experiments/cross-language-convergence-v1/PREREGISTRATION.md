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

## Amendment 1 (2026-10-16, before any provider call)

The owner approved the full budget, all four sets.

The first pilot launch was refused by the runner with `request_contract_mismatch`, before any provider call. The request rows lacked the `contractHash` binding that the runner requires. `select.mjs` now adds the v22 `coreContractHash` to every request row. Unchanged:
- the sentences;
- the handles;
- `pairs.jsonl`;
- the order;
- the bars.

## Amendment 2 (2026-10-16, after two invalid one-item pilots, before any counted item)

**Both one-item pilots on v22 were invalid** (`CONTRACT_UNBOUND`). They are kept in `reports/independent-evaluation/2026-10-16-clc-v1/pilot` and `pilot2`, cost $0.18 and $0.05.

**Cause:**
- `lunum_get_extraction_contract` returned 60.3 KB of indented JSON.
- Claude Code 2.1.301 persists MCP results above about 50 KB to a file and shows the model a 2 KB preview.
- The runner disables file tools, so **the extractor never saw contract 0.19**. Both pilots abstained on the preview.
- `MAX_MCP_OUTPUT_TOKENS=100000` (pilot2) does not change this; the limit is a separate byte threshold.

**Fix:** package **v23** ([freeze script](../../scripts/research/freeze-instruction-package.mjs)).
- It binds the same contract 0.19, with the same hash.
- Only `tools.js` changes: the tool now returns compact JSON of 35.8 KB.
- A regression test fails if the contract response reaches 45 KB.

The run uses v23. Unchanged:
- the sentences, the bars and the order;
- the contract, the frames and the identities.

**Consequence beyond this test:** no live run has ever exercised contract 0.19 in Claude Code. ADR 0024's general frames were never delivered to a Claude Code extractor before v23.

## Amendment 3 (2026-10-16): the runner offered tools its gate forbids

**What happened:**
- The first full S1 run (`…/clc-v1/s1`, $0.60) stopped after 4 items.
- On item 4, the Greek C2 sentence, the model called `lunum_classify`. The client denied it under `dontAsk`, so no information was gained.
- The session-integrity gate rejects any tool outside contract/build/submit/validate, so the run halted. That is correct fail-closed behaviour.
- The S2 run that followed was stopped by hand after 1 item (`…/clc-v1/s2`).

**Cause:** the runner *approved* only the four tools but still *showed* the other eight Lunum tools to the model.

**Fix:** the runner now lists the served tools at preflight and passes every tool outside the four to `--disallowedTools`, recording them in `preflight.json`. This makes the isolation match what the runner already claimed ("only contract/build/submit/validate").

**Unchanged:**
- the package (v23);
- the contract;
- the sentences;
- the bars.

The stopped runs are kept as evidence and are not scored. The scored runs are `s1v`, `s2v`, `s3v` and `r2v`.
