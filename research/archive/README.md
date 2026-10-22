# Archive

Superseded material, kept rather than deleted. Nothing here describes the current state; read [STATUS.md](../../STATUS.md) for that. Frozen evidence elsewhere in the repository may still link here, so these paths do not move again.

| Path | What it is | Archived |
|---|---|---|
| [initial-handover/](initial-handover/) | The original Lunum 2.7 research handover the repository started from | 2026-07 |
| [operating-model-pre-issue-driven/](operating-model-pre-issue-driven/) | The first agent operating model | 2026-07 |
| [operating-model-multi-agent-2026-09/](operating-model-multi-agent-2026-09/) | The September multi-agent (orchestrator + Pi workers) process, replaced by trunk-based work on `main` | 2026-09 |
| [readiness-before-public-review-20260914.md](readiness-before-public-review-20260914.md) | Readiness scorecards and the evidence ledger before public review; `reports/evidence-registry.json` and a consistency test still read it | 2026-09-14 |
| [docs-2026-07-09/](docs-2026-07-09/) | 38 design notes and feature specs from July–September 2026 with no remaining links from current docs, code or CI (list below) | 2026-10-22 |
| [handoffs/HANDOFF-2026-10-16.md](handoffs/HANDOFF-2026-10-16.md) | The session handoff of 2026-10-16/17. Its open steps are carried into [the plan](../../docs/PLAN-rust-engine-language-pairs.md). `experiments/parallel-document-v1/PREREGISTRATION-paid.md` (frozen) still links to its old top-level path | 2026-10-22 |
| [eval-historical/](eval-historical/) | The pre-harness `eval/` folder: `historical-results.json`, not reproduced by the current harness | 2026-10-22 |
| [python-placeholder/](python-placeholder/) | An empty optional Python workspace (`pyproject.toml` with no code or tests) | 2026-10-22 |

## docs-2026-07-09

Most of these were written by the July 2026 issue-driven agent loop, one per feature issue. Some describe modules that still exist in `packages/core` or `packages/eval` (the [core module audit](../../reports/diagnostic/2026-10-16/core-module-audit/README.md) lists which are reached only by tests). The specs are not maintained, and their claims are not current evidence.

| Group | Files |
|---|---|
| Early project policy, superseded by STATUS, VISION, the semantic contract and the operating model | ADOPTION-MODEL, EVIDENCE, LANGUAGE, METRICS, MULTILINGUAL_MODEL, NAMING, RELEASE_AND_EVIDENCE, SUPPORT_CONTRACT, VERSIONING, PUBLIC_REVIEW_RESPONSE |
| Baseline and pilot plans that were never run as written | ENGLISH_GREEK_BASELINES, SPANISH_INDONESIAN_BASELINES, MULTILINGUAL_ERROR_TAXONOMY, MULTILINGUAL_RETRIEVAL, pilot-design |
| Feature specs for core/eval modules | ABSTENTION_CLARIFICATION, AGENT_STATE_PROTOCOL, CANONICAL_CONFORMANCE_VECTORS, CONFORMANCE_REPORTS, CONTEXT_QUALITY_MEASUREMENT, DOWNSTREAM_QUALITY_GATES, ERROR_OBSERVABILITY, LLAMA_TOKENIZER_COUNTING, NATIVE_MODEL_PROTOCOL, NEAR_SEMANTIC_FINGERPRINTS, POLICY_CATEGORIES, PROMPT_GATES, PROTECTED_LITERAL_SCORING, RELEASE_PROVENANCE, ROLLBACK_PROCESS, ROUNDTRIP_CONSISTENCY, SHADOW_MODE_ADAPTER, TOKENIZER_MEASUREMENT, TYPED_STRUCTURES_EXPANSION |
| Training research, out of scope until the language stabilises (ROADMAP) | ECOSYSTEM_ALIGNMENT, TRAINING_AUTHORIZATION_OPTIONS, TRAINING_MODEL_RESEARCH, TRAINING_PROGRAM |
