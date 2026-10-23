# A3 bar-2 re-run, contract `lunum-agent/0.22` candidate: results

**Run 2026-10-22/23. Self-reviewed.** Pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md) at commit `e45dd0a4`. The judges are from [judge-calibration-v1](../judge-calibration-v1/RESULTS.md). There are **deviations from the pre-registration** in how bar 2 was judged (listed below). Nothing was changed after scoring.

## Verdicts

| # | Bar | Result | Verdict |
|---|---|---|---|
| **1** | Coverage ≥ 40 %, copies ≤ 10 % of parses | **139 / 200 = 69.5 %**; copies 3 / 142 = 2.1 % ([`score.json`](score.json)). A3's baseline under 0.19, on a different set, was 27.0 % (reported only) | **PASS** |
| **2** | Two calibrated judges, each ≥ 80 % "states the content", agreement ≥ 75 %, each ≤ 2 / 20 controls | Luna (calibrated) **78 / 139 = 56.1 %**; Nemotron (not calibrated, owner override) **45 / 139 = 32.4 %**; agreement **80 / 139 = 57.6 %**; both 0 / 20 controls | **FAIL** |
| **3** | 0 new merges in the suites; 0 identity movement; builder rebuild 0 moved | `pnpm verify` green; v28's served runtime differs from v27 only in `agent-native.js` and `render.js`; rebuild 0 of 818 moved ([ADR 0031](../../decisions/0031-mood-renderer-and-imperative-frames.md)) | **PASS** |

**0.21 + 0.22 stay unreleased candidates.** Bar 2 fails even under the substitute judges. The only calibrated judge that scored every record accepted 56 %, far under 80 %. The two judges also disagree too much for any verdict to rest on them.

## Deviations from the pre-registration

1. **The scoring judges were substituted.** The pre-registered rule selected DeepSeek v4.1 flash and GLM 5.3 on NIM's free tier, and both passed calibration. NIM then stopped answering for hours. DeepSeek returned 1 bar-2 judgement and GLM 28 of 159; their partial logs are kept. With the owner's approval, the coordinator then used:
   - **Nemotron 3 Ultra.** It **failed** calibration (kappa 0.271). The owner overrode this, and the override is recorded in the file's `summary.deviation`.
   - **Luna** (`gpt-6-luna`, low effort, Codex CLI). Luna was not on the pre-registered list. It was calibrated on the same items before it judged (kappa 0.652, PASS) and then scored bar 2.
   - The **same DeepSeek model on opencode's free tier** was tried first. It stopped answering after 45 of 60 calibration items, so it was never calibrated and not used.
2. **Temperature.** Luna, and the opencode DeepSeek attempt, ran through CLIs at the host's default temperature, not the pre-registered 0.
3. **Retry rule for the CLI judges.** CLI judges retry up to 5 times, 30 s apart, on a non-zero exit. The pre-registration said 6 times, 60 s apart, on 429, 5xx or network errors. The CLI judges also read the last `{…}` in the output. No reply from Luna or Nemotron failed to parse.
4. **Qwen tie-break is partial.** It was stopped at 85 of the 139 records because of the rig windows. It reached no controls, so it is not a valid judge even for reporting.
5. **One extraction row was invalid** (`EVENT_OR_SOURCE_UNBOUND`, a session-integrity flag). It was an abstain and counts as not covered. The pre-registration allowed a re-run only for `CONTRACT_UNBOUND`, so it was not re-run.

## Bar 2 in detail

| | Luna (calibrated) | Nemotron (override) | Qwen (partial, 85) | GLM (partial, 28) |
|---|---|---|---|---|
| Statements (112) | 69 (62 %) | 37 (33 %) | | |
| Questions (23, kind `question`) | 9 (39 %) | 7 (30 %) | | |
| Imperatives (4, kind `instruction`) | 0 | 1 | | |
| All records | **78 / 139 = 56 %** | **45 / 139 = 32 %** | 76 / 85 = 89 % | 27 / 28 = 96 % |
| Controls answered "yes" | 0 / 20 | 0 / 20 | not reached | not reached |
| Agreement with Luna | — | 57.6 % | 50 / 85 | 21 / 28 |

Four judges passed calibration. On records they split into two groups:
- **Lenient:** Qwen and GLM accept almost everything they saw.
- **Strict:** Luna, and Nemotron even more so, reject about half.

Every judge rejected every control. So the disagreement is about what counts as "the content" of a correct-looking record, not about telling right from wrong records. The Greek calibration did not predict this split: it measures paraphrase judgement on Greek pairs, not how a judge reads a record.

## Why records fail: the 48 records both Luna and Nemotron reject

The categories are the author's reading of each record against its sentence (list below). Qwen judged 28 of the 48 and said "states" on 24; GLM judged 7 and said "states" on 6.

