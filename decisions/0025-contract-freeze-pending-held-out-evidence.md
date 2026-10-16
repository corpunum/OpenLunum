# ADR 0025: Freeze the extraction contract until held-out evidence exists

**Status:** Accepted 2026-10-16. The owner asked for this freeze after the [2026-10-16 review](../reports/independent-evaluation/2026-10-16-fable-review/REPORT.md). Self-reviewed.

## Context

- `lunum-agent` went from 0.4 to 0.19 in three weeks; 0.12 to 0.19 took 13 days. Instruction packages went from v13 to v22.
- Every bump was justified by author-written probes, or by the same 30 round-2 sentences seen again. None was qualified on held-out data.
- 0.19 has no live run.
- The one scored re-run since round 2 (v17, contract 0.15) scored **lower** on the reviewed targets than the original run: 9/16 against 13/16 ([report](../reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md)).
- The same report shows that one sentence extracted twice by the same model gets the same identity in only 7 of 12 cases.

Changing the contract faster than it can be measured makes every earlier number stale and hides regressions.

## Decision

The following are frozen at their current versions:

| Artifact | Frozen at |
|---|---|
| Protocol | `lunum-protocol/0.6` |
| Frames | `lunum-frame/0.8` |
| Agent contract | `lunum-agent/0.19` |
| Instruction package | v22 |
| Identity projection | `lfp:2.1` |

A new version of any of them needs, in this order:
1. **A pre-registered, held-out test set**, committed before the change is written. It must not be built from sentences any earlier change was tuned on (V8, probes v1–v4, round 1, round 2).
2. **A live run on that set with the current frozen version**, to give a baseline.
3. **The change, and a live run with it** on the same set, with the pre-registered bar.

These do not need the gate:
- bug fixes that change no identity and no contract text (a replay of recorded candidates must show 0 identity movement);
- documentation;
- tests;
- work outside core: OpenUnum integration, recall and discourse records.

## The first held-out work this enables

These are not done by this ADR:
- **Identity stability across runs.** Re-run one held-out set twice with the frozen contract, and report the share of same-sentence identity agreement. The current figure is 7/12. A fingerprint change that leaves `kind` and source-undetermined term types out of identity is the one change that is already justified, and it must pass this gate like any other.
- **General-frame yield and faithfulness on fresh real text**, as in the review's step 4.
- **EN/EL convergence on pairs that the extracting model did not write**, with the owner as the Greek author and reviewer.

## Cost

Known gaps stay open while the freeze holds: the e02 and g02 over-abstention, and any frame the owner's traffic needs. That is accepted: a gap is cheaper than an unmeasured fix.
