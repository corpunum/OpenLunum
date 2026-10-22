# Evaluation

The active evaluation implementation lives in `packages/eval/`. Historical results remain in `eval/historical-results.json`; they are not treated as reproduced by the current harness.

```bash
pnpm eval:smoke
pnpm model:doctor -- --profile profiles/models/my-model.json
pnpm experiment:create -- --id <id> --area multilingual-parse --task parse
pnpm experiment:run -- --manifest experiments/<id>/experiment.json
```

See `docs/EXPERIMENT_PROTOCOL.md`, `docs/EVALUATION_PROTOCOL.md`, and `docs/LOCAL_MODEL_WORKERS.md`.
