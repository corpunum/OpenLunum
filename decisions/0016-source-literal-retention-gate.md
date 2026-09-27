# ADR 0016 — Source literal retention gate

**Status:** Implemented 2026-09-27. Self-reviewed. Contract `lunum-agent/0.12`; frames, vocabulary and the fingerprint function are unchanged. No live model run has used this contract yet.

## Context

The round-2 independent evaluation ([report](../reports/independent-evaluation/2026-09-26-round2/REPORT.md)) read every out-of-sample parse. 7 of 23 lost or changed meaning and still received an identity. An identity that drops "up to 2,000 euros" from a permission claims a broader meaning than the source, which is worse than an abstention. Core had no way to notice: it validated the candidate, never the candidate against its source.

Contract 0.11 added an instruction to abstain rather than drop a restriction. Instructions have not reliably changed this model's behaviour before (see the placeholder re-typing in [EVALUATION.md](../reports/diagnostic/2026-09-26/EVALUATION.md)), so a mechanical check is needed.

## Decision

`submitCandidate` compares the digit-bearing literals of a non-empty `sourceText` with the strings and numbers in the candidate (`checkLiteralRetention`, `packages/core/src/literal-retention.ts`):

- **numbers**, read language-neutrally: "5,000", "2.000" and "15,750.00" are read as values; 12-hour times ("2:00 PM") are read as 24-hour;
- **identifiers** of the form letters-hyphen-digits (`Q-81`, `U-31`), matched as whole tokens, case-insensitively.

If any is missing, core withholds identity. The result has `failureClass: unretained_source_literal`, a diagnostic that names the missing literals, and a `literalRetention` report. The contract says the rejection means abstain.

## Evidence (no model calls)

The audit is in [literal-retention-audit.json](../reports/diagnostic/2026-09-27/literal-retention-audit.json), produced by `scripts/research/literal-retention-audit.mjs`.

| Population | Checked | Blocked | Reading |
|---|---|---|---|
| Recorded live V8 parses that the frozen scorer judged source-relative matches | 176 | **0** | no false positives |
| All other recorded live parses (probes, evaluators, non-matching V8) | 296 | 4 | all 4 are genuine meaning losses |
| Gold (source, Sem) pairs in `datasets/` | 163 | 2 | both gold Sems omit source content |

The 4 live blocks are:
- `transfer → send` dropping account Q-81, and its Greek twin dropping Q-82;
- the round-2 evaluator's g02, which dropped "έως 2.000 ευρώ";
- the evaluator's g07, which dropped "μέχρι τις 31 Δεκεμβρίου".

The 2 gold blocks are the ERR-4521 timestamp and "Version 3.2" in `datasets/downstream-benchmark-v1.jsonl`. Both are hand-written summaries that leave that content out.

Two earlier gold blocks were parser bugs, not meaning loss, and were fixed before this decision: "$15,750.00" was read as a stray 0, and "2:00 PM" did not match `14:00`.

## What it does not catch

Of the round-2 evaluator's 7 meaning losses, this catches **2** (g02, g07):

- **e02** ("under 5,000 euros") is **not a loss in the recorded ledger**. The candidate carries `below(value: 5000 euros)` as a condition. The evaluator's reading of that row appears wrong. The check passes it, correctly.
- **e10** (the recurrence "every night") and **e11** (the wrong predicate and a lost "before the deadline") are words, not digits. They are invisible to this check.
- **e18** and **g03** (the prohibition encoding) were closed by decisions/0015.

More generally, the check is blind to anything written in words:
- number words ("seven times");
- named dates ("by Friday");
- recurrence and exceptions;
- wrong predicates;
- dropped names.

It also does not check that a literal is in the *right* role. It is a floor, not a meaning score. Meaning-level scoring remains open.

## Costs

- **False abstentions** where a source number is legitimately represented differently. Examples: a unit conversion ("2 hours" stored as 7200 seconds), a Sem that splits "3.2" into parts, or a number that is incidental to the claim. The recorded data shows 0 such cases in 176 scorer-matched parses. There is no measurement on real memory data.
- **Ambiguous grouping:** "1,500" is read as 1500. In locales where it means 1.5, a candidate carrying 1.5 would be blocked.
- **Uncaught prefixes:** identifiers without a hyphen ("INV2025", "#342") are not checked as identifiers, only by their digits.
- **Ungated paths:** the gate applies only to submissions with source text. `sourceText: ''` (as in the fingerprint scan) is not checked.

## Versioning

- The contract is `lunum-agent/0.12`, with one new abstention rule.
- Instruction package v13 binds the build, including the new `literal-retention.js`, which the runner now binds.
- Fingerprints of retained candidates are unchanged: `fingerprint.ts` is untouched, and the gate only withholds identities.
