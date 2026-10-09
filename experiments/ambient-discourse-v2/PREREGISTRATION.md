# Ambient discourse view v2: pre-registered bar

Written 2026-10-10, before the candidate was measured. It is committed before
the results, and the bar does not move after they are seen.

## Why

[v1](../ambient-discourse-v1/RESULTS.md) cut prompt tokens by 36.6% on held-out
OpenUnum traffic but failed bar 2 (QA literal recall 94/95 vs 95/95), and it
left 33% of a prompt reusable at the next turn (100% live). v1 named both
follow-ups. v2 makes exactly those two changes and re-runs the v1 bar.

## Candidate

1. **Literal extractor (core, `packages/core/src/discourse.ts`).** The path
   literal also covers relative paths of three or more segments without an
   extension (`propose/check/decide`, `src/memory/lunum`), and an absolute
   path after a host prefix (`rig:/srv/app`). The v1 recall definition counts
   the `/word/word` spelling inside those; core did not, so a clip could drop
   it. A new core test asserts that every spelling the recall definition
   counts as a path is inside a core path literal, and that a clip keeps it.
2. **Stepped boundary (OpenUnum, `compactStepped`).** At an ambient turn the
   messages are split at
   `B = floor((n - keepVerbatimLast) / stepMessages) * stepMessages`.
   Messages before `B` are planned on their own, so their view is
   byte-identical until `B` advances. Messages from `B` on are verbatim, except
   that one over `recentMaxChars` is clipped by a plan of that message alone.
   Parameters, fixed now: `stepMessages = 8`, `keepVerbatimLast = 4`,
   `ambientMinTokens = 4000`, the other `DISCOURSE_CONTEXT_DEFAULTS` unchanged.
   Under context pressure the live path is unchanged.

OpenUnum runs the candidate with this core vendored. The flag
`runtime.lunumMemory.discourseContext.ambient` defaults off.

## Data

- **Primary (gated):** the v1 held-out set, re-run: the same read-only export,
  the same 66 sessions, the same point rule (history at least 4,000 estimated
  tokens, at most 4 points per session). Caveat: change 1 was informed by the
  one literal v1 lost on this set, so bar 2 here is not independent of the
  fix.
- **Fresh (gated only if powered):** sessions with user turns after the v1
  export (2026-10-09T14:38:33Z), from a new read-only export. Points after that
  time only. If it has at least 30 points, bars 1 to 3 must hold there too;
  otherwise it is reported as underpowered.
- Private data stays on the rig; only aggregates are published.

## Measures

The v1 measures, unchanged: `scripts/lunum-discourse-measure.mjs --ambient`
in OpenUnum (now with the stepped view; v1's unstepped view is reported as a
diagnostic), and `scripts/lunum-graded-qa.mjs` with `claude -p --model haiku`
on **the v1 frozen questions** (42 questions at 13 points) for the primary
set, at most $1.50. Never the local :8080 slot.

## Bar (all must hold on the primary set)

1. **Tokens:** candidate mean prompt tokens at least **20% lower** than live.
2. **QA literal recall:** candidate pooled recall **≥** live.
3. **Graded QA:** candidate correct answers **≥** live on the frozen questions.
4. **Latency:** p95 view time under 50 ms per point.

Plus, **measured and reported (not gated):** mean reusable-prefix share at the
next user turn, live vs candidate vs v1.

If the bar holds, OpenUnum gets one PR: the re-vendored core (contract
lunum-agent/0.18 and this fix) and the stepped ambient view behind
`discourseContext.ambient`, default off. Enabling it is the owner's decision.
If it fails, it is reported and the flag is not added.

## Expected cost of stability (stated before measuring)

A unit in the frozen prefix is no longer dropped as a duplicate of the same
unit in the verbatim tail, and up to `stepMessages - 1` extra messages stay
verbatim. Token savings should therefore be lower than v1's 36.6%.
