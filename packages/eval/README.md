# @corpunum/lunum-eval

Local-model experiment runner and report generator.

## Purpose

Provides bounded local OpenAI-compatible parse/realization experiments with dataset hashes, raw failures, and generated reports. Supports the worker/evaluator/orchestrator operating model.

## Features

- **Realization Runner:** Experiment runner with protected-literal scoring for multilingual realization (EN/EL/ES/ID).
- **Token Atlas:** Cross-model, cross-profile token measurement framework for natural vs renderer profile comparison.
- **Retention regression gate:** Baseline store with provenance (dataset/model/schema), regression detection, stale-baseline checks, and CI integration. Prevents multilingual retention quality from degrading over time.
- **Retention baseline store:** Per-language retention metrics save/load, snapshot-to-baseline conversion, and regression detection. Detects when any language drops below baseline, below minimum threshold (0.5), or overall drops >5pp. 289 lines of implementation, 274 lines of tests.
- **Per-language metrics:** Detailed reports with pass rates, protected-literal coverage, and semantic scores.
- **Schema-aware parsePrompt:** `parsePrompt` embeds the Lunum-Sem JSON schema shape and a canonical one-shot example in the system message. Live test showed parse validity improved 0/16 → 14/16 with the example present. Makes the prompt self-documenting and gives models a concrete template to follow.

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
```

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

## Gate thresholds

The experiment runner uses two hard gates to determine whether an experiment passess:

- **`minimumFeatureRecall`** (default `0.70`): minimum ratio of semantic features (predicates, roles, negation, modality, uncertainty) preserved in the model output. Set to `0.70` after the 2026-07-20 live test showed free-vocabulary models consistently achieve 0.65–0.80 feature recall on local endpoints. The previous value of `0.95` was calibrated for constrained, vocabulary-controlled models.
- **`minimumExactRate`** (default `0.50`): minimum ratio of items whose output matches the gold Lunum-Sem fingerprint exactly. Set to `0.50` because free-vocabulary models frequently produce semantically equivalent output with different identifiers (e.g., `delete` vs `remove_file`), causing exact-only scoring to underreport capability. Near-semantic matching catches these cases.
- **`requireProtectedLiteralCoverage`** (default `true`): whether protected literals (names, numbers, dates, units) must appear in the output.

**Why the change?** The 2026-07-20 live test campaign revealed that the parse runner had been discarding its own prompt, so every historical parse/retention result was scored against broken inputs. The recalibrated thresholds reflect honest baselines measured after fixing the prompt pipeline.

## Status

**Prototype.** Experiment runner works with configured endpoints. Independent semantic judging and cross-model validation are pending.

## New in v0.2.0

- **Realization runner:** Multilingual realization experiments (EN/EL/ES/ID) with protected-literal scoring.
- **Token atlas:** Cross-model token measurement framework with aggregate statistics and per-model analysis.
- **Retention regression gate:** Baseline store with provenance, regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), and nightly CI integration. 11 tests.
- **Retention baseline store:** Per-language retention metrics save/load, snapshot-to-baseline conversion, and regression detection. 289 lines of implementation, 274 lines of tests. (PR #180)
