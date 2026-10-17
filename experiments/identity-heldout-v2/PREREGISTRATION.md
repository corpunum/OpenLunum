# Identity-projection held-out gate v2 (ADR 0027, revised candidate): pre-registration

**Committed 2026-10-17, before any model call on these sentences. Self-reviewed.**

**Why a v2.** The [v1 gate](../identity-heldout-v1/RESULTS.md) failed bar 1 narrowly with Sonnet: candidate stability 23/26 = 88.5% against 90%. The owner chose "revise and re-run with a new pre-registration" (2026-10-17, relayed by corpunum-6b), with the bars unchanged.

## The revised candidate ([candidate v2](../identity-projection-candidate-v2/projection.mjs))

ADR 0027's candidate (v1), plus one rule:
- **Strip:** leading English free words, ADR 0024's articles and prepositions (a, an, the, of, in, on, at, by, for, from, to, with, as), are removed from every non-literal filler string, keeping at least one word. "a pediatrician" = "pediatrician"; "in the next room" = "the next room".

**Not included:** folding `define` into `describe`. On every recorded same-sentence pair in the repository, the fold changed exactly one result, the "good cook" sentence that suggested it ([in-sample measurement](../identity-projection-candidate-v2/result.json)). That is no evidence beyond the split itself.

**In-sample (labelled so; the strip rule was designed after seeing these):**

| Pair set | `lfp:2.1` | v1 | v2 |
|---|---|---|---|
| clc-v1 Claude | 3/11 | 7/11 | 8/11 |
| round-2 vs v17 Claude | 7/12 | 11/12 | 11/12 |
| v1 gate, Sonnet (spent) | 11/26 | 23/26 | 25/26 |
| v1 gate, Sol partial (spent) | 21/26 | 25/26 | 26/26 |

Repository scan: v2 makes 56 collapse groups, the same number as v1, and **0** touch the adversarial, collision or contrast suites.

**Known risk of the strip rule:** "in X" and "on X" become one filler, as do "to X" and "from X" when the preposition sits inside the filler. ADR 0024 already accepts this for leftover prepositions; v2 extends it to prepositions inside a filler. A leading "from" or "to" in a `source` or `destination` filler is redundant with its role; in other roles it can carry meaning. Any such merge on the held-out set counts against bar 3.

## Data ([`select.mjs`](select.mjs), deterministic)

- Seed `idgate-heldout-v2:2026-10-17`: 160 English Tatoeba sentences of 4 to 20 words found nowhere in the tracked repository. That excludes the spent v1 set (0 overlap); 5 were skipped.
- [`requests.jsonl`](requests.jsonl), bound to the frozen contract (`lunum-agent/0.19`) through package **v24** (the `__proto__` bug-fix refreeze, same contract as v23).
- **The first 120 are run**, as in v1.

## Runs

- **Extractor:** `claude-sonnet-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), on the local CLI subscription login (owner's standing approval for Sonnet on the Max plan), no API key. Item ceiling $1.00 and total $120.00 per run (notional reservation).
- A one-item pilot on a clc-v1 item (not a gate item) first confirms the v24 preflight and the model ID.
- **Run A and run B** in two clean clones at the same commit, at the same time, concurrency 1 each. A run stopped by a usage limit is resumed with Sonnet after the reset; models are never mixed.

## Bars (unchanged from v1, not relaxed)

| # | Bar |
|---|---|
| 1 | Candidate v2 stability **≥ 90%** over at least **20** sentences covered in both runs where neither parse is a sentence copy |
| 2 | **0** collapses in the adversarial, collision and contrast suites (the scan above, repeated at the run commit) |
| 3 | Every candidate merge of **distinct** sentences judged the same meaning. The owner delegated such judgements to models on 2026-10-17; if any occur, they are judged and listed for him |

Scorer: [`score.mjs`](score.mjs), the v1 scorer with the v2 projection. It reports `lfp:2.1`, v1 and v2 side by side, and is validated on the spent v1 Sonnet runs (11/26, 23/26, 25/26).

**If all three pass:** ADR 0027 is amended to the v2 candidate and `lfp:2.2` is implemented, with goldens (including the Rust `lunum-sem` crate), migration notes and a replay; `lfp:2.1` is never rewritten. **If any fails:** nothing changes and the result is published.

## Prediction

Bar 1 is closer to a pass than in v1, but not certain: the remaining unfoldable source of splits is frame choice (`describe` / `define` / `relate`), which the in-sample data shows rarely but cannot rule out on fresh sentences. My estimate: about a 60% chance of passing bar 1.
