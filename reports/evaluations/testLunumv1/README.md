# testLunumv1 Result Registry

This directory stores immutable evidence bundles produced under the canonical protocol:

```text
docs/evaluation/testLunumv1/testLunumv1.md
```

## Run directory naming

Use:

```text
<UTC timestamp>__<evaluated-sha-12>__p<protocol-version>
```

Example:

```text
20260721T180000Z__437ed94e10d5__p1.0.0
```

A run ID must not be reused.

## Immutability

After a run is declared complete or independently evaluated:

- do not rewrite, delete, squash, or silently regenerate its evidence;
- do not replace failed records;
- do not change summary tables without preserving the original;
- do not edit manifests to match what actually happened after the fact.

Corrections use one of these methods:

1. create a new run directory and link it to the superseded run; or
2. add an append-only `CORRECTION.md` explaining the error, affected files, corrected calculation, issue/PR, and replacement run.

The original raw evidence remains intact.

## Required bundle

Each `<RUN_ID>/` follows the tree defined in the protocol and includes, at minimum:

- run manifest and frozen-input hashes;
- repository/environment state;
- endpoint probes;
- raw parse, retention, mutation, robustness, and reproducibility JSONL;
- one Markdown report per target model;
- one Markdown report per Pi worker;
- one Markdown report per model×worker pair;
- one report per language;
- CSV aggregate tables;
- failure gallery;
- overall scorecard;
- three ranked focus recommendations;
- independent exact-SHA evaluator verdict.

## Run registry

Add a row only after the run directory exists. Do not mark a run `accepted` until its exact-SHA evaluator verdict and required hosted checks exist.

| Run ID | Protocol | Evaluated SHA | Evidence SHA | Models | Languages | Status | Parent issue | Result summary |
|---|---|---|---|---|---|---|---|---|

Allowed status values:

- `planned`;
- `running`;
- `blocked`;
- `incomplete`;
- `candidate`;
- `evaluated-fail`;
- `evaluated-pass`;
- `accepted`;
- `superseded`.

## Comparability

Two runs are directly comparable only when their comparison manifest confirms compatibility for:

- protocol version or declared compatible migration;
- evaluated code;
- dataset bytes and IDs;
- prompt and schema;
- scorer;
- model profile and generation settings;
- suite coverage and pass definitions.

When one of these differs, display the difference and avoid an unqualified winner/loser conclusion.

## Storage and repository hygiene

- Commit compact evidence and reports required for reproducibility.
- Do not commit credentials, model binaries, private prompts, unrestricted telemetry, temporary logs, package caches, or redundant large artifacts.
- Large raw artifacts that cannot reasonably live in Git must be stored in an approved durable location with a content hash and access instructions. A machine-local path is not durable evidence.
- Generated evidence must be deterministic from raw records where practical.
- A report generator must never mutate raw input records.

## Updating the protocol

Protocol changes belong under:

```text
docs/evaluation/testLunumv1/
```

Update both `testLunumv1.md` and `CHANGELOG.md` in one issue-linked PR. State whether existing runs remain comparable and whether a rerun is required.
