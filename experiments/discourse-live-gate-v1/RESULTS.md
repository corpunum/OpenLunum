# Discourse context on post-enablement traffic v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `47be2663` before the held-out sessions were measured.
- **Run:** 2026-11-11 on the owner's rig. Harness: OpenUnum `scripts/lunum-discourse-measure.mjs` at OpenUnum `origin/main` `3af6e7b5`, unchanged, default settings. No model calls, $0.
- **Data:** read-only export into a private directory; nothing from it is committed. Numbers only: [aggregates.json](aggregates.json).
- **Review:** aggregates only, because the sessions are private. Self-reviewed.

## Data actually used

| | Count |
| --- | --- |
| Sessions selected by the rule (first message after 2026-10-08T05:20Z, over 200,000 stored characters) | 83 |
| Messages in those sessions | 23,469 |
| Sessions that reach the 70% trigger | 78 |
| Compaction points (up to 4 per session) | 292 |
| Points where the off prompt fits the 65,536-token context | 289 |
| Points with at least one fact-recall QA item | 180 |
| Fact-recall QA items | 15,949 |

## Results

| | off (head/tail cut) | on (discourse view) |
| --- | --- | --- |
| Mean prompt tokens, all 292 points | 13,833 | **7,766** (0.561x) |
| Mean prompt tokens, the 289 points where off fits | 10,458 | **6,366** (0.609x) |
| Median per-point ratio (on / off) | – | 0.44 |
| Points where on is larger / equal | – | 56 / 36 |
| Fact-recall QA, pooled, prompt only | 3,243 / 15,949 = **20.3%** | 5,924 / 15,949 = **37.1%** |
| Fact-recall QA, pooled, prompt + session wiki | 28.3% | 44.3% |
| Fact-recall QA, mean per point, prompt only | **62.6%** | **73.5%** |
| Fact-recall QA, mean per point, prompt + wiki | 71.9% | 82.1% |
| Points where QA got worse / better / same | – | 0 / 61 / 119 |
| Literal recall (all literals stated before the point) | 42.4% | 50.6% |
| Points over the context after the view | 3 | 2 |
| Prompt assembly, mean / p95, cold cache | 28 / 95 ms | 178 / 520 ms |
| Units with an `lfp:2.1` identity | – | 0 |

## Against the bar

1. **Tokens: PASS.** 0.561x over all points and 0.609x over the points where off fits; the bar was at most 0.80x.
2. **Recall, pooled: PASS.** 37.1% on against 20.3% off.
3. **Recall, per point: PASS.** 73.5% on against 62.6% off; no point got worse.

The flag stays on. As pre-registered, OpenUnum's live event now carries the head/tail-cut token count (`baselineTokens`), and `scripts/lunum-live-gate.mjs` there reports the live gate from the log.

## What changed against the in-sample result

| | In-sample, 2026-10-08 (15 sessions, 52 points) | Held-out, 2026-11-11 (83 sessions, 292 points) |
| --- | --- | --- |
| Token ratio, all points | 0.30x | 0.56x |
| Token ratio, points where off fits | 0.45x | 0.61x |
| Pooled QA, off to on | 30.2% to 38.5% | 20.3% to 37.1% |
| Points larger with the view | 13 of 52 | 56 of 292 |

The saving is real out of sample but about half the in-sample figure. The in-sample mean was dominated by one point of 388k tokens; the held-out set has three such points among 292.

## Live telemetry (no bar)

From the running server's log, 2026-10-08 to 2026-11-11:

| | |
| --- | --- |
| `context_discourse` events / sessions | 82 / 22 |
| `context_discourse_failed` | 0 |
| `context_hard_limited` | 0 |
| Tokens before the view to after, summed | 8,167,420 to 826,330 |
| Time per event, mean / p95 | 379 / 1,241 ms |
| Unit dispositions | 61,288 duplicate, 32,857 omitted, 4,357 kept, 840 superseded, 805 clipped |
| Semantic identities used | 0 |

The before-to-after figure is not a gate measurement: "before" is the uncut history, not the head/tail cut.

## Finding outside the bar: where the pressure is

The view runs only when the stored chat history is over 70% of the context: 82 times in five weeks. In the same log the main-model prompt cap (32,768 tokens, applied to every request inside a turn, tool output included) acted **1,850 times in nine days** (2026-11-02 to 2026-11-11):

| Cap action | Events | Median tokens before to after re-compaction |
| --- | --- | --- |
| compacted under the cap | 643 | 35,238 to 29,454 |
| rerouted to the hosted fallback | 1,057 | 42,879 to 36,347 |
| sent over the cap (no fallback allowed) | 150 | 44,737 to 43,926 |

How much would have to go, from the same log (1,127 over-cap requests matched to their token budget line): the median request fits if **12.8%** of its message tokens are removed; 59.6% of the requests fit with a 20% reduction and 70.6% with 40%. In 125 requests (11.1%, 21 sessions) the tool schemas alone are over 20,000 tokens, so no message compaction can fit them. This is the size of the gap, not a prediction of what the view closes.

The rerouted requests are a median 11% over the cap after re-compaction, which only summarises messages older than the protected recent window. What remains is recent tool output. This experiment does not measure whether the discourse view would bring those requests under the cap: stored rows do not contain the in-turn prompts. OpenUnum now logs a measure-only shadow on each over-cap request (the token count the view would reach, and whether it fits) so the live log can answer it. Applying the view there needs its own pre-registered experiment, including recall on tool output, where a compacted result has no `session_read` pointer.

This agrees in direction with [tooloutput-codec-v1](../tooloutput-codec-v1/PREREGISTRATION.md) only in part: that estimate (5.7%) was for lossless-in-meaning extra compression of tool output. The discourse view is lossy with a pointer, which is a different trade and is why recall must be measured before it is applied.

## Limits

- Exact-match recall shows that a literal is in front of the model, not that a model answers with it.
- The replay rebuilds prompts from stored rows and does not include tool results inside a running turn.
- The selection rule keeps large sessions only (over 200,000 characters); small sessions never reach the trigger.
- Self-reviewed; only aggregates can be checked by a reader.
