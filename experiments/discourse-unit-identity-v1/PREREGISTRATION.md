# Semantic identities on discourse units v1: pre-registered bar

Written 2026-10-08, before the extractor change and before any gain
measurement, and committed before the results.

## Question

On the 15-session OpenUnum harness (`scripts/lunum-discourse-measure.mjs
--unit-identity`, 3,955 messages, 52 compaction points), OpenUnum's
deterministic EN/EL extractor (`openunum-deterministic/0.1`) issued an
`lfp:2.1` identity to **0 of 21,291** short sentence/list units, so the
discourse view's identity dedup (`discourseContext.unitIdentity`) never fires.
Why, and can coverage be raised faithfully, model-free, with the core literal
gate enforced, so that identity dedup or supersession gains something on real
traffic?

## Part 1 — diagnosis (descriptive, no bar)

- Abstention reasons of the extractor over the 21,291 units (already known:
  `no_rule` / `not_a_single_statement` / `too_long` / `multiple_sentences`).
- Unit shape census, mechanical: tool-call trace lines (`- shell_run …`,
  `- file_read …`), status/narration, list-marker imperatives, key/value,
  sentences with a code span or path, Greek.
- Predicate/frame coverage: share of units whose leading verb is a registered
  framed predicate or alias (lexicon lookup), i.e. the ceiling of the current
  grammar.
- **Upper bound of identity value:** tokens in units that the discourse view
  keeps (not verbatim duplicates) and that share a normalised record signature
  (record kinds + literal values + kv key) with a newer kept unit of the same
  role in the same session. Identity dedup cannot remove more than such
  non-verbatim restatements.

## Part 2 — model-free extension (planned)

`openunum-deterministic/0.2` in OpenUnum, no protocol or frame change:

- a list marker (`-`, `*`, `1.`) before an otherwise-supported statement is
  stripped;
- a code span, path, file name or dotted service/unit name is accepted as a
  noun phrase (`object`, or `path`/`service` by shape) where the grammar takes a
  theme, so `Restart \`openunum.service\`.` or `Read docs/ARCHITECTURE.md.` can
  parse. The literal is the instance id, so the core gate retains it.
- tool-call trace lines, questions, narration and status reports are not
  turned into identities (no predicate in `lunum-protocol/0.4` states them
  faithfully without a subject).

Every proposal still goes through core build, transport/frame validation and
the literal-retention gate.

## Bar

1. **Faithfulness:** 40 issued identities drawn with seed `20261008` (all if
   fewer) are hand-labelled faithful / unfaithful to the unit text
   (self-reviewed). At most **2** unfaithful, or the extension is not used.
2. **Coverage:** reported, no threshold.
3. **Gain:** with `unitIdentity` on, identity dedup removes **≥ 2%** of the
   discourse-on mean prompt tokens at the 52 points, and fact-recall QA
   (prompt) is not lower than discourse-on without identities by more than
   0.2 points. Then `discourseContext.unitIdentity` may default on; otherwise
   it stays off.
4. If the Part 1 upper bound is below 2%, the gain bar is declared unreachable
   for any unit-identity extractor on this traffic, and that is the result.
