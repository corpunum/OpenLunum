# A3: coverage change, contract `lunum-agent/0.21` (ADR 0025): pre-registration

**Committed 2026-10-22, before any model call on these sentences and before any 0.21 code is written. Self-reviewed.** The owner approved A3 as contract 0.21 under [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md) on 2026-10-22, in this order: (1) the bare-string `action` repair, (2) a question form of the general frames, (3) `I`, `you`, `we` as valid fillers. This follows ADR 0025's path: held-out set → baseline under the frozen contract → change → the same run → bars. The causes and the expected size of each come from [A0](../abstention-shapes-v1/RESULTS.md), which used R4 only; the author has read 3 of these 200 sentences (the first lines printed by the selection script) and nothing else.

## Data ([`select.mjs`](select.mjs) → [`requests.jsonl`](requests.jsonl), [`selection.json`](selection.json), deterministic)

- **200 Tatoeba English sentences** (CC-BY 2.0 FR, in the repository), 4 to 20 words, seed `coverage-a3-v1:2026-10-22`, **none found anywhere else in the tracked repository** at this commit (so no overlap with R4, A0, the pivot pairs P1–P160 and D1–D20, the ADR 0027 gates or any probe). 18 candidates were skipped because they appear elsewhere.
- Requests bound to package **v25** (contract `lunum-agent/0.19`, hash `b6fdda4c…`) for the baseline; the change run uses the same texts and handles, rebound to the 0.21 package by re-running the same binding with the new contract hash (handles are `a3c1-` + the hash of the text, so they do not move).
- Not checked against the Greek calibration worksheet that another worker is producing in parallel (`experiments/pivot-el-en-v1/calibration/`, not yet committed); any overlap found later is reported.

## The change (written after the baseline run, in this order)

Contract **`lunum-agent/0.21`**, instruction package **v27** (v26 stays reserved for the parked [ADR 0029](../../decisions/0029-greek-source-bound-frames.md)). Frames 0.8, protocol 0.6 and `lfp:2.1` are unchanged.

1. **Bare-string `action`.** On a role marked `lexicalVerb` (today only `assert.action`), the candidate builder writes a string filler as a text term, underscores read as spaces (`"listened_to"` → `{"type":"text","value":"listened to"}`), exactly the repair A0 replayed. A string on a predicate-vocabulary `action` (`allow`, `prohibit`) is unchanged. The contract line for the role says so. No recorded identity can move: a string `action` on `assert` never received one.
2. **Questions.** The general frames get a question form: `kind` carries interrogative mood and the clause holds the question's words; `topic` keeps headings and labels only.
3. **Deictic fillers.** One contract sentence: a pronoun of the speaker or addressee (`I`, `you`, `we`), as written, is a valid filler of a general frame. The operational-frame rule ("never fill an agent with you") stays for operational frames. Third-person pronouns stay abstains.

Steps 2 and 3 are designed from A0 (R4) evidence only. **There is no intermediate run on this set**: the bars below are measured once, on the complete 0.21. Step 1's own effect is visible in the reported count of abstains that end on a bare-string `action` attempt (baseline against change).

## Runs

| Run | Contract / package | Extractor |
|---|---|---|
| **Baseline** | frozen `lunum-agent/0.19`, package v25 | `claude-haiku-5-5` through [`run-claude-code-source-only.mjs`](../../scripts/research/run-claude-code-source-only.mjs), concurrency 1, item ceiling $1.00 |
| **Change** | `lunum-agent/0.21`, package v27 | the same |

