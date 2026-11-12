# Cache-aware compaction on live OpenUnum traffic v1: pre-registered bar

**Committed 2026-11-12, before the held-out window opens, before any arm is computed and before the harness exists. Self-reviewed.** The bar and the method are fixed here. A method change after this commit is a deviation, recorded in RESULTS.md, and the bar does not move.

Approved by corpunum-82 on 2026-11-12 as a **shadow-only** experiment, under the owner's 2026-10-08 directive: Lunum for real OpenUnum traffic, ≥ 20% fewer tokens, recall ≥ base. Nothing in OpenUnum's live path changes because of this experiment.

## Why this experiment, and why this metric

- The chat-history view ([discourse-live-gate-v1](../discourse-live-gate-v1/RESULTS.md)) passed at 0.56x prompt tokens. But it fires only at compaction points: 82 times in five weeks, and 0 times since OpenUnum's slot grew to 65,536 tokens on 2026-11-11.
- The per-request prompt cap went from 32,768 to 48,742 tokens at 2026-11-11T17:21Z. Over-cap events stopped: there were 116–279 a day before and none after. The prompt-cap shadow was retired, and `discourse-prompt-cap-v1` is not run.
- What remains is the cost of every turn. unum-serve (llama.cpp) keeps a prefix cache per slot. The cost of a request is the tokens it must **prefill**: the part of the prompt after the longest prefix already in the slot. It is not the raw prompt size.
- A compaction that rewrites earlier context breaks that prefix. It can lower raw tokens while raising prefill. So the metric here is **net prefilled tokens and prefill time under the actual cache**, not raw prompt tokens.

**Seen before this commit (aggregates only, disclosed):** OpenUnum's `inference_complete` log, from 2026-11-09 to 2026-11-12T05:30Z, local successful requests.
- Overall: 2,518 requests; 40.7M tokens taken from cache and 16.4M prefilled (28.8%); 35,272 s of prefill time.
- `foreground_tool_iteration`: 1,818 requests; median cached 21.8k, median prefilled 4.1k (p90 19.6k).
- `foreground_initial`: 310 requests; median cached 9.6k, median prefilled 12.9k.
- Daily, the prefilled share is 20–28% for tool iterations and 49–66% for initial requests.
- No arm has been computed on any request. The held-out window below starts after this commit.

## Arms

Each arm is a deterministic transform of what OpenUnum actually sent. No model call is made. The Lunum core is used at the commit recorded in RESULTS.md, with shipped defaults, and nothing is tuned on the held-out window.

| Arm | What changes | Prefix behaviour |
|---|---|---|
| **B** (base) | nothing: each tool result is OpenUnum's `compactToolResult` output, as sent | as logged |
| **T** (primary) | each tool result, after `compactToolResult`, goes once through the Lunum discourse view **when it is appended** (`planDiscourseCompaction` over that one message, shipped defaults). It is never rewritten afterwards | append-only: identical prefix structure, shorter appended segments |
| **C** (secondary) | T, plus: at a request whose **history misses the cache**, the history before the current user message is replaced by the discourse view (the [discourse-live-gate-v1](../discourse-live-gate-v1/PREREGISTRATION.md) configuration). The view is pinned until that session's next miss | rewrites only where the cache already missed; append-only between misses |

A **history miss** is a request whose logged `cacheN` is at most the token count of that request's system and tool-schema prefix plus 256. In other words, nothing past the static prefix was reused.

## Data

**Held-out window:** local, successful foreground requests from **2026-11-12T08:00:00Z to 2026-11-19T08:00:00Z**. "Foreground" means `kind` is `foreground_initial` or `foreground_tool_iteration`. The provider is local (`isLocalInference`).

**Sources, all read-only from OpenUnum, joined privately by the harness:**
- the `inference_request` and `inference_complete` log events, joined on `requestId`, for `sessionId`, `messageCount`, `cacheN`, `promptN`, `promptMs` and `promptTokens`;
- the `tool_runs` table, giving each tool result in order;
- the `messages` table.

**Prefix-stability fixes come first (corpunum-82, 2026-11-12).** The high prefill share at turn start (49–66%) is probably a prefix-stability problem in OpenUnum's prompt assembly, not a compression problem. It has gone to the s-engine and s-openunum sessions. If a change that alters prompt assembly or the cache lands in OpenUnum before or during the window, the window **restarts** at that change's deploy time, with the same length and the same minimum volume.
- A change of that kind includes prefix ordering, cache warming, slot assignment, the system or tool-schema prefix, or unum-serve cache settings.
- The base is then re-measured on post-fix traffic only.
- RESULTS.md lists every such change with its OpenUnum commit and deploy time.
- Lunum gets no credit for a cache fix: base and arms always come from the same post-fix requests.

