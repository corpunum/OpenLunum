# Judge calibration v1: pre-registration

**Committed 2026-10-23, before any judge in this folder is called. Self-reviewed.** A judge must be calibrated before it scores a bar. This folder decides which judges may score A3's bar-2 re-run ([coverage-a3-v2](../coverage-a3-v2/)). It follows the rule the owner's calibration README froze before any judge ran ([`pivot-el-en-v1/calibration/README.md`](../pivot-el-en-v1/calibration/README.md), "Use", step 4).

## Why

In A3 ([results](../coverage-a3-v1/RESULTS.md)) Nemotron 3 Ultra accepted 46 % of the records while SuperGemma accepted 94 %; agreement was 50 %. Both answered all 20 seeded controls correctly, so the control rule alone could not tell which judge was off.

## Items ([`prepare.mjs`](prepare.mjs) → [`items.jsonl`](items.jsonl), [`prepare.json`](prepare.json); offline, deterministic)

- **Greek, 40 items:** the owner's hand-labelled worksheet (`WORKSHEET-owner-filled.md`): 32 natural round trips, 8 injected controls. Labels are parsed by the README's rule. Owner: 27 same, 2 mostly same, 2 different, 1 can't tell; 8/8 controls caught.
- **English, 20 items:** A3's 20 seeded controls (same seed and pairing as `coverage-a3-v1/judge.mjs`: a sentence paired with another sentence's record; the right answer is "no"), rendered with the new **`generic-en-pivot/0.3`** by the Rust CLI (Rust–TS parity 121/121).

## Prompts ([`judges.mjs`](judges.mjs), shared with coverage-a3-v2)

- Greek: "does the second sentence have the same meaning as the first? Judge only who does what to whom, negation, may/must, tense, numbers and names", reply `{"same": true|false}`. This is the owner's worksheet question.
- English: R4's level-(b) prompt, plus one line describing the mood notation of 0.3 and "whether it is a statement, a question or an order" in the question. Reply `{"states": true|false}`. **This exact prompt scores bar 2 in coverage-a3-v2.**
- Temperature 0, one call at a time. A 429, 5xx or network failure is re-asked after a minute, at most 6 times. A reply that does not parse counts as "no" ("not the same" / "does not state").

## Measures and the pass rule (per judge)

On the 31 labelled non-control Greek items (can't tell dropped), owner labels collapse to binary: same and mostly same = equivalent, different = not. Per the README:
- Cohen's **kappa** (binary) against the owner; also raw agreement, the strict variant (mostly same = not equivalent) and the confusion matrix, reported.
- **Greek controls missed**: controls the judge calls "same" (of 8).
- **A3 controls missed**: controls the judge says "states" (of 20).

**A judge passes if kappa ≥ 0.4, it misses at most 1 of the 8 Greek controls, and at most 1 of the 20 A3 controls.** (The A3 control rule is stricter than A3's own "at most 2", to match the README's ≤ 1.) The README's optional 4-way second pass is not run.

Known weakness, stated now: the owner marked only 2 of the 31 as different. Kappa then depends heavily on those two items (#25, a counterfactual obligation turned into an inference; #35, a changed name). A judge that misses either one and also rejects two or three correct items falls below 0.4. The rule is applied as frozen anyway.

## Candidates, in order

1. **SuperGemma** `supergemma4-Q5_K_M` (Google lineage), ROG Ally through an ssh tunnel to `127.0.0.1:28084`.
2. **Nemotron 3 Ultra** `nvidia/nemotron-3-ultra-550b-a55b` (NVIDIA), NIM free tier.
3. If Nemotron fails, the next NIM free models in this order, until one passes: `deepseek-ai/deepseek-v4.1-flash` (DeepSeek), `moonshotai/kimi-k2.6` (Moonshot), `z-ai/glm-5.3` (Zhipu), `mistralai/mistral-large-2-instruct` (Mistral).
4. **Qwen** `qwen3.8-flash` on Halogen (Alibaba), tie-breaker, reported only; run only if Halogen is free, under the rig protocol (never in :00–:10 / :30–:40 UTC, at most one other request in flight, none queued).

**Selection for coverage-a3-v2:** the two scoring judges are SuperGemma and the first passing judge of 2–3, if SuperGemma passes. If SuperGemma fails, the first two passing judges of 2–3 (different vendors). None of them is Anthropic (the extractor). If fewer than two pass, bar 2 is not scored and that is the result.

## Commands

```bash
node experiments/judge-calibration-v1/prepare.mjs
ssh -f -N -L 28084:127.0.0.1:18084 rog          # SuperGemma tunnel
node experiments/judge-calibration-v1/calibrate.mjs --judge gemma      # then nemotron, [deepseek, kimi, glm, mistral], qwen
node experiments/judge-calibration-v1/calibrate.mjs --report           # -> calibration.json
```
