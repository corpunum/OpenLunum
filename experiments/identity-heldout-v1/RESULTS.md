# Identity-projection held-out gate (ADR 0027): results

## Verdict 2026-10-17: FAIL (bar 1, narrowly). Extractor: Sonnet (amendment 5)

**Run against [PREREGISTRATION.md](PREREGISTRATION.md), amendment 5 (commit `94e0f81`, committed and pushed before the pilot). Self-reviewed.**

| | Run A | Run B |
|---|---|---|
| Model (requested = init = usage) | `claude-sonnet-5-5` | `claude-sonnet-5-5` |
| Auth | CLI subscription login (`apiKeySource: none`) | same |
| Items completed / not run | 120 / 0 | 120 / 0 |
| Parse / abstain | 48 / 71 | 55 / 64 |
| Invalid (abstained without calling the contract, `CONTRACT_UNBOUND`; counted not covered) | 1 | 1 |
| Commit, tracked tree and served artifacts unchanged start to end | yes | yes |
| Notional CLI cost (subscription; not billed per token) | $11.53 | $11.63 |
| Wall time | 08:01–08:31 UTC | about the same |

Raw outputs: [`reports/independent-evaluation/2026-10-17-idg1-sonnet/`](../../reports/independent-evaluation/2026-10-17-idg1-sonnet/). Scores: [score-sonnet.json](score-sonnet.json). A one-item pilot on a clc-v1 item (not a gate item) preceded the runs.

| Bar | Result | Verdict |
|---|---|---|
| 1. Candidate stability ≥ 90% on ≥ 20 non-copy pairs covered in both runs | **23 / 26 = 88.5%** (`lfp:2.1`: 11 / 26 = 42%) | **FAIL** |
| 2. 0 collapses in the adversarial, collision and contrast suites | 0 (scan of 2,739 Sem, 2026-10-17) | pass |
| 3. Every candidate merge of distinct sentences judged the same meaning | no merges | pass (vacuous) |

Over all 47 pairs covered in both runs, including sentence copies: candidate 37/47, `lfp:2.1` 19/47.

**ADR 0027 is not qualified. `lfp:2.2` is not implemented; `lfp:2.1` is unchanged.** My pre-registered prediction (bar 1 more likely to fail) held, narrowly.

### What the remaining splits are (post-hoc)

The candidate removes the label noise: on these items `lfp:2.1` agrees 11 of 26, the candidate 23 of 26. The three remaining splits are choices the projection cannot fold:
- "Tom is a good cook": `describe` with attribute "good cook" in one run, `define` with definition "good cook" in the other (frame choice, ADR 0024's stated limit);
- "Tom's father is a pediatrician": definition "pediatrician" against "a pediatrician" (an article inside or outside the filler);
- "Tom is studying in the next room": location "in the next room" against "the next room" (a preposition inside or outside the filler).

The last two are word-boundary choices of source-bound fillers. A projection that strips leading articles and prepositions from fillers would fold them, and `describe`/`define` collapsing is a contract question. **This held-out set is now spent:** any such second candidate was designed after seeing it, so it needs a fresh held-out set.

### Sentence copies are frequent with Sonnet

20 of 48 (A) and 22 of 55 (B) covered parses are whole-sentence copies, against 8 of 37 for Sol. Without the copy exclusion, both measures would look better than they are.

## Earlier attempts on this set (published as required)

### Sol 6.1 medium (amendments 3–4): paused, then superseded — NON-VERDICT

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
