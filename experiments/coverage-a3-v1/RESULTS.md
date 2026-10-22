# A3: coverage change, contract `lunum-agent/0.21`: results

**Run 2026-10-22. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md), with [Amendment 1](PREREGISTRATION.md#amendment-1-2026-10-22-before-the-change-run-step-2-needs-a-registered-kind) and [Amendment 2](PREREGISTRATION.md#amendment-2-2026-10-22-during-the-change-run-before-any-judging-the-judges-and-the-bar-2-pipeline). Amendment 1 is protocol 0.7 for kind `question`, plus frames 0.9. Amendment 2 names the judges and the pipeline. The baseline ([RESULTS-baseline.md](RESULTS-baseline.md)) ran before any 0.21 code existed. Nothing was changed after scoring.

## Verdicts

| # | Bar | Result | Verdict |
|---|---|---|---|
| **1** | Coverage ≥ 40 %, copies ≤ 10 % of parses, ≥ +10 points over the baseline | **121 / 200 = 60.5 %**; copies 5 / 126 = 4.0 %; baseline 54 / 200 = 27.0 %, so **+33.5 points** ([`score.json`](score.json)) | **PASS** |
| **2** | Level (b): each judge ≥ 80 % "states the content", judge agreement ≥ 75 %, each judge ≤ 2 / 20 controls | SuperGemma **114 / 121 = 94.2 %**; Nemotron 3 Ultra **56 / 121 = 46.3 %**; agreement **61 / 121 = 50.4 %**; both judges valid (0 / 20 controls answered yes) ([`bar2/agreement.json`](bar2/agreement.json)) | **FAIL** |
| **3** | Safety: 0 new merges in the adversarial, collision and contrast suites; 0 identity movement on replay; every recorded builder input without a string `action` builds the same Sem | **0 / 0 / 0.** The suites are part of `pnpm verify`, green at the freeze commit `e80193fc`. The replay covered 11,731 recorded Sems: all 3,186 identities accepted under 0.19 are unchanged and none moved from accepted to rejected (Amendment 1). Builder rebuild: 818 inputs, 0 moved | **PASS** |

**Under the pre-registration, 0.21 is not released: all three bars must hold, and bar 2 fails.** The code is on `main` as a candidate (CHANGELOG, `docs/SEMANTIC_CONTRACT.md`). Whether to revert it, or to run a new pre-registered judging step, is the owner's decision (below). The prediction had bar 1 at 55 % and named bar 2 as the risk.

## Bar 1: what moved

| | Baseline (0.19, v25) | Change (0.21, v27) |
|---|---|---|
| Parses / abstains | 78 / 122 | 126 / 74 |
| Sentence copies | 24 (31 % of parses, scored under 0.19) | 5 (4.0 %) |
| **Covered** | **54** | **121** |
| Abstains that ended on a bare-string `assert.action` attempt (step 1) | 12 | 0 |
| Questions (35 in the set) covered | 0 | **17**, all with kind `question` (step 2) |
| Sentences with I / me / my / you / your / we / us / our (113) covered | 14 | **68** (step 3) |
| Covered records with such a pronoun as a whole filler | 5 | 44 |
| Sentences with a third-person pronoun (38) that abstained | 29 | 32 (the rule against third-person fillers held) |

From [`reported.json`](reported.json) (the [`reported.mjs`](reported.mjs) script). That script scores both runs with the 0.21 core. Under that core the baseline's 23 question-as-topic copies are refused instead of counted as copies, so it shows 1 baseline copy. The 24 in the table above come from [`baseline-score.json`](baseline-score.json), scored under 0.19. Coverage is 54 either way.

The gain comes mostly from **step 3**, not step 1: deictic sentences went from 14 to 68 covered. Haiku ended on the bare-string `action` mistake only 12 times in the baseline, and step 1 recovered those. Step 2 covered 17 of 35 questions.

## Bar 2: why it fails

| | SuperGemma (Ally) | Nemotron 3 Ultra (NIM) |
|---|---|---|
| Statements (104) "states the content" | 99 | 55 |
| Questions (17) | 15 | **1** |
| Controls answered "yes" (of 20) | 0 | 0 |

- **Questions.** `generic-en-pivot/0.2` does not render `kind`, so a question record renders exactly like a statement ("R assert(subject=you, manner=at all, action=sleep)" for "Did you sleep at all?"). Nemotron rejects 16 of 17 of these. SuperGemma accepts them, because R4's prompt asks about participants, negation and modality, not mood. Amendment 2 named this limit before judging. The rendering cannot show the mood that step 2 now stores.
- **Statements.** Nemotron also rejects 49 of 104 statements, among them records that look right, such as "Tom and Mary need help." → `assert(subject=Tom and Mary, action=need help)` and "I may go to Boston tomorrow." → `may assert(subject=I, destination=Boston, action=go) @tomorrow`. Its replies carry no reason, so the cause is unknown. It answered all 20 controls correctly, so it is valid under the bar's own rule.
- **Real errors exist.** Both judges reject seven records, and SuperGemma rejects all seven:
  - imperatives filed as plain `assert` with the verb and particle lumped together ("Stop looking at me." → `action=Stop looking`; "Get off the lawn.");
  - "Have you seen my red tie?" → `action=Have you seen`, with the subject inside the action;
  - "What's your favorite music?" → `define(subject=your favorite music, definition=What)`.
  The contract asks for the question word in the role it asks about, but `define` with `definition=What` is a weak reading.
- **Not judged.** The Qwen tie-break (reported only) needs Halogen, which was busy with the pivot-el-en-v2 translations under the rig protocol. It was not run.

## Costs

- Haiku extraction (notional, Max plan, no API charge): baseline $1.17; change **$0.57 + $0.75 = $1.31**.
- Judges: SuperGemma on the Ally, about 50 minutes. Nemotron on NIM's free tier, about 75 minutes and no charge.
- Rust rendering: seconds.

## Run record

- **Change run:** `claude-haiku-5-5`, package v27 (contract `lunum-agent/0.21`, hash `cd2559d4…`), commit `e80193fc` on a clean checkout, concurrency 1. The first run, [`2026-10-22-a3c1-change-haiku`](../../reports/independent-evaluation/2026-10-22-a3c1-change-haiku/), stopped after 85 items. On item `a3c1-c80ffbf5e6c6b3a3` the runner's session gate saw a `lunum_submit_candidate` call whose source text differed from the request (`SUBMITTED_SOURCE_MISMATCH`, which also stops further launches); the last submission matched. The 115 items not run, plus that item (re-run once, as the pre-registration allows for `CONTRACT_UNBOUND`), ran in [`2026-10-22-a3c1-change-haiku-rest`](../../reports/independent-evaluation/2026-10-22-a3c1-change-haiku-rest/) at the same commit. All evidence there is valid. `requests-rest.jsonl` is in that directory.
- **Bar 2 pipeline:** [`bar2/`](bar2/).
  1. `covered.jsonl`: the 121 records.
  2. `rust-renders.jsonl`: rendered by `lunum-render`, release build of the same commit.
  3. `render-result.json`: Rust–TS render parity, **121 / 121** equal.
  4. `judgements-gemma.json` and `judgements-nim.json`: the judgements, with `.partial.jsonl` logs.
  5. `agreement.json`: the bar 2 verdict.

## What this means / owner decision

1. **Coverage problem: solved on this set** (27 % → 60.5 %, copies down from 31 % to 4 % of parses). Most of the gain comes from letting `I`, `you` and `we` be fillers. This matters for the pivot too: English produced from Greek starts with these pronouns more often.
2. **Meaning bar: not met, for two reasons.**
   - The renderer drops mood, so question records cannot be judged as questions. That calls for a pre-registered A2 / renderer change, or a judge prompt that sees `kind`.
   - One judge rejects about half of the plainly correct statements while answering every control correctly. That calls for a judge calibration step before any re-judging, similar to the owner's Greek calibration.
3. **Choices:**
   - (a) Revert 0.21 on `main` to 0.19 until a new pre-registered bar 2 passes.
   - (b) Keep 0.21 as an explicit candidate and pre-register a bar 2 re-run with a renderer that shows mood and a calibrated second judge.
   - Option (b) is the recommendation, but per ADR 0025 the bar as written failed.
