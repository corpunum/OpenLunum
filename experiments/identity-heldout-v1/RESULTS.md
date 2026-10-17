# Identity-projection held-out gate (ADR 0027): results

## Status 2026-10-17: PAUSED (quota); NON-VERDICT partial result

**Not a verdict.** The pre-registration ([amendments 3–4](PREREGISTRATION.md)) requires all 120 items of both runs with one extractor (Sol 6.1, medium) before any verdict. The ChatGPT quota ran out during both runs; the owner chose (2026-10-17, relayed by corpunum-6b) to **hold the gate until Sol quota is back**. If it is still unavailable on **2026-10-20**, the gate is recorded as **"stopped: quota"**. A restart with another extractor is possible only as a new run of both sets, and would be a paid Claude run needing the owner's explicit dollar approval.

| | Run A | Run B |
|---|---|---|
| Items extracted before the quota ran out | 71 of 120 | 67 of 120 |
| Parse / abstain | 37 / 34 | 35 / 32 |
| Quota-blocked, not extracted (`PROCESS_ERROR`, to be resumed) | 49 | 53 |
| Input tokens | 6.17M | 5.83M |
| Commit and served artifacts unchanged during the run | yes | yes |

Partial measures on the items extracted in both runs ([`score.mjs`](score.mjs)):

| | `lfp:2.1` | Candidate projection |
|---|---|---|
| All pairs covered in both runs (34) | 29 / 34 | 33 / 34 |
| **Bar 1 basis:** pairs covered in both runs where neither parse is a sentence copy (26) | 21 / 26 (81%) | **25 / 26 (96%)** |
| Sentence copies | 8 in each run | |
| Candidate merges of distinct sentences (bar 3) | | 0 |

**Bar 2** (merges in the adversarial, collision and contrast suites), which does not depend on the runs: rerun of `identity-projection-candidate-v1/measure.mjs` on 2026-10-17 over 2,739 identity-bearing Sem, 436 distinct `lfp:2.1` identities, 53 candidate collapse groups: **0** touch those suites.

So far bar 1 is above its 90% line on 26 qualifying pairs (≥ 20 required), and bars 2 and 3 hold. This is against my pre-registered prediction (bar 1 more likely to fail). It stays a partial result until the remaining 102 items are in.

## Earlier attempt

2026-10-17, amendment 2: SuperGemma as extractor; **not run** by its feasibility rule (1 of 16 English sentences covered at Stage 0).
