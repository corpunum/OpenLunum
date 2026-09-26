# ADR 0013 — `identity_dedup` is the recommended model-facing context mode

**Status:** Implemented 2026-09-26; **corrected the same day by amendment 1** after independent evaluation. The MCP default is now `natural`.

## Decision

- The MCP server's default `contextMode` is now `identity_dedup` (was `mixed`). The shipped `.mcp.json` and the integration guides set `LUNUM_CONTEXT_MODE=identity_dedup`.
- Core `compileContext` keeps its library default (`mixed`) so existing API callers are not silently changed. The recommendation is recorded here, in the integration docs, and in `STATUS.md`.
- `lunum` and `mixed` remain available, but are not recommended as model-facing contexts while the default renderer is `generic-en-pivot/0.1`.

## Evidence

In the consumer memory benchmark (self-reviewed, paraphrase-built corpus, 20 questions, three runs per model):
- natural text deduplicated by identity kept 20/20 answers at −60% (`claude-sonnet-5`) and −62% (`claude-haiku-4-5`) tokens;
- `mixed`/`lunum` contexts built from renderer 0.1 lost 2–3 answers per run with both models.

The product code path (`compileContext` in `identity_dedup` mode) is itself measured as the benchmark condition `product-identity-dedup` (`reports/diagnostic/2026-09-26/consumer-qa-v1-product-path`).

## Limits

- The token saving depends on how often a memory repeats itself. It has not been measured on real product memory.
- `identity_dedup` never compresses a single fact. With no duplicates it costs the same as `natural`.

## Amendment 1: correction after independent evaluation (MCP default → `natural`)

The [independent evaluation](../reports/independent-evaluation/2026-09-26/REPORT.md), audit rows 12–16, found that the benchmark grader matched by substring. It accepted "14 times (7 retries …, plus 7 further attempts …)" as the answer "7". Re-grading every recorded answer with the strict grader v2 (`scripts/research/qa-grader.mjs`, no new model calls) gives:

| `claude-haiku-4-5`, correct of 20 | natural-all | identity-dedup (harness) | identity-dedup (product path) |
|---|---|---|---|
| contract-0.8 runs | 20 / 20 / 20 | 20 / 19 / 19 | — |
| product-path runs | 20 / 20 / 20 | 20 / 19 / 19 | 20 / 20 / 19 |

`claude-sonnet-5` is unchanged at 20/20 in every run.

The wrong answers are **correlated** with, but not explained by, one pattern. Where extraction did not merge two paraphrases of one event ("retries U-31 exactly seven times" and "makes seven further attempts on U-31"), Haiku sometimes added them up and answered 14. That happened in 5 of 9 Haiku dedup runs and in 0 of 6 Haiku natural-all runs. The natural-all context contains the **same two unmerged English lines, plus a Greek third**, and never produced the error, so unmerged duplicates alone do not explain it (round-2 evaluation). The mechanism is a hypothesis. **The claim above that identity_dedup "kept 20/20 answers" was false for Haiku.**

Decision:
- The MCP default, `.mcp.json` and the integration guides use **`natural`**, the only mode with no observed answer loss for either model.
- `identity_dedup` stays available as an opt-in, for callers who accept that risk for about 60% fewer tokens on duplicated memory.
- Revisit only with evidence that includes a model sensitive to unmerged duplicates and memory with a realistic duplication rate.
