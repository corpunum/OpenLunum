# Owner-referenced meaning targets v1: all 30 round-2 sentences

**2026-10-16. Offline, no model calls.**
- **The meaning reference** for the 14 previously unresolved items is the owner's reading ([owner review Part A](../owner-greek-review-v1/INTAKE.md)). That reading is AI-assisted drafting, checked by the native-speaker owner.
- **The encoding** of that meaning into frozen contract 0.19 is the authoring session's technical judgement. It is self-reviewed, and every row says what was decided and why.
- **The 16 targets reviewed earlier** are copied unchanged.

| File | What it is |
|---|---|
| [build.mjs](build.mjs) | Builds `targets.jsonl` (30 rows, all reviewed) and `probes-v2.json`. Every parse target must receive an `lfp:2.1` identity under the frozen core, or the build fails. |
| [targets.jsonl](targets.jsonl) | The targets. They supersede `meaning-scoring-recorded-v1/targets.jsonl` for these purposes; the old file is unchanged. |
| [probes-v2.json](probes-v2.json) | The round-2 expectations, where **10 items move from parse to abstain**: e06, e09, e10, e11, e13, e15, e19, g01, g07, g08. Each row records why and keeps `previousExpectedOutcome`. |
| [score.mjs](score.mjs) → [meaning-report.json](meaning-report.json) | Re-scores the original round-2 run and the v17 re-run with the same scorer function |

## Why 10 expectations change

Under the owner's reading, those sentences carry something that no frozen role can hold, so the contract's own rule says abstain:
- an expiry ("until 30 November");
- a recurrence ("every night");
- an exception ("nobody except");
- a deadline with no year;
- a scope ("in production").

Or they are ambiguous: "can" and «μπορεί» mean permission, ability or possibility. The round-2 evaluator had marked them parse. The earlier outcome scores therefore **rewarded parses that dropped meaning**.

## Results (30 of 30 reviewed)

| | Original run (contract 0.10) | v17 re-run (contract 0.15) |
|---|---|---|
| Outcome correct | 23/30 | 23/30 |
| **Meaning correct** (exact representation, or a correct abstention) | **16/30** | **16/30** |
| English | 13/20 | 12/20 |
| **Greek** | **3/10** | **4/10** |
| Exact matches / correct abstentions | 9 / 7 | 7 / 9 |
| Parsed where the owner's reading says abstain | 7 (e10, e11, e15, e19, g01, g07, g08) | 5 (e06, e19, g01, g07, g08) |

Earlier figures:
- **Before:** 20/30 by the round-2 evaluator's manual reading, and 13/16 and 9/16 on the reviewed subset.
- **With the owner's references:** both runs reach **16/30**.
- **The later contract traded parses for abstentions:**
  - v17 refuses more of the unrepresentable sentences (e10, e11, e15, g08);
  - it also refuses g02, which has a valid representation since ADR 0022;
  - it still parses the ambiguous "can"/«μπορεί» items and the year-less deadline.

## What the Greek items show

Greek scores 3–4/10. The mismatches are mostly **not** about structure:
- **The extractor translates Greek terms into English:**
  - «διακομιστή αλληλογραφίας» → `mail server`;
  - «ομάδα» → `team`;
  - «Νίκο» → `Nikos`;
  - «διευθυντής» → `director`.
- The targets keep the source words, as the retention principle in AGENTS.md asks.
- The contract has **no rule for the language of open terms.**
- The consequence for identity: if the model translates, English and Greek *may* converge, but the source literal is lost. If it does not translate, they cannot converge.

This is the language-agnostic problem in its plainest form. The [cross-language convergence test](../cross-language-convergence-v1/PREREGISTRATION.md) measures it live.

## Limits

- **One encoder:** the encoding choices (`kind`, term types, id or value) are the session's. The scorer counts `kind` and term types, the same labels shown to split identities across runs ([v17 report](../../reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md)). A different encoder could move several items between match and mismatch without any change in meaning.
- **Two expectations rest on primary readings:** g04 (imperative rather than aorist) and g02 (per-expense rather than total). The alternative readings are recorded in the notes, not encoded.
- **The v17 raw streams are not in the repository**, so no stream-level checks were made.
