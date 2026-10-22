# A3 baseline (frozen contract 0.19, Haiku): results

**Run 2026-10-22 08:37–09:28 UTC, before any 0.21 code was written. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md): `claude-haiku-5-5`, package v25 (`lunum-agent/0.19`), commit `effc6ec3` (clean checkout), 200 requests, concurrency 1. Ledgers and raw streams: [`reports/independent-evaluation/2026-10-22-a3c1-baseline-haiku/`](../../reports/independent-evaluation/2026-10-22-a3c1-baseline-haiku/). Score: [`baseline-score.json`](baseline-score.json).

| | Count |
|---|---|
| Items run, evidence valid | 200 / 200 (no `CONTRACT_UNBOUND`, no re-run needed) |
| Parses / abstains / failed | 78 / 122 / 0 |
| Sentence copies | 24 (31% of parses) |
| **Covered** | **54 / 200 = 27.0%** |
| Abstains that ended on a bare-string `assert.action` attempt | 12 |
| Notional cost | $1.17 (Max plan, no API charge) |

No bar is scored on the baseline; it is the reference for bar 1's "+10 points" and the change run. Compared with A0 (Sonnet on R4, a different set): coverage is similar (27.0% against 24.5%) but Haiku ends on the bare-string `action` mistake far less often (12 against 40), so step 1 alone should move this set less than A0's counterfactual suggested.
