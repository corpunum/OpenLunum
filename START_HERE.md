# Start here: working on Lunum

This is the entry point for humans and coding agents. OpenLunum is a research-and-engineering repository, not a prompt-compression toy. A valid contribution must improve a declared area without silently weakening meaning, safety, reproducibility, compatibility, branch hygiene, or budget controls.

Local orchestrators should start at `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md`.

Read `docs/LUNUM_READINESS.md` before proposing production, support, language, model, tokenizer, compaction, safety, or maturity claims.

## 1. Understand the architecture and operating model

Read in this order:

1. `VISION.md`
2. `docs/LUNUM_READINESS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/MULTILINGUAL_MODEL.md`
5. `docs/REPOSITORY_OPERATING_MODEL.md`
6. `docs/AGENT_OPERATING_MODEL.md`
7. `docs/EXPERIMENT_PROTOCOL.md`
8. `docs/EVALUATION_PROTOCOL.md`
9. the assigned GitHub issue

`CAMPAIGN.md` and `WORK_QUEUE.md` are archive pointers. GitHub issues are the canonical backlog and assignment state.

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

Do not begin assigned work while the baseline is failing unless the issue explicitly targets that failure.

## 3. Work only from an explicit assignment

A local worker receives one ready GitHub issue through `reports/orchestrator/WORKER_ASSIGNMENT.md`. See `scripts/WORKER_ASSIGNMENT.example.md` and `scripts/pi-task-prompt.md`.

If no valid assignment exists, the worker remains idle and creates nothing.

The branch format is:

```text
work/<worker>/<issue-number>-<short-name>
```

Use one issue per branch and at most one active implementation PR per worker. Local worktrees may persist; remote task branches are deleted after merge or rejection.

Do not push a remote branch until a coherent candidate is worth sharing. More than eight total remote branches blocks new worker dispatch until cleanup or documented exceptions.

## 4. Establish a baseline

Behavior-changing and evidence-changing work begins from the issue's declared baseline and, where applicable, an experiment manifest:

```bash
pnpm experiment:create -- --id <short-id> --area <area> --task <parse|realize|render|context>
```

Run deterministic checks before changing behavior:

```bash
pnpm verify
```

For local-model work, copy `profiles/models/local-openai-compatible.example.json`, point it to a local OpenAI-compatible server, and run:

```bash
pnpm model:doctor -- --profile profiles/models/my-local-model.json
pnpm experiment:run -- experiments/<id>/experiment.json
```

The runner records model identity, settings, dataset hash, raw outputs, failures, and aggregate metrics. Different quantizations, server builds, or chat templates are different evaluation environments.

## 5. Iterate within the assignment budget

The issue and experiment manifest define maximum items, attempts, model calls, timeouts, wall-clock time, hardware, and hosted Actions budget. Stop when a hard gate fails repeatedly, the budget is exhausted, or improvement becomes ambiguous.

Never hide failed cases, silently retry exclusions, or change the benchmark to make a candidate win.

The current one-shot dispatcher has a global process lock. Do not bypass it or run concurrent dispatcher processes. The orchestrator may dispatch different worker worktrees sequentially.

## 6. Publish a proposal, not a verdict

A worker may push one assigned task branch and open one draft PR containing code, experiment manifests, raw-result references, generated reports where appropriate, failures, reproduction commands, and limitations.

Keep the PR draft during normal local iteration and review. Run local checks before marking it ready. If a ready PR needs changes, convert it back to draft before pushing.

The worker exits after reporting:

- `candidate` — a coherent draft PR exists;
- `blocked` — a named dependency or decision prevents completion;
- `no-improvement` — the bounded attempt produced no acceptable candidate.

A stronger orchestrator, independent evaluator, or human decides whether the evidence supports implementation and merging. Local models are candidate generators and test workers; they are not the final semantic authority.

## Change tiers

- **Tier 1:** mechanical, non-semantic documentation and low-risk tooling cleanup.
- **Tier 2:** normal CLI, API, MCP, adapter, reporting, and implementation work.
- **Tier 3:** schema, canonicalization, fingerprints, parser scoring, protected data, safety, renderer preservation, and support/maturity claims.

Tier 3 work requires independent evaluation bound to the candidate head SHA.

## Hosted Actions boundary

Hosted Actions are acceptance evidence, not the development loop.

- Do not create diagnostic commits just to trigger CI.
- Mark a PR ready only when routine pushes are finished and review/evaluation is coherent.
- Re-run only failed or invalidated jobs where possible.
- Never weaken, rename, remove, skip, or spoof required checks to save quota.
- Do not add nightly full-repository workflows without an explicit reviewed need and budget.

## Non-negotiable rules

- Preserve original source text and provenance.
- Surface heuristics are not canonical semantics.
- Token savings without meaning and task-quality evidence are not success.
- Never edit code and protected evaluation data in the same PR.
- Never claim language/model/tokenizer support without a named tested profile and accepted report.
- Never delete or hide negative results.
- Never push directly to `main` from a worker.
- Never create campaign, status, sync, completion, or idle branches.
- Never select another issue after completing an assignment.
- Delete the task branch after squash merge or explicit rejection.
