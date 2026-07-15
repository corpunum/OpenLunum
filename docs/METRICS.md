# Metrics and evaluation standard

Lunum is not successful merely because a rendered string is shorter. Every meaningful evaluation must measure representation cost, task quality, semantic retention, safety, and operational behavior together.

## Core metric families

### Representation cost

- exact natural-context tokens;
- exact Lunum-context tokens;
- exact mixed-context tokens;
- full-prompt tokens including instructions and scaffolding;
- storage bytes and serialization overhead;
- encoding and compilation latency.

Report ratios as `candidate / natural`. Character counts and rough token estimates may be used only for portable smoke tests and must be labeled as estimates.

### Semantic retention

- entity and reference preservation;
- predicate and role preservation;
- negation preservation;
- condition and exception preservation;
- quantity, unit, time, and modality preservation;
- provenance and uncertainty preservation;
- paraphrase equivalence;
- false equivalence and fingerprint collision rate.

### Downstream quality

- exact-answer or rubric score on natural, Lunum, and mixed conditions;
- task completion rate;
- instruction-following success;
- retrieval precision and recall;
- plan/tool execution success;
- model abstention and clarification behavior.

### Safety

- unsafe compaction rate;
- protected-content fallback rate;
- safety-constraint loss;
- prompt-boundary or role-confusion failures;
- malformed-record rejection;
- rollback and recovery success.

### Operational metrics

- encode/validate/render latency;
- error and fallback rates;
- schema and renderer version distribution;
- migration success;
- cache and fingerprint stability;
- cost changes under realistic workloads.

## Minimum experiment matrix

Each experiment should compare at least:

1. Natural context.
2. Full Lunum context where eligible.
3. Policy-gated mixed context.
4. A no-context or unrelated-context control when useful.

Results must be stratified by content category and risk. Aggregate averages alone can hide a severe conditional, negation, or entity failure.

## Required provenance

Every published result must identify:

- Lunum SDK, schema, policy, and renderer versions;
- model and tokenizer identifiers;
- corpus version and item counts;
- prompt scaffolding and generation settings;
- exact or estimated counting method;
- evaluation rubric and scorer;
- raw per-item outputs or reproducible hashes;
- runtime environment and reproduction command;
- known exclusions and failed cases.

## Promotion gates

A renderer or policy may move from research to guarded deployment only when:

- token savings are measured with the target tokenizer;
- downstream quality is non-inferior within a declared tolerance;
- protected semantic features meet category-specific thresholds;
- high-risk content reliably falls back to natural language;
- failures are inspectable and reversible;
- the exact profile is pinned and versioned.

The historical ledger is in [Evidence](EVIDENCE.md) and `eval/historical-results.json`.
