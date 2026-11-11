# Discourse context on post-enablement traffic v1: pre-registered bar

Written 2026-11-11, before any measurement of the held-out sessions, and
committed before the results. The bar and the method are fixed here. A method
change after results are seen goes into the results file as a deviation; the
bar does not move.

## Question

OpenUnum's discourse view (`runtime.lunumMemory.discourseContext`, OpenLunum
[ADR 0021](../../decisions/0021-discourse-records.md)) was measured on
2026-10-08 on 15 sessions and enabled live the same day: 70% fewer prompt
tokens at compaction points, exact-match fact recall 30.2% to 38.5%. The view's
budgets (`maxMessageChars`, `recentMaxChars`, `maxOmittedLiterals`) were chosen
on those 15 sessions, so that result is in-sample.

Does the view still pass the owner's gate (at least 20% fewer prompt tokens at
compaction points, recall no worse than the baseline) on sessions that started
**after** it was enabled, with the budgets unchanged?

## Data

- Read-only export of the owner's OpenUnum message store, private work
  directory (mode 700). Nothing from it is committed: aggregates only.
- **Held-out sessions:** every session whose first message is later than
  2026-10-08T05:20:00Z (the cut-off of the in-sample export) and whose stored
  messages total more than 200,000 characters. The selection rule is fixed
  here; the count is reported in the results.
- **Live telemetry:** the `context_discourse`, `context_discourse_failed` and
  `context_hard_limited` log events written by the running server since
  2026-10-08.

## Method

1. Held-out replay with the unchanged harness, OpenUnum
   `scripts/lunum-discourse-measure.mjs` at OpenUnum `origin/main` (commit
   recorded in the results): default settings, 65,536-token context (the live
   value), 4 points per session where the 70% trigger fires, off = the live
   head/tail cut, on = the discourse view with its shipped defaults. No model
   calls.
2. Live telemetry is summed as logged. The live event records the tokens
   before and after the view, **not** the tokens the old head/tail cut would
   have produced, so it is not a gate measurement by itself. It is reported
   as: events, sessions, failures, hard-limit events, time per event.

## Bar

On the held-out replay, all three must hold:

1. **Tokens:** mean prompt tokens at compaction points with the view on are
   **at most 0.80 x** the mean with it off, both over all points and over the
   points where the off prompt fits the context.
2. **Recall, pooled:** exact-match fact-recall QA (prompt only), pooled over
   all items, is **not lower** on than off.
3. **Recall, per point:** the mean per-point fact-recall QA (prompt only) is
   **not lower** on than off.

Reported without a bar: literal recall, recall with the session wiki, the
count of points that get larger, the count of points where QA gets worse,
prompt assembly time, live telemetry.

## What follows from the result

- **Pass:** the flag stays on. The live event gains the head/tail-cut token
  count for the same history (`baselineTokens`), so every future live event
  measures bar 1 directly, and a script reports the live gate from the log.
- **Fail on bar 1 only:** the flag stays on (no recall loss); the cause is
  reported.
- **Fail on bar 2 or 3:** the result is reported to the owner with the option
  to turn the flag off; no budget is re-tuned on the held-out sessions in this
  experiment.

Any change to the view made after this result is a new experiment with its own
bar, measured on the in-sample 15 sessions for tuning and on these held-out
sessions once.

## Limits known in advance

- Exact-match recall shows that a literal is in front of the model, not that a
  model answers with it ([compacted-context-graded-qa-v1](../compacted-context-graded-qa-v1/RESULTS.md):
  model-graded accuracy was equal, 18.0%, on and off).
- The replay rebuilds prompts from stored rows; it does not include the tool
  results inside a running turn.
- Self-reviewed; the sessions are private, so only aggregates can be checked.
