# cache-aware-compaction-v1: pre-window pilot (disclosed)

**Run 2026-11-12, about 05:40Z, before the held-out window opens (08:00Z).** The data is pre-window traffic only, 2026-11-11T18:00Z to 2026-11-12T05:00Z, which comes after the prompt-cap change. The pilot does not count toward the bar. It is disclosed because it was seen before the window opened.

**Harness:** OpenUnum `scripts/lunum-prefill-measure.mjs` at OpenUnum commit `f56929cd` (worktree, under review by s-openunum). Tokens come from the chars/4 estimator (`--tokenize none`). Aggregates only.

## Harness fix found by the pilot

The first static-prefix rule, the 10th percentile of positive `cacheN`, classified 190 of 352 requests as history misses. A direct count from the log gives 63. Where misses are rare, the 10th percentile lands on hit values.

The rule became: **the most frequent positive `cacheN` below 8,192**, which is the length llama.cpp reuses when only the system and tool-schema prefix match. Here that value is 3072. This fixes an operational definition the pre-registration left open. The bar does not change.

## Numbers (352 requests: 62 initial, 290 tool iterations; 514 tool runs)

| Arm T configuration | Tool results compacted | Net prefill | Prefill time | Tool-literal recall (1,601 items) | View cost |
|---|---|---|---|---|---|
| as pre-registered (shipped defaults) | 21 | **0.982x** | 0.976x | 99.0% | 4.5 ms per compacted result vs 3.8 s of prefill saved |
| `keepVerbatimLast: 0` (not registered) | 191 | 0.937x | 0.928x | 92.3% | 1.5 ms vs 1.9 s |

Arm C rewrote one history and is within 0.3 points of T.

Both configurations fail bar 1 by a wide margin. The unregistered one also fails bar 3.

With shipped defaults, a single tool message counts as "recent" (`keepVerbatimLast: 4`), so only results over `recentMaxChars` (8,000 chars) are compacted.

## Where the prefill actually is

- 63 of 352 requests (18%) are history misses: 51 with `cacheN = 0` (the slot reused nothing), 11 at the static prefix (3072) and 1 other.
- Those 63 requests carry **41% of all prefilled tokens**: 1.38M of 3.37M, and 3,363 s of 8,356 s of prefill time.
- 38 of the misses are tool iterations in the middle of a turn, not turn starts.

This is a prefix-stability or slot-eviction problem, not a compression problem. It went to s-engine and s-openunum through corpunum-82. The pre-registration's restart clause applies once a fix lands: the window restarts and the base is re-measured on post-fix traffic.

## What this pilot does not change

- The pre-registered arms and bar.
- The held-out window: it opens at 08:00Z unless the orchestrator holds it.
- The stop rule. A held-out result like this pilot ends the line of work.
