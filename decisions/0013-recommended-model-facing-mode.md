# ADR 0013 — `identity_dedup` is the recommended model-facing context mode

**Status:** Implemented 2026-09-26 under the owner's delegation to act on the evaluation. Self-reviewed.

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