**Minimum volume:** at least 500 tool-iteration requests and 50 history-miss requests. If the window falls short, it is extended once by 7 days. If it still falls short, the result is **no verdict**.

**Join validity:** at least 90% of held-out requests must join to a session and to their tool results. Otherwise: no verdict.

**Privacy:** the export goes to a mode-700 directory outside both repositories. Only aggregates are committed: counts, token sums, ratios, timings. No message text, tool output, session ids or paths.

## Cache model (how net prefill is computed)

For each held-out request *r*, the base prefill is the logged `promptN(r)`. This is observed, not simulated.

**Arm T.**
- Let *D(r)* be the sum of token reductions of the tool results that sit in *r*'s uncached suffix.
- A tool result counts as in the suffix when it was appended after the session's previous request and *r* is not a history miss. If *r* is a history miss, every tool result in *r*'s prompt counts.
- The arm-T prefill is `promptN(r) − D(r)`.
- Tool results already in the cached prefix change the cached token count, not the prefill. The cached reduction is reported without a bar.

**Arm C.**
- At a history-miss request, the arm-C prefill is the arm-C prompt tokens minus the static prefix. It is the size of the view, not the logged history.
- Between misses, a request's prefill is computed as in arm T. The pinned view is a stable prefix.
- At the next miss, the view is recomputed.

**Prefill time.** The estimated prefill time for an arm is its prefill tokens × that request's observed `promptMs / promptN`. Requests with `promptN = 0` contribute 0.

**Token counts.** Reductions are measured with one estimator, OpenUnum's `estimateMessagesTokens`, applied to the base and arm text alike. Each reduction is scaled by the request's `promptTokens / estimate(base prompt)`. The scale factor is reported.

**Model check, without a bar.** For arm B, the estimator's prompt total is compared with the logged `promptTokens`. The median ratio and its interquartile range are reported.

## Bar

Arm **T** is the primary arm. All four conditions must hold on the held-out window:

1. **Net prefill:** total arm-T prefilled tokens over all held-out foreground requests are **at most 0.80 ×** the base total (`Σ promptN`).
2. **Prefill time:** total estimated arm-T prefill time is at most **0.80 ×** the base total. The per-request p95 is not higher than the base p95.
3. **Recall over tool output, exact match.** A recall item is a literal of the kinds used in discourse-live-gate-v1: paths, SHAs, identifiers, versions, ISO dates, times, URLs, and numbers with 3 or more digits.
   - The literal must be in a base model-visible tool result, and used again later in the same session: in a later assistant message or a later tool call's arguments.
   - Literals already in the current user message are excluded.
   - The item is answered if the literal is in that tool result's arm-T text.
   - Base answers every item by construction, so the bar is pooled arm-T recall **= 100%**. Recall is also reported per tool and per turn.
4. **Cost of the view:** the mean Lunum view time per compacted tool result is at most **10%** of the mean estimated prefill time it saves per result.

Arm **C** passes if bars 1, 2 and 4 hold for C, and if, at the history-miss points, the [discourse-live-gate-v1](../discourse-live-gate-v1/PREREGISTRATION.md) recall bars hold: pooled and per-point mean fact-recall QA, prompt only, not lower than base.

**Reported without a bar:**
- the reduction in cached tokens;
- the number of requests whose arm prefill is larger than base (expected 0 for T);
- prefill ratios by tool name and by kind;
- the scale factor and the estimator's agreement with the log;
- the number of tool results the view leaves unchanged;
- literal recall over all literals, not just the ones used later.

## Decisions fixed now

- **T passes:** RESULTS.md proposes a live, flag-gated trial of arm T in OpenUnum (through the s-openunum session and the orchestrator), with the live log measuring bars 1 and 2 directly. This experiment changes nothing live.
- **T fails bar 1 or 2** (net prefill saving under 20%): the line of work **stops there**. No variant is tuned on this window; that is the orchestrator's stop rule. C is still reported.
- **T fails bar 3:** the missed literals are counted by kind, without text. Any fix is a new pre-registration on a new window.
- **No verdict** if the volume or join thresholds fail.

## Implementation

The harness belongs in OpenUnum. This repository never imports OpenUnum code. It goes there as `scripts/lunum-prefill-measure.mjs`, through a hub item for the s-openunum session, or through a worktree that the orchestrator approves. It is read-only, makes no model call and starts no server.

The harness is committed and its test passes before the window closes. RESULTS.md records:
- the OpenUnum commit it ran at;
- the Lunum core commit;
- the aggregate output.

## Limits stated now

- Prefill is modelled from the logged cache counters. It is not re-measured on the GPU. A live trial measures it directly.
- Slot eviction across sessions is taken as logged. Arm C's shorter histories could change eviction, and that is not modelled.
- Exact-match recall shows that a literal is in front of the model, not that the model uses it.
