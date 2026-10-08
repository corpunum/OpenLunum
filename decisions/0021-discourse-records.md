# ADR 0021 — Discourse records: source-span units for long and structured text

**Status:** Implemented 2026-10-08. Self-reviewed (Claude Code agent, model
`claude-opus-5-5`; no human review). Core module `discourse.ts`, record format
`lunum-discourse/0.1`, unit key `lsu:0.1`, fact key `lkv:0.1`. No model calls.

## Problem

Lunum's identity path is sentence-level: one source sentence, one candidate
Sem. Agent traffic is not. In 15 real OpenUnum sessions (3,955 messages,
2026-10-08 export) the deterministic extractor issued **0** identities: 71% of
messages are too long and 27% have several sentences. Splitting into sentences
does not change that: 0 of 21,291 short sentence or list units received an
identity (`no_rule` 45%, `not_a_single_statement` 50%). The text is reports,
tool output, plans and status lines, not the policy sentences the frames cover.
So Lunum had nothing to offer the place where an agent's context is spent.

## Decision

Add a deterministic, structure-only layer below Sem:

1. **Units with exact spans.** `segmentDiscourse` splits text into headings,
   list items (with continuation lines), `key: value` fields, table rows, code
   fences, sentences, over-long blobs, and agent tool-result lines
   (`tool(args) — ok: true; code: 0; stdout: …`) split into the call and its
   fields. `source.slice(start, end) === unit.text` for every unit.
2. **Surface records per unit.** `key: value` facts (with a fact key scoped by
   tool/role), test counts, exit statuses, and error / decision / commitment /
   open-item cues (EN/EL keyword heuristics), plus the unit's literals:
   numbers (incl. ADR 0020 number words), identifiers, full dates, relative
   times, paths, hashes and URLs.
3. **Per-unit literal gate.** A record may be shown *instead of* its unit only
   if its rendering states every literal of the unit and every value it states
   is a slice of the unit. Otherwise the unit stays natural text (abstains).
   `verifyDiscourseAnalysis` re-checks spans, slices and the gate.
4. **Document record.** Topic unit, decisions, commitments, open items,
   errors, literal-bearing and structured units, and the latest value per
   fact key.
5. **Cross-message compaction plan** (`planDiscourseCompaction`), newest
   message first: recent messages stay verbatim (a single recent message over
   `recentMaxChars` is bounded too); in older long messages a unit already
   shown in a newer message is dropped (`lsu` key, or an issued semantic
   identity with every literal covered, if the caller supplies one); a
   `key: value` unit whose fact key has a newer, different value is shown as
   `(superseded)` and kept in `factHistory`; an over-long unit is clipped to
   its head plus the spelling of every literal it states; over budget,
   internal metadata and narrative units without literals or cues are omitted
   first, and the message lists the literals its omitted units mention. Every
   compacted message carries a caller-supplied pointer back to its source.

### Boundaries

- These are **surface records**. They carry no Sem and no `lfp` identity and
  are never marked semantic. `lsu:0.1` and `lkv:0.1` are keys over normalised
  text, not meaning fingerprints, and never feed an identity.
- Nothing is deleted. A plan describes a view; the caller keeps the source.
- The cue lexicons only order what a compactor keeps first. They make no
  semantic claim and do not touch any identity.
- `packages/core` still imports no product code; the OpenUnum wiring lives in
  OpenUnum.

## Evidence (OpenUnum, offline, self-reviewed)

`scripts/lunum-discourse-measure.mjs` in OpenUnum replays the live prompt path
(context pressure cut → compaction → discourse view → hard limit) on the 15
real sessions at 52 compaction points, off vs on, with no model calls:

| | off (live) | discourse on |
|---|---:|---:|
| mean prompt tokens | 19,586 | 5,860 (−70%) |
| … excluding the one point over the context limit | 12,349 | 5,512 (−55%) |
| median per-point ratio (on / off) | – | 0.71 (13 of 52 points larger) |
| points over the context limit | 1 | 0 |
| literal recall (all literals stated before the point) | 44.2% | 47.5% |
| fact-recall QA, 5,887 items (prompt / + session wiki) | 30.2% / 40.2% | 38.5% / 47.0% |
| fact-recall QA, mean per point (prompt / + wiki) | 55.5% / 70.6% | 66.7% / 78.3% |
| QA per point worse / better / same | – | 5 / 22 / 25 |
| mean / p95 assembly time (cold cache) | 13 / 68 ms | 55 / 199 ms |

QA items are literals stated before the point and used again in the next 60
messages of the real session. Recall is exact string presence: it shows a
literal is still in front of the model, not that a model answers correctly;
a literal listed after a clipped or omitted unit has less context than the
original sentence. Model-graded QA is not done.

## Not established

Model answer quality on compacted context; languages beyond the EN/EL cue
lexicons (segmentation and literals are language-neutral, cues are not); text
shapes other than OpenUnum's (chat, reports, tool dumps).
