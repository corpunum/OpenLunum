# Contributing

OpenLunum is currently a private, evidence-driven, pre-1.0 project. GitHub issues are the canonical backlog. Begin work only from an explicit ready issue or maintainer-approved mechanical correction.

Read `START_HERE.md` and `docs/REPOSITORY_OPERATING_MODEL.md` before contributing.

## Branches and scope

- Use `work/<worker>/<issue-number>-<short-name>`.
- One issue per branch.
- One active implementation pull request per worker.
- Do not push directly to `main`.
- Do not reuse a merged or rejected branch.
- Delete task branches after merge or explicit rejection.
- Do not create campaign, status, sync, completion, or idle branches.

## Change tiers

### Tier 1 — mechanical

Non-semantic documentation, spelling, test organization, and low-risk tooling cleanup.

### Tier 2 — normal implementation

CLI, API, MCP, adapters, reporting, and internal implementation changes. These require local verification, review, and successful hosted exact-head checks.

### Tier 3 — semantic or evidence-sensitive

Schema, canonicalization, fingerprints, parser scoring, protected data, safety policy, renderer meaning preservation, and support or maturity claims. These require independent evaluation and orchestrator approval bound to the candidate head SHA.

## Ready for review

A change is ready for review when it includes:

- a linked issue and stated change tier;
- a clearly stated semantic, experimental, or integration goal;
- explicit non-goals;
- tests or reproducible evaluation steps;
- the baseline commit and candidate head SHA;
- dataset and profile hashes where applicable;
- no unsupported performance, support, maturity, reference, or production claims;
- migration notes for schema/fingerprint changes;
- a named tokenizer/model environment for renderer or model results;
- updated product/version metadata for integration changes;
- all failures, exclusions, timeouts, and limitations;
- exact reproduction commands;
- a successful `pnpm verify` result unless the issue explicitly targets a baseline failure.

## Protected boundaries

Do not edit implementation under `packages/`, `schemas/`, or `registry/` in the same pull request as protected evaluation data. Do not modify benchmarks or gold data to make a candidate pass.

A model cannot be the only judge of its own output. Tier 3 evaluation should use a separate evaluator model or configuration where practical.

## Commits and merging

Use conventional commit subjects where practical, for example:

```text
feat(core): preserve conditional modality
fix(eval): separate near-only outcomes
chore(ci): avoid duplicate task-branch runs
docs(ops): clarify worker assignment boundaries
```

Accepted pull requests are squash merged. Do not force-push after an evaluator has recorded a commit SHA; add a new commit so review and evidence remain auditable.
