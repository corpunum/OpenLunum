# @corpunum/lunum-eval

Local-model experiment runner and report generator.

## Purpose

Provides bounded local OpenAI-compatible parse/realization experiments with dataset hashes, raw failures, and generated reports. Supports the worker/evaluator/orchestrator operating model.

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
