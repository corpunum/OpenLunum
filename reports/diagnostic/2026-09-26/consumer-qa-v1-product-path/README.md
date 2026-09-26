# Consumer benchmark: the product `identity_dedup` path

> **Correction after [independent evaluation](../../../independent-evaluation/2026-09-26/REPORT.md)** (rows 13–14). Re-graded with strict grader v2: **Haiku product-identity-dedup is 20 / 20 / 19, and natural-lunum-dedup is 20 / 19 / 19.** The q14 "14" error is not a single observation. It appeared in 5 of 9 Haiku dedup condition-runs and 0 of 6 Haiku natural-all runs, always where extraction left two paraphrases of one event unmerged. The MCP default was reverted to `natural` (decisions/0013 amendment 1).


**Diagnostic development evidence, self-reviewed.**
- Same [benchmark](../../../../experiments/consumer-memory-qa-v1/README.md) as the two-model run, at `23331fe`, on the contract-0.8 extraction ledgers (run *i* uses repetition *i*).
- The added condition `product-identity-dedup` builds the memory with core `compileContext(…, {mode: 'identity_dedup'})`, the shipped code path.
- 0 failed calls. Cost: $2.64 (Sonnet) + $1.01 (Haiku).

| Memory context | `claude-sonnet-5` tokens | correct | `claude-haiku-4-5` tokens | correct |
|---|---|---|---|---|
| natural-all | 925 / 933 / 925 | 20 / 20 / 20 | 841 / 837 / 841 | 20 / 20 / 20 |
| lunum-0.1 | −61% | 18 / 17 / 18 | −64% | 18 / 17 / 18 |
| lunum-0.2 | −42% | 20 / 20 / 20 | −47% | 20 / 20 / 20 |
| natural-lunum-dedup (harness) | −60% | 20 / 20 / 20 | −62% | 20 / **19** / 20 |
| **product-identity-dedup** | **−60%** | **20 / 20 / 20** | **−62%** | **20 / 20 / 20** |
| natural-oracle-dedup (reference) | −70% | 20 / 20 / 20 | −73% | 20 / 20 / 20 |

- **The shipped mode reproduces the benchmark result** for both models. In run 1 its memory has the same lines as the harness condition. It keeps the first occurrence instead of preferring English, which made no difference here.
- **One Haiku miss (q14, harness condition, run 2).** The context text was byte-identical to the product condition's, so this is answer variance. But the answer was "14" to "How many times does Rhea retry U-31?". The memory still held two unmerged paraphrases of one event ("retries … seven times" and "makes seven further attempts…"), which V8 extraction keeps typing differently. The model appears to have added them together. Unmerged duplicates can mislead a reader, not only cost tokens. This is a single observation, not a rate.
- Unchanged caveats: paraphrase-built corpus, self-authored questions, full memory in context, extraction cost excluded.
