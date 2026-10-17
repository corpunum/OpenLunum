# Identity-projection held-out gate v2: results

## Verdict 2026-10-17: FAIL (bar 1)

**Run against the [pre-registration](PREREGISTRATION.md) (commit `89a28a59`, pushed before the pilot). Extractor `claude-sonnet-5-5` on the CLI subscription login. Self-reviewed.**

Both runs were interrupted by a Claude usage limit (A after 104 items, B after 111). As pre-registered, the remaining items (A 17, B 10, including one provider-error item each) were resumed with the same extractor, package (v24) and clean clones at the same commit, into `-rest` directories. All 120 items of both runs have an outcome; commit, tracked tree and served artifacts were unchanged throughout.

| | Run A | Run B |
|---|---|---|
| Parse / abstain | 53 / 67 | 48 / 72 |
| Invalid (`CONTRACT_UNBOUND`, not covered) | 2 | 4 |
| Sentence copies among parses | 21 | 21 |
| Notional cost (subscription) | $10.39 + $1.90 | $10.74 + $1.18 |

Raw outputs: [`reports/independent-evaluation/2026-10-17-idg2-sonnet/`](../../reports/independent-evaluation/2026-10-17-idg2-sonnet/). Scores: [score-sonnet.json](score-sonnet.json).

| Bar | Result | Verdict |
|---|---|---|
| 1. Candidate v2 stability ≥ 90% over ≥ 20 non-copy pairs covered in both runs | **18 / 22 = 81.8%** (v1 16/22, `lfp:2.1` 9/22) | **FAIL** |
| 2. 0 collapses in adversarial, collision and contrast suites | 0 (v2: 56 collapse groups in the repository, none in suites) | pass |
| 3. Every merge of distinct sentences judged the same meaning | no merges | pass (vacuous) |

Over all 42 pairs covered in both runs (copies included): v2 32/42, `lfp:2.1` 18/42.

My prediction (about 60% chance of passing bar 1) was wrong.

### The four remaining splits (post-hoc)

| Sentence | Run A | Run B | Cause |
|---|---|---|---|
| "Tom doesn't speak French." | `describe`, attribute "speak French" | `assert`, action "speak", object "French" | frame choice |
| "There is a map on the wall." | `describe`, subject "There is a map" | `assert`, action "There is", object "a map" | frame choice |
| "Let me see your ticket, please." | theme "your ticket" | theme "ticket" | possessive kept or dropped |
| "We have to finish everything before Monday morning." | time as a bare string | time as a typed `time` literal | literal typing |

## Reading

- The candidate projections work on what they target: label and form noise. Across both gates, `lfp:2.1` agreed on 11/26 and 9/22 qualifying pairs, v1 on 23/26 and 16/22, v2 on 25/26 (in-sample) and 18/22 (held-out).
- **Frame choice between the general frames (`describe` / `define` / `assert` / `relate`) is now the main source of splits.** A projection cannot fold it without merging sentences that differ in meaning; it is a contract question (which frame a sentence of a given shape must use), as ADR 0024 stated.
- Two held-out gates have now failed bar 1. Tuning the projection again on what the second gate showed (possessives, literal typing) would continue fitting the projection to observed splits.
- Recommendation: **park ADR 0027 as a projection change.** Take frame determinism up as a contract change (deterministic frame-choice rules for copular, existential and transitive sentences), with its own held-out pre-registration under ADR 0025. `lfp:2.1` is unchanged.
