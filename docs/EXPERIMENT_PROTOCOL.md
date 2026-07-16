# Experiment protocol

## Experiment before implementation

Behavior-changing work starts with `experiments/<id>/experiment.json`. The manifest names one area, one task, one hypothesis, one baseline commit, one dataset hash, one or more model profiles, hard gates, target metrics, and budgets.

## Required artifacts

```text
experiments/<id>/
├── experiment.json
├── CLAIM.md
└── notes.md

reports/experiments/<id>/<run-id>/
├── environment.json
├── manifest.snapshot.json
├── item-results.jsonl
├── failures.jsonl
├── summary.json
└── report.md
```

Generated reports should not be hand-edited. Add interpretation in `notes.md` or the PR.

## Iteration rules

- Use development data while iterating.
- Do not inspect protected holdout results until choosing a candidate.
- Do not modify implementation and protected data in one PR.
- Preserve every run that informed a published claim, including regressions.
- Change one major variable at a time when feasible.
- Record exact model, quantization/build identifier when available, prompt, generation settings, tokenizer/counting method, hardware/runtime, and commit.

## Promotion

A development win becomes a proposal only after deterministic validation and an evaluation report. It becomes a supported profile only after an independent protected/product evaluation and orchestrator approval.
