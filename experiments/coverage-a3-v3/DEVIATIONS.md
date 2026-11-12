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
