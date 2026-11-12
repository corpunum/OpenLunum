# ADR 0032: Stop the 0.21 / 0.22 candidate contracts; 0.19 stays frozen

**Status:** Accepted. **Owner decision, 2026-11-12 (16:3x EET), relayed by the orchestrator session corpunum-82.**

## Decision

- The candidate contracts `lunum-agent/0.21` and `0.22` ([ADR 0031](0031-mood-renderer-and-imperative-frames.md)) are **not released**, and the line is **stopped**. No further work goes into them.
- `lunum-agent/0.19` stays the frozen contract under [ADR 0025](0025-contract-freeze-pending-held-out-evidence.md). OpenUnum keeps its vendored core at `5f6570bf`.
- **coverage-a3-v4 is not pre-registered on this design.**

## Why

- [coverage-a3-v1](../experiments/coverage-a3-v1/RESULTS.md) and [v2](../experiments/coverage-a3-v2/RESULTS.md): coverage rose to 69.5%, but judged meaning stayed at 56% (bar 2 failed twice).
- [coverage-a3-v3](../experiments/coverage-a3-v3/RESULTS.md): **no verdict**. The model-rated calibration labels contain no negatives, so the pre-registered kappa is undefined. Only one judge passed the looser reading; it accepts under 60% of the records against an 80% bar, and it disagrees with itself on 19% of identical prompts.
- The [cross-vendor review](../experiments/cross-vendor-review-v1/gpt-6-luna-2026-11-12-CHECK.md) found that the gates check presence, not role or scope. Broader frames without such checks widen what can get an identity without making it faithful.

## What stays

- The 0.21 / 0.22 code and the frozen instruction packages v27 to v30 stay on `main` as historical, unreleased bindings. Packages v29 and v30 are maintenance re-freezes: a dependency update and a literal-retention fix.
- Fixes to shared core code (for example literal retention, 2026-11-12) are still made on `main`. They reach OpenUnum only through a re-vendor at a commit that carries contract 0.19.
- Faithfulness research continues as the top open point (STATUS.md), through new pre-registered designs, not through more contract versions.

## Cost

The mood renderer and contract-0.22 imperatives are unavailable to OpenUnum. Questions and orders keep rendering as under 0.19.
