# coverage-a3-v3: deviations from the pre-registration

Recorded as they happen, before the step they affect. RESULTS.md repeats them.

## D1. Model-rated calibration labels (2026-11-12, before any judge call)

**Pre-registered:** the owner labels the 32 natural calibration items on `calibration/WORKSHEET.md`.

**What happened:** the owner delegated the labels (hub decision 34bf87fd, answer "You do them", relayed by corpunum-82 on 2026-11-12).
- They were given by rater **`claude-blind`**: a fresh Claude Opus 5.5 subagent with no tools and no file access.
- It saw only the worksheet's instructions, a notation key for the record format, the four-point scale and the 32 sentence/record pairs in R0 form.
- It did not see R1, the controls, any judge output, any score or any of the experiment's notes.
- Labels: `calibration/labels.json` and the ticked worksheet.

**Distribution:** 28 yes, 4 mostly (items 6, 7, 10, 16), 0 no, 0 can't tell. Binary: 32 of 32 natural items "states".

**Consequences, stated before any judge is called:**
- Every claim built on this calibration says **"model-rated calibration"**. It is not owner-validated.
- Claude models remain excluded as judges, as pre-registered. The rater is a Claude model, so a judge that agrees with it agrees with a Claude rating, not a human one.
- **The natural items contain no negative label.** Kappa is computed over the 40 calibration items, and its only "does not" labels are the 8 injected controls. A judge can therefore reach kappa ≥ 0.4 by telling real records from mismatched sentence/record pairs. That says nothing about whether it rejects a subtly wrong record. The control limits (≤ 1/8, ≤ 1/20) test the same separation.
- So a passing calibration is **weaker evidence** than the pre-registration intended. RESULTS.md reports, for each judge, its yes rate on the 32 natural items as well as kappa.
- No result can turn on a can't-tell item, because there are none. If a judge's pass or fail changes when the 4 "mostly" items are treated as "does not", RESULTS.md flags it. That check is reported without a bar.

## D2. GLM calibration run discarded as an operational failure; the judge call path is hardened (2026-11-12)

**What happened:** the first GLM (NIM) calibration run was stopped by corpunum-82 at 75 rows. Every row had an empty reply and `states: null`.
- `judges.mjs` `ask()` treated any HTTP 4xx (for example 401, 403, or 404 for a retired model id) as a normal reply and parsed its missing content as `''`.
- A reasoning model that returns its answer only in `reasoning_content` would have produced the same thing.
- These rows carry **no signal**: they are a dead endpoint, not 75 "no" answers. They were moved out of the experiment (to the owner's local archive) and are not used. DeepSeek had not started.

**Changes, before any NIM judge row counts:**
- `ask()` now throws `judge_unreachable:http_<status>` on any non-2xx except 429 and 5xx, which are still re-asked after 60 s.
- When `content` is empty, it reads `message.reasoning_content` (or `reasoning`) and marks the row `fromReasoning`.
- It returns the HTTP status and `finish_reason`, and `calibrate.mjs` writes both into every row.
- The verdict is taken from the **last** JSON object in the reply, and the reply excerpt is its last 200 characters.
- `calibrate.mjs` runs a one-call **preflight** per judge, on a synthetic statement that is in no item set. The run does not start unless that call parses to a verdict.
- The prompt is unchanged byte for byte, so the calibration and scoring prompts stay identical.

**Not affected:** Luna goes through the Codex CLI path, which did not change. Its run uses the module as it was loaded, and its rows have no status field.

**Historical runs:** judge-calibration-v1 and coverage-a3-v2 share this file. Their committed results were produced with the old parser and stand as recorded. A rerun of either would use the hardened path, and that would have to be recorded there.
