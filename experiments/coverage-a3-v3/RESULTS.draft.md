# coverage-a3-v3: results (DRAFT, 2026-11-12, waiting on the DeepSeek retry at 10:15 EET)

**Draft. Not final until DeepSeek's retry has run.** It has two endings: case 1 if DeepSeek is unavailable or fails calibration, case 2 if it passes. Everything below "Both cases" is final data.

All judge calibration here is a **model-rated calibration**: the labels come from rater `claude-blind`, not the owner (D1).

## Deviations

From [DEVIATIONS.md](DEVIATIONS.md):
- **D1:** the labels are model-rated, and the natural items contain no negatives, so kappa rests on the 8 controls.
- **D2:** a dead endpoint made the first GLM run write silent nulls. Those rows were discarded, and the call path was hardened with a preflight check.
- **D3:** NIM has retired GLM 5.3 (HTTP 410). No substitute was used.
- **D4:** DeepSeek was unreachable on its first attempt. It gets one retry before selection.
- **Not in the pre-registration:** the one multi-clause record (`A ; B`) gets R1 applied clause by clause (`render-verb-first.mjs`).

## Both cases: calibration (40 items + 20 bar controls per arm; pass = kappa ≥ 0.4, ≤ 1/8 and ≤ 1/20 controls yes)

| Judge | R0 kappa | R1 kappa | Controls yes (cal / bar) | Natural yes-rate R0 / R1 | Pass R0 / R1 | Mostly-as-no sensitivity (R1) |
|---|---|---|---|---|---|---|
| Luna (gpt-6-luna, low, Codex CLI) | 0.433 | 0.468 | 0/8, 0/20 | 66% / 69% | yes / yes | 0.375, **would fail** |
| GLM 5.3 (NIM) | – | – | – | – | unavailable (D3) | – |
| DeepSeek v4.1 flash (NIM) | *retry pending* | | | | | |
| Qwen (local) | – | – | – | – | no rig slot today | – |
| Nemotron 3 Ultra (NIM) | 0.135 | 0.101 | 0/8, 0/20 | 28% / 22% | **no / no** | 0.17, fails |

**Flag (D1), sensitivity:** Luna's R1 pass depends on how the 4 "mostly" items are scored. Scored as "does not", its R1 kappa is 0.375 and it would fail.

**Flag (review 2026-11-12), how kappa was computed.** The pre-registration says "kappa ≥ 0.4 against the owner", and the owner step labels only the 32 natural items.
- All 32 labels came back "states", so kappa over the natural items alone is undefined: there is no negative label to agree on. Under that strict reading **no judge can pass and the result is no verdict, whatever DeepSeek does**.
- `calibrate.mjs` computes kappa over all 40 items, with the 8 controls as "does not". D1 said so before any judge call. Under that reading Luna passes, but the kappa only shows that it separates real records from mismatched pairs.
- On the 32 natural items alone, Luna agrees with the rater on 21 (R0) and 22 (R1): 66% and 69%.
- Both readings are reported. **Neither supports calling Luna a validated judge of subtle record errors.**

## Both cases: Luna scoring on the 139 records (reported for every case)

| Arm | States the content | Controls yes |
|---|---|---|
| R0 (0.3 render) | 83 / 139 (59.7%) | 0 / 20 |
| R1 (verb-first) | 81 / 139 (58.3%) | 0 / 20 |

- **Render effect (R1 − R0):** −1.4 points. It cannot be told apart from noise (next point).
- **Luna does not agree with itself.** Two checks on byte-identical prompts (the Codex route runs at the host's default temperature):
  - R0 here uses exactly the prompts of coverage-a3-v2's Luna run (139 of 139 prompt hashes match). The answers differ on 27 of 139 records (19%): 16 rejected then, accepted now; 11 the other way. The totals moved from 78 to 83.
  - For 45 records the R1 text is identical to the R0 text. Luna answered differently on 9 of those 45 (20%).
- So the pre-registered "judging effect" (R0 against v2's Luna, +3.6 points) is **test-retest noise of one judge**, not an effect: same judge, same prompt, same text.
- With about 19% retest disagreement, a single Luna pass cannot resolve differences of a few points. Any future bar with this judge needs repeated calls and a majority vote.

The 48 records both v2 judges rejected, by category (`bar/categories-v2.json`), accepted by Luna:

| Category | R0 | R1 |
|---|---|---|
| A (24) | 10 | 10 |
| B (12, questions) | 1 | 1 |
| C (9) | 2 | 3 |
| D (3) | 0 | 1 |
| C + D (12) | 2 | 4, under the "not credible" line of 6 |

On the 91 records not jointly rejected in v2, Luna accepts 70 under R0 and 66 under R1.

By mood, under R0 and then R1:
- statements: 73 / 112 under both arms;
- questions: 10 / 23, then 7 / 23;
- imperatives: 0 / 4, then 1 / 4.

## Case 1: DeepSeek unavailable or fails calibration → **no verdict**

Fewer than two judges pass on R1, so under the pre-registration ("Selection") the result is **no verdict**. (Under the strict kappa reading above it is no verdict in every case.)

What the data still says, without a bar:
- R1 gave **no lift** with the only passing judge: −1.4 points, inside its own run-to-run noise.
- That judge accepts under 60% of the records under either arm. Bar 1 needs at least 80% from **each** judge.
- So bar 1 could not have passed with Luna as one of the two judges.
- The pre-registered prediction (R1 +8–15 points, Luna about 70–76% on R1) was wrong in direction and size.

Proposal to the orchestrator, following the pre-registration's "fail with no lift" reading, but flagged because it is not a verdict:
- stop the 0.21 / 0.22 line;
- keep 0.19 frozen;
- do not pre-register coverage-a3-v4 on this design.

## Case 2: DeepSeek passes calibration → it is scored, then the verdict

- **Selection:** the two passing judges with the highest R1 kappa. With Nemotron failed, that is Luna and DeepSeek.
- **Then:** `node score.mjs --judge deepseek --out bar/score-deepseek.json`, then `node score.mjs --verdict bar/score-luna.json,bar/score-deepseek.json --categories bar/categories-v2.json --out bar/verdict.json`.
- **Bar 1** under the 40-item kappa reading is already decided: Luna's R1 rate is 58.3%, below 80%, so bar 1 **fails**. Under the strict reading it is **no verdict**. The recommendation is the same either way. DeepSeek's scores still report agreement, its own lift, and the C + D check.
- **Reading:**
  - If DeepSeek's R1 lift is also under 10 points, this is "a fail with no lift". The recommendation is to drop 0.21 / 0.22 and stay on 0.19.
  - If DeepSeek lifts by 10 points or more, that is "lift for one judge only", which is not the pre-registered "lift for both". It is reported as such, and the recommendation is the same.

**Either case:** 0.21 and 0.22 stay unreleased candidates, and OpenUnum is not re-vendored.
