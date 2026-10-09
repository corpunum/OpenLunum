# Semantic identities on discourse units v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `5c9b62d` before the extractor change and before any gain measurement.
- **Run:** 2026-10-08/09. OpenUnum branch `feat/lunum-l1-recall`:
  - diagnosis: `scripts/lunum-unit-identity-diagnose.mjs`;
  - gains: `scripts/lunum-discourse-measure.mjs --unit-identity`;
  - data: the same 15-session export (3,955 messages, 52 points).
- No model calls. Aggregates only. Self-reviewed.

## Part 1: why 0 of 21,291

**Extractor outcomes on the 8,439 distinct short sentence/list units.** The 21,291 count includes verbatim repeats.

| Outcome | Units |
| --- | --- |
| `not_a_single_statement` (code spans, brackets, URLs, `;`, `?`) | 4,185 |
| `no_rule` | 3,420 |
| `multiple_sentences` | 420 |
| `too_long` | 414 |
| issued | **0** |

**Shape census of the same units.** The categories are mechanical and first-match.

| Shape | Units | Tokens |
| --- | --- | --- |
| Narrative/status sentence | 3,557 | 69k |
| Sentence with a code span or path | 2,359 | 70k |
| Tool-call trace line (`- shell_run …`, `[session_message …]`) | 1,099 | 41k |
| Code-like | 648 | 18k |
| Bold label (`**Status:** …`) | 392 | 10k |
| Greek | 180 | 3k |
| First-person report | 141 | 3k |
| Question | 58 | 1k |
| List-marker imperative | 5 | 0.1k |

**Grammar ceiling.** Only **71 distinct units (0.8%)** begin with a verb that the extractor's EN/EL lexicon covers. Every one of them carries something the closed grammar cannot represent faithfully:

- a manner adverb ("Read the plan **fully**");
- a second clause ("… then FRAMEWORK3.md fully first", "… and carry it out now, item by item");
- an absolute path inside running prose.

The traffic is agent work logs: status reports, tool traces and multi-clause directives. In `lunum-protocol/0.4` there is no predicate for "X is clean at SHA", "tests: 93/93 passed" or "I stopped worktree activity" that would be faithful without a subject, which comes from the surrounding context.

**Upper bound of identity value.** Over all units in each session, newest first:

| | Tokens |
| --- | --- |
| All unit tokens | 3.04M |
| Already handled as verbatim repeats (surface `lsu` keys) | 1.81M |
| Kept units whose record signature (kv key, record kinds and literal values) equals a newer kept unit with different text | **96.7k (3.2% of all unit tokens)**, 2,828 units |
| `key: value` facts with a newer, different value (supersession candidates) | 3,656 units |

The 3.2% is a loose ceiling. These are mostly kv/test-count/status restatements, and the discourse view already marks the kv supersessions as `(superseded)` at the surface level. The ceiling is above 2%, so bar 4 (declaring the gain unreachable) does not apply.

## Part 2: model-free extension

`openunum-deterministic/0.2` makes three changes:

- It strips a bullet list marker (`-`, `*`, `+`). Numbered markers are kept, because "2." is a number in the unit text and stripping it would drop a source literal.
- It accepts a one-token code span (`` `openunum.service` ``) or a bare path (`docs/ARCHITECTURE.md`) as a noun phrase, typed by shape as `service`, `path` or `object`. The span text is the instance id, so the core literal gate retains it.
- The predicates, frames and the rest of the grammar are unchanged.

Unit tests cover:

- `Restart \`openunum.service\`.` gets an identity;
- `Read docs/ARCHITECTURE.md.` gets an identity distinct from another path;
- multi-token code (`` `pnpm verify` ``), adverbs and extra clauses still abstain;
- numbered markers get no identity.

## Results against the bar

| Bar | Result |
| --- | --- |
| 1. Faithfulness (≤ 2 of 40 unfaithful) | **Not testable: 0 identities issued** on the harness, so there was nothing to label |
| 2. Coverage | **0 of 21,291** units, unchanged from 0.1 |
| 3. Gain (≥ 2% of discourse-on prompt tokens, QA not lower) | **0%**. Discourse-on with `--unit-identity` gives 9,310 mean prompt tokens and QA 38.5%, identical to without it. **Fail.** |
| 4. Unreachability declaration | Not triggered (ceiling 3.2%) |

**Decision:** `discourseContext.unitIdentity` stays off.

The 0.2 extractor is kept because it is faithful and harmless. It can only help the whole-message `shadowIdentity` path on short user messages, which is also off.

## What would move this

Identities on this traffic need propositions with subjects that the closed grammar does not have:

- status: `state(subject, value)` with the subject resolved from the enclosing record;
- test runs: `run` + result counts.

These need a protocol/frame extension and a scoping rule for context-bound subjects, which is a separate, versioned decision. The cheaper lever is surface-level: the discourse view's kv supersession already covers the 3,656 supersession candidates without any identity.

## Side observation

On current OpenUnum `origin/main`, discourse-on averages **9,310** prompt tokens at the 52 points (−52% against 19,586). The decision record of 2026-10-08 reports 5,860 (−70%). The difference comes from the later review fix that never shortens the current turn (`cc856b0b`). QA recall is unchanged at 38.5%.
