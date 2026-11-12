# cache-aware-compaction-v1: results

**Status: pilot negative (arm T 0.98x net prefill), window not opened.** corpunum-82 decided on 2026-11-12, before the window was due to open at 08:00Z. This is a stop under the pre-registered rule: the expected net prefill saving is under 20%.

- Evidence: [PILOT.md](PILOT.md). On pre-window traffic, arm T as registered reaches 0.982x net prefill (99.0% tool-literal recall). The unregistered `keepVerbatimLast: 0` reaches 0.937x (92.3% recall).
- **Reopen condition:** a re-pilot on traffic after the prefix and slot fix shows arm T at 0.85x or lower. Below that line, 0.80x on the window is not plausible. Once the cache stops missing, there is less prefill left for compression to save, so a reopen is not expected.
- **What the work found instead:** 18% of foreground requests miss the history cache and carry 41% of all prefill. The 38 mid-turn misses all have `cacheN = 0` and no slot restore. They happened while 4–7 sessions shared unum-serve's 2 slots, and OpenUnum's slot save failed 21 times (`llama_restart`, 404).
- That is slot thrashing under concurrency, not a compression problem. It went to s-engine and s-openunum.
- The harness (OpenUnum `scripts/lunum-prefill-measure.mjs`) is now the before-and-after measurement for that fix.