**Haiku, not Sonnet** (owner's cost decision of 2026-10-22, as for [pivot-el-en-v1](../pivot-el-en-v1/PREREGISTRATION.md) amendment 1). Results are therefore comparable between the two runs, not with R4 (Sonnet, 24.5%). Invalid evidence (`CONTRACT_UNBOUND`) is re-run once into a `-rerun` directory; still invalid counts as not covered. A run stopped by a usage limit resumes with Haiku; models are never mixed.

## Bars (on the change run; the baseline is reported next to it)

Covered = a valid parse with an `lfp:2.1` identity that is not a sentence copy (`record()` of parallel-document-v1, as R4). Scored by [`score.mjs`](score.mjs) (committed now; checked on R4's ledgers, where it reproduces 49 covered, 29 copies and A0's 40 bare-string-action abstains).

| # | Measure | Bar |
|---|---|---|
| 1 | Coverage | **≥ 40%** of the 200 (the plan's bar), with sentence copies **≤ 10%** of parses, **and** at least **10 percentage points** above the baseline run (the change must cause the gain; A0's counterfactual for step 1 alone on R4 was +18.5 points) |
| 2 | Level (b) on covered items: does the record state the sentence's content (who did what to whom, negation, modality, mood)? Judged with R4's prompt ([`judge.mjs`](../roundtrip-en-v1/judge.mjs)) on the Rust `generic-en-pivot/0.2` rendering, by **two judges from vendors other than the extractor**: SuperGemma on the ROG Ally and a free hosted model (NVIDIA NIM or opencode free, chosen and named before judging), Qwen as tie-breaker for reporting only. Each judge is valid only if it says "yes" to at most 2 of 20 seeded controls | **≥ 80%** "states the content" by **each** judge, and judge agreement **≥ 75%** |
| 3 | Safety | **0** new merges in the adversarial, collision and contrast suites; **0** identity movement on a replay of every recorded candidate in the repository; and every recorded `lunum_build_candidate` input that has no string on a `lexicalVerb` role builds the identical Sem under 0.21 |

All three must hold for 0.21 to be released. A bar with too few items (bar 2 needs ≥ 30 covered) is a non-verdict.

**Reported, not bars:** abstains ending on a bare-string `action` attempt (baseline, change); sentence copies; questions covered; covered items with an `I` / `you` / `we` filler; third-person-pronoun abstains; notional cost.

## Prediction

- Baseline (Haiku, 0.19): coverage between 10% and 30%; the bare-string `action` mistake is at least as common as Sonnet's.
- Change: bar 1 passes, my estimate 55%. Step 1 should recover most bare-string abstains; questions remove most copies; cause 3 is a reading, not a measurement (A0 had no free text).
- Bar 2 is the risk: question records and deictic fillers are new shapes for the judges.

## Cost

Two runs of 200 Haiku extractions. The per-item cost is taken from the pivot-el-en-v1 Haiku runs before the baseline starts; the baseline runs now only if its estimate is under $10 notional, otherwise this pre-registration is the stopping point and the command below is handed to the owner. Judges: Ally time and a free hosted tier.

## Exact commands

```bash
# baseline (clean checkout at or after this commit, before any 0.21 code)
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-22-a3c1-baseline-haiku \
  --requests experiments/coverage-a3-v1/requests.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v25.json \
  --model claude-haiku-5-5 --total-budget-usd 200 --item-budget-usd 1.00 --timeout-ms 300000
# change (after 0.21 steps 1-3 and package v27 are committed; requests rebound to the v27 contract hash)
node scripts/research/run-claude-code-source-only.mjs reports/independent-evaluation/2026-10-XX-a3c1-change-haiku \
  --requests experiments/coverage-a3-v1/requests-v27.jsonl --package experiments/natural-development-v8/extraction/public-instruction-package-v27.json \
  --model claude-haiku-5-5 --total-budget-usd 200 --item-budget-usd 1.00 --timeout-ms 300000
node experiments/coverage-a3-v1/score.mjs --requests experiments/coverage-a3-v1/requests.jsonl \
  --baseline reports/independent-evaluation/2026-10-22-a3c1-baseline-haiku --change reports/independent-evaluation/2026-10-XX-a3c1-change-haiku --out experiments/coverage-a3-v1/score.json
```

## Amendment 1 (2026-10-22, before the change run): step 2 needs a registered kind

**Committed with the 0.21 code and before any model call under 0.21.** The only model calls on these 200 sentences so far are the baseline run. The bars, data, extractor and scorer are unchanged.

Step 2 says "`kind` carries interrogative mood". Protocol 0.6 has no interrogative kind: its 16 kinds are all declarative or directive. An `x-` kind is not protocol-canonical and gets no identity. "Protocol 0.6 unchanged" and step 2 therefore cannot both hold. The change resolves this in favour of step 2:

| | Pre-registration | As built |
|---|---|---|
| Protocol | `lunum-protocol/0.6` | **`lunum-protocol/0.7`**: one kind added, `question`. The change is additive. The identity projection tag stays `lunum-protocol/0.1`, so no existing identity moves (replay below) |
| Frames | `lunum-frame/0.8` | **`lunum-frame/0.9`**: only the `topic` description changes ("…or question" is removed; a whole question is not a topic). Roles and requirements are unchanged |
| `lfp:2.1`, instruction version | unchanged | unchanged |

Step 2 has two parts:
- **Contract text.** A question uses the general frame its words have, with kind `question`. The question word goes, as written, in the role it asks about. do/does/did may be left out.
- **Source-bound check.** A `topic` whose subject is a whole question that ends the source (the existing "sentence in disguise" test, now also on sources ending with "?") is refused (`questionAsTopic`). The refusal message names the fix. A one-word question ("Why?") stays a valid label.

Step 3 is one contract sentence, as pre-registered. The operational-frame rule ("never fill an agent with you") is unchanged. Core already accepted `I`, `you` and `we` as fillers.

**Bar 3, checked before the run** (offline, on the committed code):
- **Builder rebuild** ([`rebuild-check.mjs`](rebuild-check.mjs)): 818 recorded inputs, 0 missing, **0 moved** without a string action, 215 of 222 string-action inputs now build.
- **Identity replay** ([`scripts/replay-lfp21-identity.mjs`](../../scripts/replay-lfp21-identity.mjs), 0.19 dist against 0.21 dist): 11,731 distinct recorded Sems. **All 3,186 identities accepted under 0.19 are unchanged.** 0 Sems went from accepted to rejected. 2 Sems moved the other way: golden mutants with `kind: "question"` that 0.19 rejected as an unknown kind now get an identity. They are new identities, not moved ones.
- **Rust parity:** `lunum-sem`, `lunum-render` and `lunum-store` tests pass against the regenerated registry data and goldens.
- **Merges in the adversarial, collision and contrast suites:** checked by `pnpm verify` (`eval:smoke` and the core suites) at the freeze commit.
