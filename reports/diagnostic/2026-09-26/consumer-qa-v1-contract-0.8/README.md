# Consumer memory QA v1 on contract-0.8 extractions, two answering models

> **Correction after [independent evaluation](../../../independent-evaluation/2026-09-26/REPORT.md)** (rows 11–12). The grader used substring matching and accepted "14 times (7 retries …)" as "7". Re-graded with strict grader v2 (`summary-regraded.json` in each run folder; no new model calls), **Haiku natural-lunum-dedup is 20 / 19 / 19, not 20 / 20 / 20.** Every other cell is unchanged. The per-run token savings range over −55/−62/−62% (Sonnet) and −56/−66/−66% (Haiku); run 1 saves less. The "keeps every answer" claim below is false for Haiku.


**Diagnostic development evidence, self-reviewed.** Same [benchmark](../../../../experiments/consumer-memory-qa-v1/README.md) and code as [consumer-qa-v1](../consumer-qa-v1/README.md), at `500fc1a`, with two changes:
- the ledgers come from the [contract-0.8 runs](../contract-0.8/README.md): benchmark run *i* uses extraction repetition *i*;
- there is a second answering model.

Tokens are each model's own provider-reported input tokens. The two tokenizers differ, so compare percentages, not raw counts. 0 failed calls. Cost: $2.22 (Sonnet) + $0.86 (Haiku).

| Memory context | `claude-sonnet-5` tokens (3 runs) | correct | `claude-haiku-4-5` tokens (3 runs) | correct |
|---|---|---|---|---|
| natural-all | 925 / 925 / 927 | 20 / 20 / 20 | 841 / 841 / 845 | 20 / 20 / 20 |
| lunum-0.1 | −61% | **17 / 18 / 18** | −64% | **18 / 17 / 17** |
| lunum-0.2 | −42% | 20 / 20 / 20 | −47% | 20 / 20 / 20 |
| **natural-lunum-dedup** | **−60%** | 20 / 20 / 20 | **−62%** | 20 / 20 / 20 |
| natural-oracle-dedup (reference) | −70% | 20 / 20 / 20 | −73% | 20 / 20 / 20 |

- **Better extraction means fewer tokens.** natural-lunum-dedup was −51% on the frame-0.2 ledgers and is −60% here, with no benchmark change. Contract 0.8 converges more paraphrases, so more duplicates share an identity.
- **Both models reach the same conclusion.** Renderer 0.1 loses answers (the main action of a conditional, required-vs-permitted, an audience, the date). Natural text deduplicated by identity keeps every answer and is the cheapest non-oracle context.
- Unchanged caveats: the corpus is built from paraphrase groups, the questions are self-authored and easy, the whole memory is always in context, and extraction cost is excluded.
