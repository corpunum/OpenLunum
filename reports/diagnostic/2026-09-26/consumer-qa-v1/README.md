# Consumer memory QA v1: three runs

> **Grader note:** these runs were re-graded with strict grader v2 (`summary-regraded.json`); no verdict changed.


**Diagnostic development evidence, self-reviewed.** [Benchmark design](../../../../experiments/consumer-memory-qa-v1/README.md).
- Answering model: `claude-sonnet-5`. Tokens are its provider-reported input tokens for the memory block.
- Each run pairs frame-0.2 extraction repetition *i* with one answering pass over 20 questions. `aggregate.json` has the totals. Cost: $2.27, 0 failed calls.
- `rep1-initial` is the first run, before the `natural-lunum-dedup` condition existed. It is kept and not aggregated.

| Memory context | Tokens (3 runs) | vs natural | Correct (of 20) |
|---|---|---|---|
| natural-all: 24 sentences verbatim | 925 / 929 / 929 | — | 20 / 20 / 20 |
| lunum-0.1: default renderer | 386 / 345 / 371 | −60% | **18 / 16 / 16** |
| lunum-0.2: lossless renderer | 604 / 616 / 632 | −33% | 20 / 20 / 20 |
| **natural-lunum-dedup**: one source sentence per Lunum fingerprint | 453 / 455 / 453 | **−51%** | 20 / 20 / 20 |
| natural-oracle-dedup: gold groups (reference only) | 279 / 279 / 281 | −70% | 20 / 20 / 20 |

## What this shows

- **The default renderer's saving is partly deleted information.** lunum-0.1 missed the main action of a conditional (q01, q07), the date (q15), required-vs-permitted (q04) and an audience (q12).
- **All of Lunum's saving here comes from identity-based deduplication, not compact spelling.** Per fact, Lunum-Code 0.2 costs more tokens than the English sentence. The cheapest context that uses no gold labels and keeps every answer is **natural text deduplicated by Lunum fingerprints**.
- The gap to the oracle (454 vs 280 tokens) is paraphrases that extraction did not converge, plus sentences kept verbatim because they have no identity.

## What it does not show

- **The corpus is built from paraphrase groups** (24 sentences, 10 meanings), so the deduplication saving is far larger than in a real memory store, where the duplication rate is unknown.
- The questions and gold answers are self-authored, and the task is easy: the natural baseline scores 20/20.
- There is one answering model and one tiny corpus, and no retrieval: the whole memory is always in context.
- Extraction cost is not included. The frame-0.2 extraction runs cost about $6 each for 64 sentences, far more than the tokens saved per query here. The trade-off only pays when stored memory is queried many times.
