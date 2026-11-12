# anchorAtTail live split A/B (pre-registration)

**Pre-registered 2026-11-13, before the split is deployed. Times are UTC.**
Pre-registered at commit: <to fill>

## Status

- Supersedes the live-day D1-D3 chain in [AB-PREREGISTRATION.md](AB-PREREGISTRATION.md) (Windows, Rules), which the owner cancelled on 2026-11-13 (01:4x EET), for `anchorAtTail` only.
- `UNUM_SCHED` is out of scope here (s-engine's replay).
- The replay is a fallback only. It is used if the split is unworkable, defined as: the logs lack `anchorArm`, or the sample-ratio-mismatch check below fails.
- Like the old chain, this is a measurement against a stated reading rule, read against the ceilings in [AB-EXPECTATIONS.md](AB-EXPECTATIONS.md).

## Arms and assignment

- Both arms run at once on real traffic. Config: `runtime.localPromptCache.anchorAtTailSplit`, values `"off"` | `"hash50"`. When `"off"` or absent, the existing `anchorAtTail` behaviour is unchanged. `"hash50"` overrides `anchorAtTail`.
- Arm = `"on"` if `(sha256("anchorAtTail-split-v1:" + sessionId)[0] & 1) == 1`, else `"off"`. The arm is constant for a session's lifetime.
- A request with no `sessionId` gets `anchorArm = "unassigned"`, behaves as off, is excluded from the primary analysis and is reported.
- Every `inference_complete` row carries `anchorArm` (`"on"` | `"off"` | `"unassigned"`) and `anchorSplit` (`"hash50"`). The analysis keys only on the logged `anchorArm`, never on a recomputed hash.

## Measures (exact definitions from the harness, `scripts/lunum-prefill-measure.mjs` header, and AB-PREREGISTRATION Rules)

- Prefill per request = `promptN` (llama.cpp `timings.prompt_n`); `cacheN` is the cached count. Counted requests: local foreground requests with finite `cacheN` (the harness's "local" definition).
- History miss: `cacheN <= static prefix + 256` (`MISS_SLACK_TOKENS`); static prefix as defined in the harness header. Full miss: `cacheN = 0` (AB-EXPECTATIONS, Turn starts).
- p50 and p95 prefill ms; splits by kind (`foreground_initial`, `foreground_tool_iteration`) and by divergence bucket (`at_tail` vs `mid_prompt`), as in AB-PREREGISTRATION Rules, "Reported for each pair".
- Harness: the same version for the whole window, with `--base-only --provider openai-compatible` per arm; arm separation is by `anchorArm`, so the harness needs an arm filter. That is a filter only; no measure changes.

## Analysis

- **Unit: the session** (cluster). Eligible = sessions with at least 2 counted requests.
- **Primary:** per arm, ratio of sums (total `promptN` / total requests) over eligible sessions, and the history-miss rate. Arms are compared by cluster bootstrap over sessions: 10,000 resamples, 95% CI of the difference and of the relative change.
- **Secondary:** full-miss rate, p50/p95 prefill ms, splits by kind and by divergence bucket, prefill share.
- **Expected direction (not a bar), carried over:** tool iterations move from `mid_prompt` to `at_tail`, with lower prefill per request. The pre-window already shows 98% of tool iterations append-only without the flag, so the room may be small (AB-EXPECTATIONS, last section). That would be a result.

## Decision rule

The old pre-registration has no pass bar: "It is a before/after measurement with no pass bar" (AB-PREREGISTRATION line 3) and "The A/B reports have no pass rule; they report B against A" (AB-EXPECTATIONS line 5). Its only thresholds are the reporting ones, carried over:

- "a change under about 10% in prefill per request is reported as within day-to-day variation" (Rules, Expected direction). **Adaptation:** the split removes day-to-day load, so the wording becomes "within noise", with the same 10%, and the bootstrap CI is reported next to it. No new threshold is added.
- "at least 300 counted requests per window ... below the minimum and indicative only" (Rules, Volume). **Adaptation:** applied per arm, in addition to the session minimum below.

## Duration (fixed, no peeking)

- Starts at the first `inference_complete` row with `anchorSplit` after the deploy, runs 72h.
- Minimum 30 eligible sessions per arm. If unmet at 72h, extend once by 72h, then stop regardless (this replaces "Windows are not extended"; the freeze no longer applies).
- Interim looks are limited to the validity checks below, never the outcome.

## Validity checks

- Sample-ratio mismatch on eligible sessions: chi-square against 50/50; p < 0.001 means the split is invalid (replay fallback).
- Request-kind mix per arm is reported.
- Only the Qwen model (`unum-serve`) rows are counted; anything else is reported and excluded (Rules, Counted requests).
- Deploys and restarts during the window are listed. They hit both arms. The old rule that excludes restart to restart + 10 min is kept, applied to both arms for the same clock span.

## Known limitation

Both arms share the 2 engine slots, so cross-arm eviction interference exists. The effect is measured under that shared contention, which is also the deploy condition. It is not the effect of the arm in isolation.

## Report

Aggregates only (counts, token sums, ratios, timings, CIs), to s-openunum, s-engine and corpunum-82. No session ids, no prompt text.
