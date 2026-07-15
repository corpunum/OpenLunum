# Start here: working on Lunum

This is the entry point for humans and coding agents. OpenLunum is a research-and-engineering repository, not a prompt-compression toy. A valid contribution must improve a declared area without silently weakening meaning, safety, reproducibility, or compatibility.

## 1. Understand the architecture

Read in this order:

1. `VISION.md`
2. `docs/ARCHITECTURE.md`
3. `docs/MULTILINGUAL_MODEL.md`
4. `docs/AGENT_OPERATING_MODEL.md`
5. `docs/EXPERIMENT_PROTOCOL.md`
6. `docs/EVALUATION_PROTOCOL.md`
7. `WORK_QUEUE.md`

The core separation is:

```text
source language -> parse -> Lunum-Sem -> fingerprint
                               |          |
                               |          +-> retrieval identity
                               +-> model renderer -> compact model context
                               +-> realizer -> supported human language
```

`Lunum-Sem` is language-neutral structured meaning. The initial compact renderer is an English-pivot profile because current general models commonly understand those symbols and words; it is not the semantic source of truth.

## 2. Bootstrap and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

Node 22 and pnpm 10.13.1 are required. Python is optional and reserved for corpus/model research that does not belong in the TypeScript reference SDK.

## 3. Choose exactly one work area

Choose one area from `WORK_QUEUE.md`. Create an experiment before changing behavior:

```bash
pnpm experiment:create -- --id <short-id> --area <area> --task <parse|realize|render|context>
```

Use a branch such as:

```text
agent/<worker-name>/<area>/<experiment-id>
```

Do not optimize several unrelated areas in one branch.

## 4. Establish a baseline

Run deterministic checks first:

```bash
pnpm verify
```

For local-model work, copy `profiles/models/local-openai-compatible.example.json`, point it to a local OpenAI-compatible server, and run:

```bash
pnpm model:doctor -- --profile profiles/models/my-local-model.json
pnpm experiment:run -- experiments/<id>/experiment.json
```

No paid API is required. Local servers are expected. The runner records model identity, settings, dataset hash, raw outputs, failures, and aggregate metrics.

## 5. Iterate within the manifest budget

The experiment manifest defines maximum items, attempts, and model calls. Stop when a hard gate fails repeatedly, the budget is exhausted, or improvement becomes ambiguous. Never hide failed cases or change the benchmark to make the candidate win.

## 6. Publish a proposal, not a verdict

A worker agent may push a branch and open a PR containing code, experiment manifests, raw result references, and generated reports. It must not merge semantic, fingerprint, protected-data, or safety-policy changes by itself.

A stronger orchestrator or human decides whether the evidence supports implementation. Small local models are candidate generators and test workers; they are not the final semantic authority.

## Non-negotiable rules

- Preserve original source text and provenance.
- Surface heuristics are not canonical semantics.
- Token savings without meaning and task-quality evidence are not success.
- Never edit code and `datasets/protected/` in the same PR.
- Never claim language/model support without a named tested profile and report.
- Never delete negative results.
- Never push directly to `main` from an autonomous experiment loop.
