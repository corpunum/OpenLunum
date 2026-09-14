# @corpunum/lunum-eval

Experiment runners, conformance tests, source-only agent evaluation and report tooling for OpenLunum. Some runners call configured OpenAI-compatible model endpoints; deterministic tests and the [core demo](../../examples/structured-record-demo.mjs) do not require a model. The [repository license](../../LICENSE.md) applies.

## Start with the evidence boundary

A runner or passing fixture is not a model result. Supplied-gold semantic pairs measure comparison given that annotation, not end-to-end extraction. A token estimate or byte count is not a named-tokenizer measurement. A visible/tuned development corpus is not protected evaluation evidence.

Read [current evidence and limitations](../../docs/LUNUM_READINESS.md) before using a historical report. This package does not promise supported languages, model families, safety accuracy or token savings from the presence of profiles and tests. Earlier README claims such as a historical 0/16 -> 14/16 validity improvement are not a current qualification result.

## Checkout commands

From the repository root:

```bash
pnpm build
pnpm eval:smoke
pnpm --filter @corpunum/lunum-eval test:unit
```

`eval:smoke` exercises the smoke harness; it is not a live multilingual or task-quality benchmark. Build/tests may write generated reports; do not stage them as new empirical evidence.

Maintainer experiment commands are declared in [package.json](package.json) and the [root package](../../package.json). `experiment:create`, `experiment:run`, `report:generate`, `model:doctor` and `eval:retention` need their respective inputs/configuration. `agent:status` is for managed automation, not a visitor prerequisite.

## Reproducibility

For an actual model/agent experiment, declare the hypothesis, source-only input boundary, dataset hash, exact implementation, contract/profile, model/tokenizer identity when applicable, generation settings, attempt budget and baseline. Preserve raw failures, errors, timeouts, exclusions and denominators. State which isolation/review guarantees were actually achieved.

See the [experiment protocol](../../docs/EXPERIMENT_PROTOCOL.md) and [evaluation protocol](../../docs/EVALUATION_PROTOCOL.md). Historical artifacts remain evidence of what was run, not blanket approval to reuse their scores as current capability claims.
