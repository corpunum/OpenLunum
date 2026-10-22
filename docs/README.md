# Documentation

Start with the [README](../README.md), then [STATUS.md](../STATUS.md). Older design notes are in the [archive](../research/archive/README.md).

| Area | Documents |
|---|---|
| **Plan** | [PLAN-rust-engine-language-pairs.md](PLAN-rust-engine-language-pairs.md): EN → Lunum → EN, then Greek through an English pivot (translation adapters at the edges) |
| **The language** | [SEMANTIC_CONTRACT.md](SEMANTIC_CONTRACT.md) (identity, Unicode pin), [ARCHITECTURE.md](ARCHITECTURE.md), [SOURCE_BOUND_CANDIDATE_USE.md](SOURCE_BOUND_CANDIDATE_USE.md), [FINGERPRINT_MIGRATION.md](FINGERPRINT_MIGRATION.md), [GROUNDING.md](GROUNDING.md), [GROUNDING_PROVIDERS.md](GROUNDING_PROVIDERS.md) |
| **Evidence rules** | [EXPERIMENT_PROTOCOL.md](EXPERIMENT_PROTOCOL.md), [EVALUATION_PROTOCOL.md](EVALUATION_PROTOCOL.md), [LUNUM_READINESS.md](LUNUM_READINESS.md), [DATASET_POLICY.md](DATASET_POLICY.md), [REPRODUCING.md](REPRODUCING.md) |
| **Working on the repository** | [REPOSITORY_OPERATING_MODEL.md](REPOSITORY_OPERATING_MODEL.md), [AGENT_OPERATING_MODEL.md](AGENT_OPERATING_MODEL.md), [LOCAL_MODEL_WORKERS.md](LOCAL_MODEL_WORKERS.md), [CLIENT_COMPATIBILITY.md](CLIENT_COMPATIBILITY.md), [schema-drift-migration.md](schema-drift-migration.md) |
| **Rendering and realization** | [RENDERER_CONFORMANCE.md](RENDERER_CONFORMANCE.md), [SAFE_SHORT_TIGHT_PROFILES.md](SAFE_SHORT_TIGHT_PROFILES.md), [TOKEN_ATLAS.md](TOKEN_ATLAS.md), [REALIZATION.md](REALIZATION.md), [REALIZATION_RUNNER.md](REALIZATION_RUNNER.md), [MULTILINGUAL_REALIZATION.md](MULTILINGUAL_REALIZATION.md) (template prototype in `packages/eval`, not the Rust renderer) |
| **CI gates and safety** | [QUALITY_GATE_CI.md](QUALITY_GATE_CI.md), [RETENTION_REGRESSION_GATE.md](RETENTION_REGRESSION_GATE.md), [RETENTION_BASELINE_STORE.md](RETENTION_BASELINE_STORE.md), [ROUND_TRIP_RETENTION.md](ROUND_TRIP_RETENTION.md), [MIXED_CONTEXT_QUALITY.md](MIXED_CONTEXT_QUALITY.md), [THREAT-MODEL.md](THREAT-MODEL.md), [PROMPT_INJECTION.md](PROMPT_INJECTION.md), [CLI_PIPELINE.md](CLI_PIPELINE.md) |
| **Third-party data** | [UNIVERSAL_PROPBANK_AUDIT.md](UNIVERSAL_PROPBANK_AUDIT.md), [evaluation/testLunumv1/](evaluation/testLunumv1/testLunumv1.md) |

Design decisions are in [decisions/](../decisions/README.md).
