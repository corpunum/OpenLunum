# ADR 0020 — Number words and relative times are source literals; strict thresholds are conditions

**Status:** Implemented 2026-10-08. Self-reviewed (Claude Code agent, model
`claude-opus-5-5`; no human or native-speaker review). Agent contract
`lunum-agent/0.16`, instructions `agent-extraction-instructions/0.6`,
instruction package v18. No live parser/model calls.

## Problem

The source-literal retention gate (ADR 0016, 0018, 0019) compared only
digit-bearing tokens and full dates. Two kinds of literal passed through it
unchecked:

- **Cardinal number words.** `Restart the payment service seven times.` with a
  candidate that stores `3`, or no count at all, kept its identity: "seven" was
  not a number to the gate.
- **Relative times.** `Deploy the patch by Friday.` with a candidate that drops
  the deadline, or resolves it to a calendar date nobody stated, kept its
  identity. A relative time is deictic: its referent depends on when the text
  was said, so neither dropping nor resolving it preserves the meaning.

Both widen the meaning an identity claims, the failure the gate exists to stop.

Separately, the round-2 item e02 (`The finance lead allows Omar to approve
invoices under 5,000 euros.`) abstained in the 2026-10-07 v17 live run with the
reason "the allow frame has no threshold role". The contract already accepts
the threshold as a `below` condition (the candidate receives identity), but no
rule said so.

## Decision

`checkLiteralRetention`:

1. Reads English and Greek **cardinal number words** as numbers, including
   compounds (`twenty-five`, `two hundred and five`, `είκοσι πέντε`,
   `τρεις χιλιάδες διακόσια πενήντα`), `twice`/`thrice`/`dozen`, and Greek
   hundreds (`διακόσια` … `εννιακόσια`). They join the numeric floor on both
   sides: a source "seven" needs a candidate 7 (or "seven"); a candidate
   "seven" satisfies a source 7.
   - Not numbers: `one`, `once` and Greek `ένα/μία/ένας` (also articles and
     pronouns), ordinals, and `εκατό` in `τοις εκατό` (percent).
2. Reads **relative times** into canonical tokens and requires the candidate
   to carry the same token in a semantic value:
   - weekdays (`weekday:friday`; EN names, EL `Δευτέρα` … `Κυριακή`, with
     `Τρίτη/Τετάρτη/Πέμπτη` only when capitalised, since lower case they are
     ordinals);
   - deictic days (`day:today|tonight|tomorrow|yesterday`, EL `σήμερα`,
     `απόψε`, `αύριο`, `χθες`, `μεθαύριο`, `προχθές`);
   - periods (`period:next-week`, `last-month`, `this-year` …; EL
     `επόμενη εβδομάδα`, `επόμενο μήνα`, `του χρόνου`, `πέρσι` …);
   - `end-of:day|week|month` (`EOD`, `end of the week`).
   EN and EL spellings of the same expression share a token, so cross-language
   identity is unchanged. The result reports `sourceRelativeTimes` and
   `missingRelativeTimes`; `retained` requires the latter to be empty.
3. The agent contract states both rules, and that a **strict** threshold
   restricting a role is a `conditions` clause with `below`/`above`. Inclusive
   bounds (`up to`, `at most`, Greek `έως`) have no registered predicate in
   `lunum-protocol/0.4`; the rule says to abstain rather than encode them as
   strict. This leaves g02 (`έως 2.000 ευρώ`) an abstention by design: adding
   an inclusive comparison predicate is a protocol change with its own version
   and golden vectors.

Sem values and the `lfp:2.1` projection are unchanged. Only acceptance changes,
and only towards refusing.

## Evidence

- New unit tests (`relative-time-number-word-retention.test.ts`): "seven
  times" stored as 3 is refused with `unretained_source_literal`, stored as 7
  receives the same identity as the digit source; "by Friday" dropped or
  resolved to `2026-10-09` is refused, carried as `friday` is retained; EN/EL
  tokens agree; article-like words are not counted; e02 as `allow` + `below`
  receives identity and is refused without the condition.
- Replay of every recorded candidate in the repository
  (`scripts/research/replay-literal-retention-0020.mjs`, 88 ledgers, 221
  unique source/candidate pairs, baseline = `origin/main` build): 174
  identities before and after, **0 withdrawn, 0 gained, 0 fingerprints
  changed**. The first replay found one false refusal, `20 τοις εκατό` read as
  100; `τοις εκατό` is now excluded and covered by a test. None of the recorded
  sources with an identity contains a relative time, so the replay shows no
  regression but cannot show a catch; the catches are the unit tests above.
- e02 under the new rule has **no live run**. The rule makes the abstention
  avoidable; whether a model follows it is unmeasured.

## Not established

Number words beyond the listed EN/EL lexicon, other languages, ordinals,
fractions, and relative times outside the listed forms ("in three days" keeps
only its number) are not recognised. This is a presence floor, not role or
meaning verification, as before.
