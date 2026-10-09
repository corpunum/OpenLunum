# Frame gaps v1: pre-registered bar

Written 2026-10-09, before implementation and before any provider call. It is
committed before the results, and the bar does not move after they are seen.

## Question

The contract 0.16 live check
([RESULTS](../contract-0.16-live-check-v1/RESULTS.md)) got 5 of 8 identities
on r1–r8. All three misses were correct abstentions caused by gaps in
`lunum-frame/0.5`/`0.6`, not by the 0.16 rules:

- r1 `Deploy the billing patch by Friday.`: `deploy` requires `agent` and
  `destination`. An imperative has no agent, and this one names what is
  deployed (a theme), not where.
- r2 `Rotate the database credentials tomorrow.`: `rotate` requires `agent`.
- r6 `Επανεκκίνησε τον διακομιστή S-12 δύο φορές.`: `restart` has no `count`
  role.

Can the frames close these gaps without changing any existing identity?

## Change (planned)

- `lunum-frame/0.7`:
  - `deploy`: agent becomes optional (imperatives). Add an optional `theme`
    (what is deployed). `destination` becomes optional, and at least one of
    `theme`/`destination` is required.
  - `rotate`: agent becomes optional (imperatives), as decisions/0014 already
    did for `enable`, `delete`, `read`, `restart` and others.
  - `restart`: gets its own frame with an optional `count` (quantity), the
    same shape as `retry`.
- Protocol vocabulary is unchanged (`theme` and `count` are already
  registered roles).
- Contract `lunum-agent/0.18`, instructions 0.8. New rule: an imperative's
  addressee is the implicit agent. Leave `agent` out; never fill it with `you`,
  the reader or a placeholder.
- Instruction package v20 and served-runtime manifest v20 are frozen. v19 and
  earlier stay immutable and are tested as historical.

## Landing bar (deterministic; all must hold)

1. **No existing identity changes.** Replay every recorded candidate in the
   repository against the `origin/main` build (as
   `replay-literal-retention-0020.mjs`). Required: 0 withdrawn, 0 fingerprints
   changed. Any gained identity must be a `deploy`/`rotate`/`restart`
   candidate that the old frame refused only for agent, destination or count,
   and is listed.
2. **Existing golden vectors unchanged.**
3. **Frozen packages:** v19 and earlier pass their historical-binding tests;
   drift is reported exactly; no frozen file is edited.
4. **Deterministic probes:** hand-built candidates for r1 (deploy, theme
   billing patch, Friday), r2 (rotate, theme database credentials, tomorrow)
   and r6 (restart S-12, count 2) receive identity. Their negative twins are
   refused:
   - r6 without the count (literal retention);
   - r1 without Friday;
   - a deploy with neither theme nor destination (frame).
5. `pnpm verify` is green locally and in CI.

## Live check (small spend; reported, separate from landing)

Rerun the same eight r1–r8 sources under v20, with requests re-frozen to the
v20 `coreContractHash`. Runner `run-claude-code-source-only.mjs`, model
`claude-sonnet-5` (same as the 0.16 check), concurrency 1, $0.25 per item,
$2.00 total. A `--limit 1` pilot runs first and counts within the same budget.

- **Pass:** at least 7 of 8 receive identity (the 0.16 check got 5), with at
  least 2 of the 3 previous misses (r1, r2, r6) among them, and 0 candidates
  that resolve a relative time or store a different count.
- r6 has a confound. Contract rules make an abstention correct for a Greek
  form that is both imperative and past (`Επανεκκίνησε`) unless a condition,
  recurrence, deadline or `παρακαλώ` rules out the past reading. If r6 abstains
  for that stated reason, it is reported as a correct abstention, still counts
  as a miss against the bar, and the bar is not reinterpreted.

## Not established

The probes were written by the agent, and they are the same sentences that
exposed the gaps. Passing shows that the gaps are closed, not that the frames
generalise. No fresh held-out live set is run, to stay within the budget.
