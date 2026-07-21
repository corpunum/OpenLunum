# testLunumv1 Protocol Changelog

All behaviorally meaningful changes to `testLunumv1.md` must be recorded here.

Use semantic versioning:

- **PATCH** — clarification that does not change measured behavior, coverage, formulas, gates, or comparability.
- **MINOR** — additive suite, metric, report field, language, mutation family, or compatible measurement improvement.
- **MAJOR** — incompatible change to datasets, scoring, pass definitions, formulas, required coverage, or evidence rules.

Every entry must state:

- date and issue/PR;
- protocol version;
- exact sections changed;
- why the change was needed;
- whether existing runs remain comparable;
- whether manifests or result postprocessors require migration;
- whether a rerun is required.

## 1.0.0 — 2026-07-21

### Added

- Canonical living protocol at `docs/evaluation/testLunumv1/testLunumv1.md`.
- Strict Pi one-shot local-worker execution model.
- Explicit separation between Pi worker agents and target models under test.
- Full EN/EL/ES/ID parse and parse-plus-retention matrices.
- Mutation, robustness, cross-lingual, reproducibility, efficiency, token, latency, and semantic-compaction measurements.
- Required report files per model, Pi worker, model×worker pair, and language.
- Immutable result bundles under `reports/evaluations/testLunumv1/<RUN_ID>/`.
- Exact-SHA independent evaluation and strict stop conditions.

### Comparability

No earlier run is automatically considered a `testLunumv1` run. Historical reports may be imported only as clearly labelled references and must not be combined with v1 results unless they satisfy the same frozen-input and raw-evidence requirements.

### Migration

None. This is the initial version.

### Rerun required

Yes. The protocol defines a new complete audit rather than accepting previous smoke or partial baseline results as the v1 result.
