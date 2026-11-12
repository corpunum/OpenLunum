# coverage-a3-v3: deviations from the pre-registration

Recorded as they happen, before the step they affect. RESULTS.md repeats them.

## D1. Model-rated calibration labels (2026-11-12, before any judge call)

**Pre-registered:** the owner labels the 32 natural calibration items on `calibration/WORKSHEET.md`.

**What happened:** the owner delegated the labels (hub decision 34bf87fd, answer "You do them", relayed by corpunum-82 on 2026-11-12).
- They were given by rater **`claude-blind`**: a fresh Claude Opus 5.5 subagent with no tools and no file access.
- It saw only the worksheet's instructions, a notation key for the record format, the four-point scale and the 32 sentence/record pairs in R0 form.
- It did not see R1, the controls, any judge output, any score or any of the experiment's notes.
- Labels: `calibration/labels.json` and the ticked worksheet. The exact prompt, including a notation key that is not on the worksheet, is in `calibration/RATER_PROMPT.md` (added in review, 2026-11-12).

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

## D3. GLM 5.3 retired by NVIDIA NIM; no replacement judge (2026-11-12, before any GLM row)

GLM's preflight (D2) failed at once with `judge_unreachable:http_410`: NIM has retired `z-ai/glm-5.3`. No rows were written.

- GLM is recorded as **unavailable**, not failed. A different GLM model id would be a judge the pre-registration did not name, so no substitute is used.
- The pre-registered order then continues as written: DeepSeek, then Qwen (only with a rig slot from the coordinator), then Nemotron.
- Kimi and the other NIM models in `judges.mjs` are **not** candidates, because the pre-registration does not list them.

## D4. DeepSeek unreachable on the first attempt (2026-11-12, about 08:00 EET)

- DeepSeek v4.1 flash on NIM was `judge_unreachable`: 6 retries spent on 429, 5xx or network errors. No HTTP status was ever returned, so this is most likely rate limiting or an outage. No rows were written.
- corpunum-82 moved on to the next pre-registered judge, Nemotron.
- **The pre-registration selects the two passing judges with the highest R1 kappa, not the first two that pass.** So DeepSeek is retried once when NIM is quieter (after 10:00 EET), before selection, whatever Nemotron's result.
- If that retry is also unreachable, DeepSeek is recorded as unavailable and selection uses the judges that answered.
- Scoring with Luna started before selection, because Luna passed. If Luna is not among the two selected judges, its scoring rows are reported but not used for bar 1.

## D5. Review findings (2026-11-12, after Luna's scoring, before the DeepSeek retry result)

A fresh-eyes review by s-openlunum (requested by corpunum-82) found three things. None changes a number; all change what the numbers can support.

- **Kappa reading.** The pre-registration's "kappa against the owner" covers the 32 labelled natural items. With all 32 labelled "states", that kappa is undefined, so under the strict reading no judge can pass and the result is no verdict. D1's 40-item kappa (controls as "does not") is an interpretation that makes a pass possible. RESULTS reports both readings.
- **The "judging effect" is retest noise.** R0 uses byte-identical prompts to coverage-a3-v2's Luna run, and Luna's answers differ on 27 of 139 records (19%). On the 45 records whose R1 text equals the R0 text, it differs on 9 (20%). The pre-registration assumed the R0 comparison would measure a change of judges; with Luna selected again, it measures Luna against itself.
- **The rater saw a notation key** that is not on the worksheet. It is now committed (`calibration/RATER_PROMPT.md`).
