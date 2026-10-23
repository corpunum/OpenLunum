# Judge calibration v1: results

**Run 2026-10-22/23. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md) (commit `e45dd0a4`), no amendment. Scored by [`calibrate.mjs --report`](calibrate.mjs) → [`calibration.json`](calibration.json).

## Verdicts

Owner labels: 31 labelled non-control Greek items (29 equivalent, 2 different; 1 can't tell dropped). Pass = kappa ≥ 0.4, ≤ 1 of 8 Greek controls missed, ≤ 1 of 20 A3 controls missed.

| Judge | Vendor | Kappa (binary) | Agreement | Kappa (strict) | Owner eq → judge "not" | Owner different → judge "same" | Greek controls missed | A3 controls missed | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| SuperGemma `supergemma4-Q5_K_M` (Ally) | Google | **0.382** | 83.9 % | 0.456 | 5 | 0 | 0 / 8 | 0 / 20 | **FAIL** |
| Nemotron 3 Ultra (NIM) | NVIDIA | **0.271** | 87.1 % | 0.426 | 3 | 1 (#35, name change) | 0 / 8 | 0 / 20 | **FAIL** |
| DeepSeek v4.1 flash (NIM) | DeepSeek | **0.783** | 96.8 % | 0.839 | 1 (#1, owner "mostly same") | 0 | 0 / 8 | 0 / 20 | **PASS** |
| GLM 5.3 (NIM) | Zhipu | **1.000** | 100 % | 0.635 | 0 | 0 | 0 / 8 | 0 / 20 | **PASS** |
| Qwen 3.8 flash (Halogen, tie-break) | Alibaba | **0.635** | 93.5 % | 0.713 | 2 | 0 | 0 / 8 | 0 / 20 | PASS (reported only) |
| Luna `gpt-6-luna`, low effort (Codex CLI) — added 2026-10-23, see below | OpenAI | **0.652** | 96.8 % | 0.367 | 0 | 1 (#35, name change) | 0 / 8 | 0 / 20 | **PASS** |
| DeepSeek v4.1 flash (opencode free) — added 2026-10-23 | DeepSeek | — | — | — | 2 of 32 seen | 0 | 0 / 8 | — | **unreachable**: stopped answering after 45 of 60 items; not calibrated, not used |
| Kimi k2.6 (NIM) | Moonshot | — | — | — | — | — | — | — | **not available** (HTTP 404 for this account; no reply) |
| Mistral Large 2 (NIM) | Mistral | — | — | — | — | — | — | — | **not available** (HTTP 404; stopped after 12 calls) |

**Selection (pre-registered rule):** SuperGemma failed, so the two scoring judges are the first two passing candidates of the list after it, from different vendors: **DeepSeek v4.1 flash and GLM 5.3.** Nemotron failed. Qwen passed but is the tie-breaker, reported only.

## Added after the pre-registration (2026-10-23)

When bar 2 was being judged, NIM stopped answering for hours. DeepSeek had returned 1 of 159 bar-2 judgements, GLM 28. With the owner's approval, two more candidates were calibrated on the same 60 items with the same prompts before they judged anything:
- the same DeepSeek model through **opencode's free tier**: it stopped after 45 items, so it was not calibrated;
- **Luna** at low effort through the Codex CLI: **PASS**, kappa 0.652.

Both run at the host's default temperature, not 0, and use the CLI retry rule in `judges.mjs`. These are deviations from this pre-registration, which listed NIM models only. The owner also used **Nemotron** for bar 2 although it failed here; that override is recorded in [coverage-a3-v2/RESULTS.md](../coverage-a3-v2/RESULTS.md).

## What the failures were

- **Every judge caught every control** (8/8 Greek, 20/20 A3 with the 0.3 rendering). The control rule alone could not separate the judges; the owner's natural items did.
- **SuperGemma is too strict on Greek paraphrase**: it rejected «του χρόνου» → «του έτους» (#5), «τρεις σκύλους» → «τρία σκυλιά» (#15), «την άλλη Δευτέρα» → «την επόμενη Δευτέρα» (#9) and a case slip (#19), all "same" for the owner. It caught both real errors (#25, #35).
- **Nemotron missed the changed name** (#35, Μαίρη → Μαρία) and rejected three items the owner called the same.
- Kappa rests on the owner's two "different" items, as the pre-registration warned. GLM's 1.000 means it matched all 31; its strict kappa is lower because it calls the two "mostly same" items equivalent, as the binary rule does.

## Limits

- The calibration task is Greek round trips, not English sentence ↔ record. The A3 controls check only that a judge rejects a mismatched record; there are no owner labels on English records. A calibrated judge can still be miscalibrated on records.
- The two Kimi/Mistral rows are endpoint failures (404), logged in [`unavailable/`](unavailable/); `judges.mjs` counted the empty bodies as unparseable. They are not verdicts.

## Cost

No money: NIM and opencode free tiers, the Ally and Halogen; Luna 60 Codex calls on the ChatGPT quota. Wall time: Luna about 5 min, Nemotron 22 min, SuperGemma 25 min, Qwen 39 min (rig protocol), DeepSeek 2 h 52 min (median 164 s per call), GLM 4 h 14 min (median 204 s per call).
