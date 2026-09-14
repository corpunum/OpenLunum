# Raw-text retrieval evaluator audit and development experiment

Date: 2026-09-06

## Finding

The evaluator boundary is suitable for a development-only agent-extracted
experiment. `runRawTextRetrievalEvaluation` accepts raw memories and raw
queries plus an extractor callback; it validates and normalizes returned Sem,
routes candidates by `targetLanguage`, keeps extraction and matching failures
separate, and compares a same-input lexical baseline. The existing Stage 2
runner is not suitable for this request because it owns a local OpenAI-compatible
model profile, writes to `reports/experiments/retrieval-stage2-superqwen`, and
its prior evidence is local-inference evidence rather than agent extraction.

The current checkout also contains unrelated dirty work, including an
uncommitted change in `packages/eval/src/raw-text-retrieval.ts`. This experiment
does not modify that file or any other evaluator/core source.

## Safe design

`raw-text-retrieval-agent-experiment.mjs` reads only the raw retrieval dataset
and an append-only candidate ledger. The ledger is checked for duplicate IDs,
missing IDs, invalid Sem, noncanonical Sem, and forbidden gold/scoring fields.
Candidates can explicitly abstain. The harness then calls the existing
evaluator with no model, embedding, network, or local-inference dependency and
writes one report in this directory.

The report separates identity coverage from end-to-end retrieval and preserves
per-query failures. It is diagnostic only: it cannot establish protected-set
generalization, production readiness, or model-independent semantic accuracy.
The supplied ledger is a small source-only Codex-agent development trial, not a
protected corpus and not a claim that the agent independently grounds every
open concept correctly.

## Independence limitation

The candidate ledger is retained as a harness diagnostic, not as clean
agent-extraction evidence. Its row IDs and paired dataset structure expose
semantic hints, and the submitted candidates reproduce identical gold-shaped
records across paired rows. The 10/10 positive retrieval result therefore
demonstrates evaluator plumbing and ranking on supplied candidates only; it
must not be interpreted as raw-text extraction accuracy or protected evidence.

## Run

```sh
pnpm --filter @corpunum/lunum-eval build
node scripts/research/raw-text-retrieval-agent-experiment.mjs
```

The run is deliberately outside the normal evaluator CLI and has no model
profile or endpoint argument.
