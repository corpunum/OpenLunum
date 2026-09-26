# Consumer memory QA v1

The standalone-consumer benchmark named in `STATUS.md`. A downstream model answers 20 short questions using a memory block built from the 24 V8 source sentences. The question is whether a Lunum memory costs fewer tokens than natural text **without losing answers**.

- `questions.jsonl` (frozen before any run): questions with accepted and rejected answer tokens. They are self-authored, and their gold answers were written against the natural sentences. Some deliberately target facts that renderer 0.1 drops (the main action of a conditional, the date).
- Conditions (`scripts/research/consumer-memory-qa.mjs`):
  - `natural-all`: all 24 sentences verbatim.
  - `lunum-0.1` / `lunum-0.2`: a real extraction ledger. Each item that core gives an identity is rendered, and duplicates are removed by fingerprint. Everything else falls back to its natural source sentence. A short legend explaining Lunum-Code is included and counted.
  - `natural-oracle-dedup`: **reference only**. One natural sentence per gold meaning group. It uses gold labels, which no real consumer has.
- Tokens: provider-reported input tokens of the answering model (the named tokenizer): the memory call minus an empty-memory call with the same wrapper.
- Scoring: an answer is correct if it contains an accepted token and no rejected token.

Diagnostic development evidence, self-reviewed. One answering model and one small corpus. It says nothing about retrieval at scale or about other models.
