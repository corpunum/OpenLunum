# Consumer memory QA v1 on contract-0.8 extractions, two answering models

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
