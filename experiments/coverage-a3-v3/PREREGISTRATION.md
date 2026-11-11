# A3 bar-2 re-judge (coverage-a3-v3): pre-registration

**Committed 2026-11-11, before any calibration item is written, any owner label is collected, or any judge is called. Self-reviewed.**

**Decision.** The orchestrator chose option (a) on 2026-11-11, after [coverage-a3-v2](../coverage-a3-v2/RESULTS.md) failed bar 2:
- Re-judge the **existing 139 covered records** of coverage-a3-v2, with no new extraction.
- Change two things only: how the records are shown to the judges, and how the judges are calibrated.

**Release follows [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md). This experiment cannot release anything.** See [What a pass means](#what-a-pass-means).

## Question

coverage-a3-v2's two strict judges both rejected 48 records. The author's categories for them:

| Category | Count | Meaning |
|---|---:|---|
| A | 24 | The record looks right |
| B | 12 | Questions |
| C | 9 | Extraction errors |
| D | 3 | Imperatives and hortatives |

This experiment tests one claim: **the A and B rejections are caused by the render and by judges calibrated on the wrong task, not by the records.**

## Data (frozen; nothing is re-extracted)

**Records.**
- The 139 rows of [`../coverage-a3-v2/bar2/covered.jsonl`](../coverage-a3-v2/bar2/covered.jsonl), read by handle.
- Each record is paired with its sentence from [`../coverage-a3-v2/requests.jsonl`](../coverage-a3-v2/requests.jsonl).
- They are package v28, contract `lunum-agent/0.22`, renderer `generic-en-pivot/0.3`.
- No record, sentence or identity is changed.

**Controls.**
- 20 controls, seed `coverage-a3-v3-judge:2026-11-11`.
- Each control pairs a sentence with another sentence's record, using the same pairing rule as `coverage-a3-v2/judge.mjs`. The right answer is "no".

**Calibration set (new, English records).**
- 40 items from [`../coverage-a3-v1/bar2/rust-renders.jsonl`](../coverage-a3-v1/bar2/rust-renders.jsonl). Those are A3's 121 records, on different sentences from the 139.
- The 40 items are 32 natural records drawn with seed `coverage-a3-v3-calibration:2026-11-11`, plus 8 injected controls of the kind above.
- They are re-rendered with `generic-en-pivot/0.3` and shown in **both** arms' forms (below).
- No calibration item shares a sentence with the 139 or with the 20 controls.

## Arms (the only thing that varies is the text the judge reads)

| Arm | What the judge reads |
|---|---|
| **R0** | the record exactly as in coverage-a3-v2: the Rust `generic-en-pivot/0.3` render |
| **R1** (primary) | the same record, rewritten by [`render-verb-first.mjs`](render-verb-first.mjs) (written and committed before calibration). It is deterministic, offline, and makes no model call |

**R1 rules**, all mechanical, applied to the 0.3 render string:
1. **Order:** `subject` first, then `action` (or `relation` / `attribute`), then the remaining roles in their 0.3 order.
2. **Modality words become English auxiliaries before the action:**
   - `ability` → `can`
   - `must` → `must`
   - `intention` → `intends to`
   - `certainty` → `certainly`
   - `opinion` → `thinks`
3. **Negation:** `not` goes after the auxiliary, or before the action when there is no auxiliary.
4. **Mood:** `question: …?` is kept as the prefix and the trailing `?`. `imperative to you:` is kept.
5. **Labels are kept** (`object=`, `manner=`, `@time`). Nothing is paraphrased, dropped or added.

Examples the script must reproduce exactly (the script's unit test):

| 0.3 render | R1 |
|---|---|
| `R assert(subject=Tom, object=French, manner=fluently, action=speaks)` | `R assert(subject=Tom, action=speaks, object=French, manner=fluently)` |
| `R not ability assert(subject=I, recipient=you, action=help) @this week` | `R assert(subject=I, can not, action=help, recipient=you) @this week` |
| `R question: relate(subject=this bus, object=the art museum, relation=go to)?` | `R question: relate(subject=this bus, relation=go to, object=the art museum)?` |

**R1 is a judging aid, not a renderer change.** It lives in this directory, is not in `packages/` and is not served. If it wins, moving it into a renderer profile is a separate change. It would need its own ADR and a new instruction package, because the served runtime is bound.

## Judge calibration (coverage-a3-v3 calibration; replaces judge-calibration-v1 for this experiment)

**Owner step: labels.**
- The owner labels the 32 natural calibration items on a worksheet (`WORKSHEET.md`, generated): "states the content" yes / mostly / no / can't tell.
- The worksheet shows each item in R0 form only, so the labels are about the record, not the arm. The R1 text is derived after labelling.
- The 8 controls are not labelled; their answer is "no".
- This goes to the owner as a guided form through the orchestrator. Nothing below starts before the filled worksheet is committed.

**Prompt.** The English prompt in [`../judge-calibration-v1/judges.mjs`](../judge-calibration-v1/judges.mjs), unchanged.

**Pass rule, applied separately per arm.** A judge passes for an arm if all of these hold:
- Cohen's kappa ≥ **0.4** against the owner. Labels are binary: yes and mostly = states; no = does not; can't tell is dropped.
- It answers "yes" on at most **1 of the 8** calibration controls.
- It answers "yes" on at most **1 of the 20** bar controls.

**Candidate judges, in this order.**
1. Luna (`gpt-6-luna`, low effort, Codex CLI)
2. GLM 5.3 (NIM)
3. DeepSeek v4.1 flash (NIM)
4. Qwen local on the rig (only with a slot from the rig coordinator)
5. Nemotron 3 Ultra (NIM)

**Excluded:** Claude models, because Haiku produced the records. SuperGemma is also excluded: it is not reachable while the Ally tunnel is down (hub 23f1a2db).

**Selection.** The **two passing judges with the highest kappa on R1** score both arms.
- If a selected judge stops answering before it finishes, the next passing judge replaces it. That is recorded as a deviation.
- If fewer than two judges pass on R1, the result is **no verdict**.

**Sampling.** Temperature 0 where the route allows it. CLI routes run at the host's default, which is recorded, as in coverage-a3-v2. A reply that does not parse counts as "no". Network, 429 and 5xx errors are re-asked after 60 s, at most 6 times.

## Bars

| # | Measure | Bar |
|---|---|---|
| **1** | R1, all 139 records | **each** of the two judges says "states the content" on **≥ 80 %**, agreement **≥ 75 %**, each ≤ 2 / 20 controls |
| **2** | Attribution (reported, not a bar) | the same measures on R0, with the same judges. The R1 − R0 difference is the render effect. R0 against coverage-a3-v2's Luna is the judging effect |

Also reported:
- per-category acceptance of the 48 jointly rejected records (A / B / C / D) under each arm and judge;
- statements, questions and imperatives separately;
- each judge's acceptance of the **C and D** records.

**A judge that accepts most of the 12 C and D records is not reading carefully.** If either selected judge accepts more than 6 of those 12 under R1, bar 1 is reported as **not credible**, even if it holds numerically.

## What a pass means

The 80 % bar can only be met for release on **fresh** sentences, and that needs **A + B + C** together:
- **A and B:** the judging and render fixes tested here.
- **C:** the extraction fixes. Contract guidance that modality goes in `modality` or in `action` but never both, and that `will` is future, not intention. Those need a new contract (0.23) and a new extraction.

On the existing 139, the honest ceiling is about 127 / 139 = 91 %, because the 9 C and 3 D records are wrong.

- **A pass here is not a release.** It shows that the A and B rejections were the render or the judges. The next step would then be pre-registering coverage-a3-v4:
  - fresh sentences;
  - contract 0.23 with the C and D guidance;
  - R1 promoted into a renderer profile;
  - judges from this calibration;
  - all three ADR 0025 bars.
- **A fail with a credible R1 lift** (≥ 10 points for both judges) says the render matters but is not enough. Report it, and propose stopping or a different design to the orchestrator.
- **A fail with no lift** says the strict judges are reading the record content, not the format. The recommendation would then be to drop 0.21 / 0.22 and stay on 0.19.

0.21 and 0.22 stay unreleased candidates whatever the outcome. OpenUnum is not re-vendored.

## Prediction

- R1 raises acceptance for both judges by 8–15 points over R0, mostly on category A.
- Bar 1 fails narrowly. Luna on R1 is about 70–76 %, because C and D (12) plus questions that lose words (about 4) cap it near 88 %, and some strictness remains.
- My estimate that bar 1 passes: **30 %**.

## Cost and rig

- No extraction, so no Haiku cost.
- Judging: about (40 calibration + 20 controls + 139 × 2 arms) ≈ 340 calls per judge, for up to five candidates in calibration and two in scoring.
- Luna uses the ChatGPT quota at low effort. NIM is the free tier.
- Qwen runs only in a coordinator-granted slot, never during an engine window or `~/.cache/rig-quiet.hold`.
- The owner's time is the worksheet: 32 items, about 20 minutes.

## Order of work

1. This file is committed first.
2. Then `render-verb-first.mjs` and its test (the three examples above, plus R1 applied to all 139 records without error).
3. Then `prepare.mjs`, which writes the calibration items and `WORKSHEET.md` and the control pairs.
4. The owner fills the worksheet, and the filled worksheet is committed.
5. Calibration runs, then bar 1 scoring.

Results go to `RESULTS.md`, with deviations listed. Steps 2 and 3 may be implemented by an OpenUnum worker on the local model; their output is reviewed before step 4.
