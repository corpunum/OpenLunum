# anchorAtTail hash50 live A/B: results

Generated 2026-11-20T09:51Z. Window 2026-11-13T00:18:07Z to 2026-11-19T00:18:07Z (the extended window; see Duration). Pre-registration: [AB-SPLIT-PREREGISTRATION.md](AB-SPLIT-PREREGISTRATION.md) with Amendment 1. Full output: `~/.local/share/lunum-prefill/ab-hash50-final-20261120.json`. Aggregates only.
Arm "on" = anchor at tail; arm "off" = anchor in place (today's behaviour). Delta and relative change are on minus off.

## Validity
- Eligible sessions (first row in window with anchorSplit, at least 2 counted requests): on 112, off 111; both at least 30. Unassigned: 0 sessions. Counted requests: on 1338, off 1150 (both at least 300).
- Sample-ratio mismatch (chi-square vs 50/50): chi2 0.0045, p = 0.947. Not invalid (bar p < 0.001).
- Session-kind balance: on mission 90 / uuid 21 / chat 1; off mission 85 / uuid 25 / chat 1. Balanced.
- Request-kind mix: on 140 initial / 1198 tool iteration; off 139 / 1011.
- Only the local Qwen model counted (openai-compatible, qwen3.8-flash-next-uncensored-lean).

## Primary (cluster bootstrap over sessions, 10,000 resamples, seed 20261119)
| | on | off | delta | 95% CI | relative | 95% CI |
|---|---|---|---|---|---|---|
| prefill (promptN) per request | 5528.8 | 4200.8 | +1328.1 | -923.7 to +3861.8 | +31.6% | -17.1% to +111.3% |
| history-miss rate | 13.53% | 12.43% | +1.09 pt | -6.14 to +8.09 pt | +8.8% | -36.0% to +87.8% |
| full-miss rate | 10.91% | 11.57% | -0.65 pt | -7.37 to +5.61 pt | | |

## Verdict against the pre-registered rule
There is no pass bar. The reporting threshold: a change under about 10% in prefill per request is "within noise". The point estimate is +31.6% (on has MORE prefill per request, the opposite of the expected direction), but the CI spans zero, so the difference is not distinguishable from noise at this sample. Neither arm shows a reduction. Verdict: no evidence that anchorAtTail lowers prefill per request or the history-miss rate; the direction is unfavourable but not significant.

## Secondary
- By request kind (on / off): foreground_initial prefill per request 10329 / 10518, history-miss 54.3% / 54.0% (unchanged). foreground_tool_iteration prefill per request 4968 / 3332, history-miss 8.8% / 6.7%, p50 2133 / 1068 ms, p95 34275 / 25784 ms. The whole difference sits in tool iterations.
- By divergence: on has 1132 at_tail requests (3600 tokens per request) and no append_only; off has 996 append_only (3089 per request) and no at_tail. The bucket names differ by arm because of the transform, so they are not comparable one-to-one. at_0_1 (cache lost in the first messages) is 62 requests on vs 15 off, with prefill 27494 vs 16186 per request. This is where the extra prefill in the on arm comes from.
- p50 / p95 prefill ms overall: on 2304 / 32801, off 1299 / 26385. Prefill share: on 21.4%, off 18.0%.
- Per session kind (relative prefill change, 95% CI): mission +18.4% (-20.0 to +68.3%); uuid +27.7% (-36.1 to +156.7%); chat 1 session per arm, not interpretable. History-miss rate: mission 14.5% vs 12.7%; uuid 11.2% vs 11.5%.
- Stratified pre/post 11-14 12:26:49Z (by request time; sessions re-grouped inside each stratum): pre (24 sessions per arm, 361 on / 213 off requests) +46.8% (CI +14.3% to +94.1%, excludes zero, in the unfavourable direction); post (88 / 87 sessions) +36.5% (CI -20.5% to +129.5%). The pre stratum is small and rests on few sessions; exploratory only.
- By day, requests on/off: 11-13 189/186, 11-14 236/34, 11-15 286/476, 11-16 160/188, 11-17 220/164, 11-18 245/102. Daily arm volumes are uneven, a reason to read the pooled ratio with the wide CI.

## Duration
Both arms had at least 30 eligible sessions in the first 72 h (the 11-13 to 11-16 window was not tested separately); the window analysed is the extended 6-day one as instructed by the requester.

## Deviations and notes
1. Exclusions: the restart windows in HANDOVER item 2 (OpenUnum restarts, engine W1 and W2 as written) plus the unum-serve windows supplied by the requester, each end plus 10 minutes. The supplied list contains 49 windows, not the 62 cycles the request mentions; I used the 49 as listed. The sample-ratio and counts above include all 49.
2. Logs: the OpenUnum log is rotated (openunum.log.1 to 11-17 10:10:18Z, then openunum.log). They were concatenated; first-row eligibility is judged over both.
3. The bootstrap, the at-least-2-requests session filter and the per-kind and strata tables come from an analysis script (scratchpad, importing the harness's parseRequests, baselineBreakdown, staticPrefixes) because the harness has no bootstrap. The harness's own --base-only per arm gives 1341 on / 1156 off requests, because it does not apply the 2-request session minimum; the analysis uses the 2-request rule from the pre-registration. Static prefix is computed pooled over both arms.
4. Strata are cut by request time, not session start.
5. Not checked: restarts after 11-14 12:26:49Z that were not listed in HANDOVER or by the requester, and the prompt-path diffs of the listed OpenUnum restarts.