| Category | Count | What it is |
|---|---|---|
| **A. The record looks right; rejection is judge strictness or how the code reads** | **24** | e.g. "Tom speaks French fluently." → `assert(subject=Tom, object=French, manner=fluently, action=speaks)`; "I can't help you this week." → `not ability assert(subject=I, recipient=you, action=help) @this week`. Possible renderer causes: `action` prints last after all other roles (role order); modality words (`ability`, `intention`, `certainty`) are bare tokens; clause-like objects ("that Mary was tired") are opaque text |
| **B. Questions (mood shown as `question: …?`)** | **12** | "Why are you running?" → `R question: assert(subject=you, reason=Why, action=running)?`. Most look right. Two lose words ("for a living" → `purpose=a living`; "What makes you happy?" → `action=makes you happy`). Two passives ("When was the book written?") lose the voice. "Can you tell me…?" is a request, not an ability question |
| **C. Extraction errors** | **9** | modality written twice (`intention … action=intend to go back`, `must … have to make`, `ability … know how to drive`, `intention … want to help`): 4; future or "never" read as a modality ("I'll help you if possible" → intention; "Tom will never understand" → `not certainty`): 2; passive lost ("Tom was sentenced to…" → `subject=Tom, action=sentenced`): 1; vocative inside the object ("I love you, Tom." → `object=you, Tom`): 1; amount in the wrong role (`object=a lot`): 1 |
| **D. Imperatives and hortatives** | **3** | "Come and eat some chocolate cake." → `action=Come, object=eat some chocolate cake` (coordinated imperatives not split); "Let's go see Tom." → `imperative to you` with `action=Let's go see` (a hortative includes the speaker; 0.3 has no form for it); "Tell Tom that I won't come." → `notify(recipient=tom, …)` |

**Next fix, in order of size:**
1. **Judging (A, 24, and part of B).** The bar cannot be met while calibrated judges disagree by 30+ points on the same records. Calibrate on English record items with owner labels, not only Greek pairs, and/or render level-(b) records as plain English. The planned `en-natural` writer (A2) would let judges compare sentence with sentence. The role order puts `action` last; trying verb-first, which is the reading order, is a cheap renderer experiment.
2. **Extraction (C, 9):** contract guidance that a modal verb goes in `modality` or in `action`, never both; and that `will` is future, not intention.
3. **Imperatives (D, 3):** coordinated imperatives as `also` clauses; a hortative form for "Let's".

### The 48 records

A: 1 Tom knew that Mary was tired · 2 Tom speaks French fluently · 3 I can't help you this week · 4 I believe you understand me · 7 I came as fast as I could · 8 I don't swim very well · 9 We all know that Tom is guilty · 12 Nothing is more important than health · 18 You must get rid of that bad habit · 23 Tom has left the city · 28 Tom leaned over to kiss Mary · 29 I saw Tom kiss Mary · 30 I advised you not to buy this house · 32 Tom doesn't know when Mary will be here · 34 Tom told me that I should be more careful · 35 My uncle came to see me · 39 We waited till 2:30 · 40 Tom asked me to stay · 41 I don't know why I did it · 44 I'm afraid of you · 45 I'm trying to be happy · 46 Tom knows something isn't right · 47 Tom decided not to answer the question · 48 You promised you wouldn't drink today.
B: Why are you running? · What makes you happy? · What happened in October? · Where did you find the key? · Why do you lie? · Why don't we sit? · Who owns this land? · What do you do for a living? · When was the book written? · Can you tell me what happened? · Where are you going to plant that tree? · What are you cooking?
C: I intend to go back to Boston · We have to make some changes · I know how to drive a car · We want to help, but we can't · I'll help you if possible · Tom will never understand · Tom was sentenced to one year of probation · I love you, Tom · Tom drank a lot at the party.
D: Come and eat some chocolate cake · Let's go see Tom · Tell Tom that I won't come.

The full list with each record's code comes from `node judge.mjs --agreement bar2/judgements-luna.json,bar2/judgements-nemotron.json` (`bothReject`) and `score.json`.

## Reported

- Questions: 23 of 35 covered, all with kind `question` (A3: 17 of 35).
- Imperative records: 4, none with an inserted subject.
- Sentences with I/you/we covered: 76 of 110.
- The prediction had bar 1 at 55–60 % (actual 69.5 %) and bar 2 passing at 55 % (it failed).

## Costs

- Haiku extraction: **$1.32** notional (Max plan, no API charge). 200 items, 64 min, commit `e45dd0a4`, clean checkout.
- Judges: NIM free tier (no charge); Luna through the ChatGPT quota, 219 Codex calls at low effort (60 for calibration, 159 for bar 2); Qwen local. Wall time was dominated by NIM outages, about 12 h end to end.

## Run record

- Extraction: [`reports/independent-evaluation/2026-10-23-a3c2-haiku`](../../reports/independent-evaluation/2026-10-23-a3c2-haiku/). 142 parses and 58 abstains; one row is invalid (above).
- Bar 2 pipeline in [`bar2/`](bar2/):
  - `covered.jsonl`;
  - `rust-renders.jsonl` (Rust `generic-en-pivot/0.3`; parity with TS 139 / 139);
  - `judgements-luna.json` and `judgements-nemotron.json`, both complete, with `.partial.jsonl` logs;
  - partial logs for Qwen, GLM and DeepSeek.
