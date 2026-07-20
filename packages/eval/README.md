# @corpunum/lunum-eval

Local-model experiment runner and report generator.

## Purpose

Provides bounded local OpenAI-compatible parse/realization experiments with dataset hashes, raw failures, and generated reports. Supports the worker/evaluator/orchestrator operating model.

## Features

- **Parse Experiment Runner:** Runs parse experiments against local models for EN/EL/ES/ID with per-language metrics, cross-language comparison reports, and fingerprint-based scoring. Invoked via `node cli.js parse-experiment <manifest-path>`. CLI arg handling reads `process.argv[3]` (manifest path); `process.argv[2]` is the subcommand name. 424 lines of implementation. (PR #228)
- **Realization Runner:** Experiment runner with protected-literal scoring for multilingual realization (EN/EL/ES/ID).
- **Token Atlas:** Cross-model, cross-profile token measurement framework for natural vs renderer profile comparison.
- **Retention regression gate:** Baseline store with provenance (dataset/model/schema), regression detection, stale-baseline checks, and CI integration. Prevents multilingual retention quality from degrading over time.
- **Retention baseline store:** Per-language retention metrics save/load, snapshot-to-baseline conversion, and regression detection. Detects when any language drops below baseline, below minimum threshold (0.5), or overall drops >5pp. 289 lines of implementation, 274 lines of tests.
- **Per-language metrics:** Detailed reports with pass rates, protected-literal coverage, and semantic scores.

## Scripts

```bash
# Check agent status
pnpm agent:status

# Run model doctor (diagnose OpenAI-compatible endpoint)
pnpm model:doctor

# Create an experiment
pnpm experiment:create

# Run an experiment
pnpm experiment:run

# Generate reports
pnpm report:generate

# Run smoke tests
pnpm eval:smoke

# Run retention experiment
pnpm eval:retention

# Run parse experiment via CLI
node cli.js parse-experiment experiments/<id>/experiment.json
```

## Parse experiment

```bash
node cli.js parse-experiment experiments/live-evidence-20260720/experiment.json
```

Runs parse experiments on EN/EL/ES/ID against a configured local model. Publishes per-language metrics, cross-language comparison reports, and fingerprint-based scoring (exact + near-semantic). Supports gated experiments with configurable `minimumFeatureRecall`, `minimumExactRate`, and `requireProtectedLiteralCoverage` gates.

## Realization experiment

```bash
pnpm eval:run --manifest experiments/realization-en-el-es-id/CLAIM.md
```

## Token atlas

```bash
pnpm eval:run --manifest experiments/token-atlas/CLAIM.md
```

## Architecture

```
experiments/<id>/CLAIM.md     experiment declaration
experiments/<id>/manifest.json hypothesis, budgets, gates
eval/                         fixtures, gates, metrics, historical ledger
reports/                      generated per-item results and summaries
```

## Experiment protocol

1. Create `experiments/<id>/CLAIM.md` with worker, area, branch, start date, and intended dataset.
2. Record baseline commit, dataset hash, model profile, budgets, hard gates, and reproduction command.
3. Run the unchanged baseline before modifying code, prompts, schemas, renderers, or policy.
4. Keep raw outputs, per-item scores, failed examples, exclusions, and environment metadata.
5. Run `pnpm verify` before committing.

## Limitations

- Local models are experiment workers, not final semantic or safety authorities.
- Reports are generated from the experiment harness; they do not replace independent judgment.
- Bootstrap fixtures are visible development data and do not prove language support.

## Status

**Prototype.** Experiment runner works with configured endpoints. Independent semantic judging and cross-model validation are pending.

## New in v0.2.0

- **Realization runner:** Multilingual realization experiments (EN/EL/ES/ID) with protected-literal scoring.
- **Token atlas:** Cross-model token measurement framework with aggregate statistics and per-model analysis.
- **Retention regression gate:** Baseline store with provenance, regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), and nightly CI integration. 11 tests.
- **Retention baseline store:** Per-language retention metrics save/load, snapshot-to-baseline conversion, and regression detection. 289 lines of implementation, 274 lines of tests. (PR #180)
