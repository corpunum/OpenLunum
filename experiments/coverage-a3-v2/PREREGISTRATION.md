# A3 bar-2 re-run, contract `lunum-agent/0.22` candidate: pre-registration

**Committed 2026-10-23, before any model call on these sentences and before any judge is calibrated. Self-reviewed.** The owner's decision of 2026-10-22 on [A3](../coverage-a3-v1/RESULTS.md): keep 0.21 as an unreleased candidate, fix what failed bar 2, and re-test. The fixes are [ADR 0031](../../decisions/0031-mood-renderer-and-imperative-frames.md): the renderer `generic-en-pivot/0.3` shows mood; contract 0.22 says how to write imperatives; and the judges are calibrated first ([judge-calibration-v1](../judge-calibration-v1/PREREGISTRATION.md)). Release follows [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md): all bars must hold, and the release itself is the orchestrator's call.

## Data ([`select.mjs`](select.mjs) → [`requests.jsonl`](requests.jsonl), [`selection.json`](selection.json), deterministic)

**200 fresh Tatoeba English sentences** (CC-BY 2.0 FR), 4 to 20 words, seed `coverage-a3-v2:2026-10-23`. None is found anywhere else in the tracked repository, so none of A3's 200, R4, the pivot pairs, the Greek calibration worksheet, A0 or any probe is reused. 36 candidates were skipped because they appear elsewhere. 35 of the 200 end with "?". Requests are bound to package **v28** (contract `lunum-agent/0.22`, hash `83140518…`). The author has not read the sentences; the selection prints counts only.

The four imperative examples in contract 0.22 come from A3's failures. They are not in this set.

## Run

`claude-haiku-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), package v28, concurrency 1, item ceiling $1.00 (as A3). Invalid evidence (`CONTRACT_UNBOUND`) is re-run once into a `-rerun` directory; still invalid counts as not covered. A run stopped by a usage limit resumes with Haiku; models are never mixed.

**No baseline run on this set.** A3 measured the 0.19 baseline (27.0 % on its own set). Bar 1's "+10 points" clause is not re-measured; the difference to A3's baseline is reported only. Bar 1 here is the absolute part.

## Bars

| # | Measure | Bar |
|---|---|---|
| 1 | Coverage (covered = valid parse with an `lfp:2.1` identity, not a sentence copy; [`score.mjs`](score.mjs)) | **≥ 40 %** of the 200, with sentence copies **≤ 10 %** of parses |
| 2 | Level (b) on covered items: does the record state the sentence's content (who did what to whom, negation, modality, **mood**)? Rust `generic-en-pivot/0.3` renders (Rust–TS parity must be exact first), judged with the calibrated English prompt ([`judges.mjs`](../judge-calibration-v1/judges.mjs)) by **two judges that passed judge-calibration-v1**, chosen by its selection rule; 20 seeded controls (seed `coverage-a3-v2-judge:2026-10-23`); a judge is valid only with at most 2 of 20 controls answered "yes" | **≥ 80 %** "states the content" by **each** judge, and judge agreement **≥ 75 %**; needs ≥ 30 covered items |
| 3 | Safety of 0.22 over 0.21 | **0** new merges in the adversarial, collision and contrast suites (`pnpm verify`); **0** identity movement: v28's served runtime differs from v27 only in `agent-native.js` (contract text, one diagnostic) and `render.js`; the builder rebuild check moves **0** of 818 recorded inputs. Checked before this run (ADR 0031) |

Bars 1 and 3 of A3 passed for 0.21; this re-run re-checks bar 1 on fresh data under 0.22. **If all three bars hold, the report proposes releasing 0.21 + 0.22 (protocol 0.7, frames 0.9, package v28) to the orchestrator; nothing is released by this experiment.** If fewer than two judges pass calibration, bar 2 is not scored and the result is "no verdict".

A reply that does not parse counts as "no". A 429, 5xx or network failure is re-asked after a minute, at most 6 times.

**Reported, not bars:** questions covered and how many carry kind `question`; imperative records (kind `instruction`/`command`) and how many still have a subject; sentences with I/you/we covered; records both judges reject (listed); Qwen tie-break on Halogen only if it is free (rig protocol); notional cost.

## Prediction

- Bar 1 passes, about 55–60 % (A3 had 60.5 % under 0.21; 0.22 changes only imperatives).
- Bar 2: SuperGemma above 85 %; the second judge, if it is not Nemotron, above 80 %; agreement about 80 %. Bar 2 passing is my estimate at 55 %. The risk is that the calibration set is Greek round trips, not English records, so a calibrated judge may still behave differently on records.

## Exact commands

```bash
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-23-a3c2-haiku \
  --requests experiments/coverage-a3-v2/requests.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v28.json \
  --model claude-haiku-5-5 --total-budget-usd 200 --item-budget-usd 1.00 --timeout-ms 300000
R=reports/independent-evaluation/2026-10-23-a3c2-haiku
node experiments/coverage-a3-v2/score.mjs --requests experiments/coverage-a3-v2/requests.jsonl --runs $R --emit experiments/coverage-a3-v2/bar2/covered.jsonl
crates/lunum-render/target/release/lunum-render --profile generic-en-pivot/0.3 < experiments/coverage-a3-v2/bar2/covered.jsonl > experiments/coverage-a3-v2/bar2/rust-renders.jsonl
node experiments/coverage-a3-v2/score.mjs --requests experiments/coverage-a3-v2/requests.jsonl --runs $R --rust experiments/coverage-a3-v2/bar2/rust-renders.jsonl --out experiments/coverage-a3-v2/score.json
node experiments/coverage-a3-v2/judge.mjs --result experiments/coverage-a3-v2/score.json --requests experiments/coverage-a3-v2/requests.jsonl --judge <j> --out experiments/coverage-a3-v2/bar2/judgements-<j>.json
node experiments/coverage-a3-v2/judge.mjs --agreement experiments/coverage-a3-v2/bar2/judgements-<a>.json,experiments/coverage-a3-v2/bar2/judgements-<b>.json
```
