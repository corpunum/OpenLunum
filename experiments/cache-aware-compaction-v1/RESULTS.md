# cache-aware-compaction-v1: results

**Status: pilot negative (arm T 0.98x net prefill), window not opened.** corpunum-82 decided on 2026-11-12, before the window was due to open at 08:00Z. This is a stop under the pre-registered rule: the expected net prefill saving is under 20%.

- Evidence: [PILOT.md](PILOT.md). On pre-window traffic, arm T as registered reaches 0.982x net prefill (99.0% tool-literal recall). The unregistered `keepVerbatimLast: 0` reaches 0.937x (92.3% recall).
- **Reopen condition:** a re-pilot on traffic after the prefix and slot fix shows arm T at 0.85x or lower. Below that line, 0.80x on the window is not plausible. Once the cache stops missing, there is less prefill left for compression to save, so a reopen is not expected.
- **What the work found instead:** 18% of foreground requests miss the history cache and carry 41% of all prefill. The 38 mid-turn misses all have `cacheN = 0` and no slot restore. They happened while 4–7 sessions shared unum-serve's 2 slots, and OpenUnum's slot save failed 21 times (`llama_restart`, 404).
- That is slot thrashing under concurrency, not a compression problem. It went to s-engine and s-openunum.
- The harness (OpenUnum `scripts/lunum-prefill-measure.mjs`) is now the before-and-after measurement for that fix.

## Review notes (2026-11-12): what the harness does not implement from the pre-registration

The window was not opened, so none of this affected a verdict. It matters if the experiment is ever reopened.

- **Token scaling is missing.** The pre-registration scales each reduction by the request's `promptTokens / estimate(base prompt)` and reports that factor. The harness does not rebuild the base prompt, so it applies no scaling and reports no estimator-vs-log check.
- **The pilot used the chars/4 estimator**, not the server tokenizer. The pilot's 0.98x is that estimate.
- **Arm C is narrower than registered.** It rewrites history only at turn-start misses; mid-turn misses get arm T only. In the pilot, 38 of 63 misses were mid-turn, so arm C was barely exercised (one rewrite).
- **The miss rule is fitted to the data.** The static prefix is the most frequent small `cacheN` in the window (3072 in the pilot), chosen after the first rule misclassified 127 requests.
- **The A/B use of the harness is observational.** Two days are compared at the same clock hours; requests are not randomised, so a difference in load or task mix between the days shows up as an effect. Reports must state both days' request counts and kind mix.
