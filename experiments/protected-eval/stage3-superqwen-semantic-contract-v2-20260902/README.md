# Protected Stage 3 evaluator v2

This is a fresh, frozen evaluator corpus for the candidate implementation at
`c69b9477876f53bcde4790624c1553b2ff4a43d3`. It contains 66 unique rows: 11
semantic groups x 6 languages (`en`, `el`, `es`, `id`, `fr`, `de`). The corpus
has canonical protocol gold, 12 explicit abstention cases, and critical
role-swap and negation contrasts.

Run `pnpm --filter @corpunum/lunum-eval build` before the corpus-local
preflight. `node preflight.mjs` calls the exported
`validateEvaluationGold` against the exact schema produced by
`buildExtractionSchema`; a non-empty invalid list is a hard stop. The parse
runner repeats this gate before its first model call.

The profile snapshot is evaluator evidence, not a production profile. It pins
the directly verified endpoint `http://127.0.0.1:58995/v1`, model
`openai/superqwen3.8-27b-abliterated`, and `maxTokens: 768`. After preflight,
run exactly once with:

```sh
pnpm --filter @corpunum/lunum-eval exec node dist/src/cli.js parse-experiment experiments/protected-eval/stage3-superqwen-semantic-contract-v2-20260902/experiment.json
```

No corpus or prompt tuning is permitted after outputs are observed. The run
directory must retain each raw request and response, completion finish reason
and usage, prompt hashes, and provenance. If the endpoint or time budget
prevents the run, preserve a `NOT_RUN` status artifact instead of implying a
measurement.
