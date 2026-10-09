# Ambient discourse view v1: pre-registered bar

Written 2026-10-09, before the candidate was measured. It is committed before
the results, and the bar does not move after they are seen.

## Why this item

The directive is to make Lunum pay off on real OpenUnum traffic, not just on
single sentences. Before choosing, three candidates were sized. Only the
baseline was characterised; none of the candidates was measured. The sizing
used aggregates only, from live telemetry (`turn_context_reserve`, 11,349
model iterations from 2026-10-05 to 2026-10-09) and from a read-only export of
`tool_runs` since 2026-10-01 (23,922 runs, 518 sessions).

| Candidate | What sizing showed |
| --- | --- |
| Tool-result compaction with exact literals | In-turn growth (tool calls plus results) is **15.9%** of all prompt tokens. Results older than the last 4 calls are 64% of that, so the ceiling is about 10%: under the 20% gate before any recall cost. |
| Session-wiki compaction links | Wiki checkpoints are written only at the 70% trigger, which **85 of 11,349 iterations (0.7%)** reached. |
| Older turns compacted on every turn (cross-turn state: duplicate and superseded units, literal-preserving clips) | The median first-iteration prompt is 19.2k tokens, with about 7k of system prefix, so history is about 12k. The live discourse view (OpenUnum #57) runs **only under context pressure**; 35 `context_pressure` events in the same logs means it almost never acts. |

The third candidate covers most of the tokens and reuses the shipped,
reviewed discourse planner. It is chosen. In this experiment the "state
tracking" is the planner's existing cross-message machinery:
- duplicate-unit drop;
- `key: value` supersession;
- literal-preserving clips, with a `session_read` pointer per compacted
  message.

No new extractor is added.

## Candidate

**Ambient discourse view.** Apply OpenUnum's `applyDiscourseView`, with
`DISCOURSE_CONTEXT_DEFAULTS` (keepVerbatimLast 4, minChars 1500), at every
user turn whose loaded history is at least 4,000 estimated tokens, whether or
not context pressure is reached. The live path is otherwise unchanged.

- **Baseline:** the live path today, with `discourseContext.enabled=true`,
  which acts only under pressure.
- **Candidate:** the same path plus the ambient view.

## Data

- **Held out:** real OpenUnum sessions not among the 15 development sessions
  of the discourse work, with user turns after 2026-10-08T05:20 (when the dev
  export was taken) up to the export time. Export is read-only
  (`messages` rows). Private data stays on the rig; only aggregates are
  published.
- **Points:** user turns whose history, as the measure script loads it, is at
  least 4,000 estimated tokens. At most 4 points per session, spaced evenly.
  At least 30 points are required, or the result is reported as underpowered.
- **The 15 development sessions** are also run and reported separately. They
  do not count toward the bar.

## Measures

`scripts/lunum-discourse-measure.mjs` in OpenUnum, extended with an ambient
mode. No model calls. Recall uses the existing definitions, unchanged:

- **Tokens:** mean prompt tokens of the history the model sees at the points.
- **QA literal recall** (primary recall): pooled share of QA literals
  (`QA_RES`: paths, SHAs, identifiers, versions, ISO dates, times, URLs,
  numbers of 3+ digits). A literal counts if it was stated before the point,
  used again within the next 60 messages, not in the current message, and is
  present in the prompt.
- **Model-graded QA** (second recall bar, to break the circularity of
  literal-preserving compaction scored by literal presence):
  `scripts/lunum-graded-qa.mjs`, `claude -p` with `haiku`, on the dumped
  points. Up to 16 points and 6 items each, seed 20261008 as before, and at
  most $1.50. It never uses the local :8080 slot.

## Bar (held-out set; all must hold)

1. **Tokens:** the candidate's mean prompt tokens are **at least 20% lower**
   than the baseline's.
2. **QA literal recall:** candidate pooled recall **≥** baseline pooled
   recall.
3. **Graded QA:** candidate correct answers **≥** baseline correct answers on
   the same frozen questions.
4. **Latency:** p95 view time under 50 ms per point.

If all four hold, the candidate is implemented in OpenUnum behind a flag that
defaults off (`runtime.lunumMemory.discourseContext.ambient`), and the PR is
opened. Enabling it live is the owner's decision. If any bar fails, it is
reported and not implemented.

## Reported, not gated

- The share of points where the ambient view changes anything.
- **Prompt-cache impact.** Moving the compaction boundary every turn changes
  older messages, which breaks KV prefix reuse on the batch-1 local server.
  The diagnostic is the reusable-prefix share between consecutive user turns,
  baseline vs candidate. A latency cost is not established by tokens alone.

## Not established

- **Literal recall can pass by construction.** The view keeps literal
  spellings, so passing bar 2 says little on its own; bar 3 is the guard.
- **Graded QA is coarse.** Last cycle, absolute accuracy was about 18%, so
  bar 3 has low power for small differences.
