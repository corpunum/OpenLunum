# Guarded codec v1, stage 1: results

**Run 2026-10-29, as pre-registered (STAGE1-PREREGISTRATION.md + amendment 1). Verdict: FAIL (bar 1, savings).**
Aggregates only; the per-item data stays private on the rig. Machine-readable: `stage1/results.json`.

## Bars

| Bar | Rule | Result | Pass |
|---|---|---|---|
| 1. Savings | best of guarded / discourse+guarded <= 0.8 x discourse input tokens | discourse+guarded 121,322 vs discourse 123,161: **1.5% fewer** | **no** |
| 2. Non-inferiority | accuracy >= verbatim - 2 points | 13.6% vs 4.5% | yes |
| 3. Invariants | 0 violations in conditions 4 and 5 | 0 | yes |
| 4. Expansion | 100% exact | 100% (all omitted/shortened units) | yes |

## All conditions (12 points, 44 questions, Haiku answers, usage input tokens)

| Condition | Input tokens | Correct | Accuracy |
|---|---|---|---|
| verbatim | 223,138 | 2 | 4.5% |
| discourse | 123,161 | 5 | 11.4% |
| pruned (unguarded) | 146,826 | 2 | 4.5% |
| guarded | 214,760 | 2 | 4.5% |
| discourse + guarded | 121,322 | 6 | 13.6% |

- Unguarded pruning broke **1,629** invariants (1,536 dropped literals, 93 changed negation/modality markers).
- With the guards, 1,566 of 2,539 units (62%) on the verbatim view and 241 of 606 (40%) on the discourse view failed
  `verifyCompaction` and fell back to verbatim. LLMLingua-2 at rate 0.5 drops a literal in most units.
- Cost: $0.012 questions + $0.169 answers = **$0.18** (cap $10).

## Why savings failed

On the discourse view, compressible prose units (sentences, list items, headings, table rows) are only **48.5k of
181.5k characters (27%)**; the rest is code and tool output, kept verbatim by design. Pruning every prose unit by
half would save at most ~13%, under the 20% bar even before the fallbacks; with 40% of units falling back the
actual saving is 1.5%. So bar 1 is out of reach at this unit granularity: discourse compaction already removed most
of the prose, and what remains of the prompt is tool output.

## Measurement caveat (reported, does not change the verdict)

The answer literal was present in the prompt for only **5 of 44** items in verbatim and **14 of 44** in discourse
(the live default prompt has already dropped older history; discourse keeps more of it). 11 of 44 answers per
condition were empty. Accuracy is therefore measured on ~14 answerable items and is low for every condition; it
supports "no loss" only weakly. Accuracy on items whose literal is in the prompt: verbatim 2/5, discourse 5/14,
discourse+guarded 6/14, guarded 2/5, pruned 2/4.

## Decision

Stage 2 (Rust `lunum-codec` crate) does **not** start on this result. The guards themselves worked (0 violations,
exact expansion) and caught a real failure mode of the unguarded pruner. The next lever is the tool-output / code
share of the prompt (73% of the discourse view), not more prose pruning.
