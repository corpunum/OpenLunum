# OpenLunum worker assignment

Copy this file to `reports/orchestrator/WORKER_ASSIGNMENT.md` for one local worker run. The runtime copy is uncommitted and consumed by `scripts/pi-dispatch-once.sh`.

Use plain `key: value` fields for the dispatcher metadata.

assignment_id: 2026-07-20-253-eval-baseline
issue: 253
worker: qwen-eval
area: evaluation
branch: work/qwen-eval/253-honest-multilingual-baselines
tier: 3
max_attempts: 2
max_model_calls: 64
wall_clock_minutes: 180

## Target outcome

Prepare and execute the bounded portion of issue #253 named by the orchestrator. Preserve exact, near-semantic-only, invalid/error, timeout, and excluded outcomes separately.

## Non-goals

- Do not calibrate thresholds.
- Do not modify protected evaluation data.
- Do not widen the task to renderer, schema, or integration work.
- Do not claim accepted language or model support.

## Acceptance criteria

- Use the current repaired parse prompt, controlled vocabulary, token budget, and near-semantic scoring path.
- Record dataset path and SHA-256.
- Record model identity, quantization/build, chat template, context size, generation settings, and hardware/runtime.
- Preserve raw outputs, parsed records, exact comparison, near-semantic scores, latency, timeouts, and errors.
- Run the reproduction commands from a clean checkout.
- Run the issue-required targeted checks and `pnpm verify`.
- Open one draft pull request linked to issue #253 only when a coherent candidate exists.

## Required local checks

```bash
pnpm verify
pnpm --filter @corpunum/lunum-eval build
```

Add the issue-specific experiment commands here before dispatch.

## Required evidence

List the exact manifest paths, dataset hashes, model profiles, report paths, and expected evaluator handoff here before dispatch.

## Stop conditions

Stop with `blocked` when required data, model metadata, or a semantic decision is missing. Stop with `no-improvement` when the declared bounded attempts are exhausted without an acceptable candidate.
