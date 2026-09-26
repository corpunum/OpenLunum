# ADR 0012 — `identity_dedup` context mode

**Status:** Implemented 2026-09-26. Self-reviewed. It is an additional mode; the default mode (`mixed`) and renderer (`generic-en-pivot/0.1`) are unchanged.

## Context

The consumer benchmark ([consumer-qa-v1](../reports/diagnostic/2026-09-26/consumer-qa-v1/README.md)) compared model-facing memory contexts across three runs with `claude-sonnet-5`:
- Lunum-Code 0.1 lost 2–4 of 20 answers.
- Lunum-Code 0.2 kept all answers at −33% tokens.
- Natural text deduplicated by Lunum identity kept all answers at −51%.

All of the saving came from identity-based deduplication; per fact, Lunum-Code costs more tokens than the source sentence. `compileContext` could not produce that best context: it only chooses between natural text and Lunum-Code per message.

## Decision

Add the mode `identity_dedup` to `compileContext`, and to the MCP `lunum_compile_context` tool and the CLI:
- Every message is served as its natural text.
- A message is dropped only when an earlier message carries the same **core-issued** `lfp:2.1` identity (`record.semanticFingerprint`).
- Messages without a semantic identity (abstentions, invalid candidates, legacy `lfp:0.1`) are never merged, even when their text is identical.
- The first occurrence is kept. The mode does not reorder, prefer a language, or rewrite text.

## Limits

- Deduplication is only as good as extraction convergence. Paraphrases that extraction does not converge stay duplicated.
- An identity match drops a message's wording, register and language; the kept message stands in for all of them. When exact wording matters (quotes, legal text), use `natural`.
- The measured saving comes from a paraphrase-built corpus. Real duplication rates are unknown, so there is no general saving claim.
