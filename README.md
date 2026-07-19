# OpenLunum

> **Project:** OpenLunum  
> **Technology:** Lunum  
> **Independent specification line:** **Lunum-I** — *Lunum Interlingua*  
> **Status:** research-to-reference implementation, pre-1.0

OpenLunum develops **Lunum**, a model-facing semantic intermediate representation designed to preserve meaning across human languages, create stable retrieval identities, and render selected context in forms that are efficient for the model and tokenizer actually in use.

Lunum is not “compressed English” and it is not a claim that one artificial spelling is optimal for every model. Its central architecture separates meaning from model-facing rendering:

```text
Human language or structured product state
              ↓
Lunum-Sem — canonical, language-independent semantics
              ↓
Lunum-FP  — deterministic retrieval and deduplication identity
              ↓
Lunum-Code — model/tokenizer-specific compact rendering
              ↓
Natural fallback whenever compact representation is unsafe
```

## Agent assignment: start here

A coding or research agent can begin from this README alone. It must then read the linked project instructions before changing code or publishing claims.

### Copy-paste instruction for a worker agent

```text
Clone https://github.com/corpunum/OpenLunum and read README.md completely.

Follow the “Agent assignment: start here” section exactly. Read every required linked document before selecting work. Bootstrap and verify the repository, choose exactly one unclaimed work area, establish a baseline, create a bounded experiment, use the configured local model, preserve all failures and raw evidence, and propose changes only when the declared metric improves without breaking hard gates.

Do not edit protected evaluation data together with implementation. Do not merge your own proposal. Do not claim language, model, tokenizer, safety, or production support without the required reproducible evidence. Push an agent/... branch and open a draft pull request containing the experiment manifest, dataset hash, model profile, baseline, candidate results, failures, reproduction command, and limitations.

Stop and report instead of guessing when a semantic decision requires human or stronger-model judgment, when the experiment budget is exhausted, or when hard gates repeatedly fail.
```

### Required reading

Read these files in order:

1. [`START_HERE.md`](START_HERE.md)
2. [`AGENTS.md`](AGENTS.md)
3. [`WORK_QUEUE.md`](WORK_QUEUE.md)
4. [`ORCHESTRATOR.md`](ORCHESTRATOR.md)
5. [`docs/AGENT_OPERATING_MODEL.md`](docs/AGENT_OPERATING_MODEL.md)
6. [`docs/EXPERIMENT_PROTOCOL.md`](docs/EXPERIMENT_PROTOCOL.md)
7. [`docs/EVALUATION_PROTOCOL.md`](docs/EVALUATION_PROTOCOL.md)
8. [`docs/DATASET_POLICY.md`](docs/DATASET_POLICY.md)
9. [`docs/LOCAL_MODEL_WORKERS.md`](docs/LOCAL_MODEL_WORKERS.md)
10. [`docs/MULTILINGUAL_MODEL.md`](docs/MULTILINGUAL_MODEL.md)

### Mandatory bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

Do not begin an experiment while the baseline verification is failing.

### Worker loop

1. Select **one** unclaimed area from `WORK_QUEUE.md`.
2. State a falsifiable hypothesis and the metric expected to improve.
3. Create an experiment manifest with the baseline commit, dataset hash, model profile, budgets, hard gates, and reproduction command.
4. Run the unchanged baseline before modifying code, prompts, schemas, renderers, or policy.
5. Iterate only within the declared item, retry, model-call, and attempt budgets.
6. Keep raw outputs, per-item scores, failed examples, exclusions, and environment metadata.
7. Run the candidate against the same development data and then the permitted evaluation suite.
8. Run `pnpm verify` before committing.
9. Push an `agent/<worker>/<area>/<experiment>` branch and open a **draft** pull request.
10. Do not merge the proposal or promote its claims yourself.

### Hard rules

- Lunum-Sem is language-neutral meaning; the initial English-like code is only the `generic-en-pivot/0.1` renderer.
- Natural source text, language, provenance, protected literals, exact evidence, and failure cases must be retained.
- Fewer characters are not accepted as fewer tokens.
- A worker may not change implementation and protected evaluation data in the same pull request.
- A surface heuristic may not be labeled canonical semantics or become eligible for compact context.
- Negation, conditions, entities, quantities, time, modality, provenance, and safety constraints are hard semantic gates.
- A model cannot be the only judge of its own output.
- Small local models are experiment workers, not final semantic, safety, release, or merge authorities.

### Minimum acceptable pull request evidence

Every experiment proposal must include:

- experiment ID and selected work area;
- hypothesis and stopping conditions;
- baseline commit;
- dataset ID, version, count, and SHA-256 hash;
- exact model, tokenizer when applicable, endpoint type, generation settings, and seed when supported;
- baseline and candidate metrics;
- raw per-item outputs or reproducible references;
- all observed failures and limitations;
- exact reproduction commands;
- `pnpm verify` result;
- a clear statement of what the results do **not** prove.

### Stop and escalate when

- the declared budget is exhausted;
- hard semantic or safety gates repeatedly fail;
- results oscillate without a clear non-dominated improvement;
- required data, tokenizer access, or model metadata is missing;
- a schema, fingerprint migration, protected-dataset, safety-policy, or support-level decision is required;
- the result depends on subjective meaning judgment that cannot be decided mechanically.

A stronger model or human orchestrator should review the evidence, compare competing proposals, request independent evaluation, and decide whether implementation or merging is justified.

## Agent-driven development

The repository supports bounded local-model experiments through an OpenAI-compatible endpoint, hashes datasets and profiles, generates per-item failure reports, and requires stronger-model or human orchestration before semantic or safety-sensitive changes merge.

## Why this repository exists

Lunum began as an independent language and memory experiment, then a reduced shadow implementation was embedded in OpenUnum. OpenLunum restores the correct ownership boundary:

- this repository owns the language, schemas, canonicalization, fingerprints, renderers, policies, evaluations, and conformance contracts;
- products own their databases, retrieval systems, context budgets, safety controls, and user experience;
- products adopt Lunum through versioned dependencies, adapters, hooks, MCP, plugins, or wrappers;
- OpenUnum is the first detailed reference integration, but Lunum never imports OpenUnum.

## What Lunum wants to become

1. **A semantic interlingua for agent memory** — one canonical meaning can be retrieved from prompts in different human languages.
2. **A stable identity layer** — equivalent semantic records can share deterministic fingerprints for exact or near-structural retrieval.
3. **A tokenizer-aware context language** — model-facing code is selected from measured renderer profiles, not assumed universal.
4. **A safe mixed-context compiler** — low-risk records may be compacted while exact wording, conditionals, code, safety constraints, legal text, and ambiguous content remain natural.
5. **A protocol for agent state** — plans, tool events, observations, preferences, constraints, evidence, and references can share a versioned representation.
6. **An adoption standard** — integrations document their hooks, guarantees, limitations, conformance tests, and upgrade path.
7. **An evidence-driven project** — token savings alone are insufficient; quality, semantic retention, safety, reversibility, and operational cost are first-class metrics.

## What exists today

- A strict reference implementation for Lunum-Sem, providing semantic contracts, deterministic canonicalization/fingerprint library, and release provenance.
- A conservative reference renderer and mixed-context compiler.
- Safe, short, and tight renderer profiles without changing semantics.
- Tokenizer measurement framework with llama.cpp-compatible counting.
- Full-prompt quality gates for local-model evaluation.
- Near-semantic fingerprint implementation with feature extraction and configurable similarity threshold.
- Expanded typed structures: time, quantity, uncertainty, reference, and modality.
- Canonical conformance vectors and property tests.
- Multilingual realization (English, Greek, Spanish, Indonesian) with protected-literal and independent semantic scoring.
- Round-trip self-consistency as a secondary metric.
- Abstention/clarification outputs for low-confidence parses.
- Context quality measurement framework and policy datasets.
- Multilingual retrieval and false-equivalence tests.
- Aggregate MRR: Mean Reciprocal Rank for retrieval tasks, computed and validated in summary.json and report.md.
- Near-semantic + exact fingerprint interop: records carry both lfp: and nfp:, hybrid search exact-first with near-fallback.
- An MCP (Model Context Protocol) reference server with parse, realize, fingerprint, retrieve, and validate tools.
- An HTTP API reference server with OpenAPI spec and integration tests.
- A standalone CLI pipeline (`lunum parse | lunum realize | lunum render`).
- Conformance reports for hook/plugin/CLI integration paths.
- An OpenUnum compatibility adapter preserving its current sidecar return shape.
- Historical research and measured results from Lunum 1 through 2.7.
- Integration profiles for OpenUnum, Claude Code, Codex CLI, Gemini CLI/Antigravity transition, OpenCode, Pi, OpenClaw, and generic Node agents.
- Prompt-injection resistance tests with 10 adversarial inputs.
- Mixed-context quality gates for natural vs Lunum vs mixed evaluation.
- Threat model with concrete mitigations and parser-hallucination tests.
- Compatibility matrix for schema-package versions.
- Error observability integration for eval runner (circuit-breaker, revert-capability).
- API stability tests: snapshot-based tests verifying no public exports are removed and no breaking signature changes occur in `packages/core`.
- Architecture decision records in `docs/decisions/`.
- Frozen Lunum-Sem schema 0.2 with locked fields, enums, and `$ref` cross-references.
- Schema migration test suite validating 0.1→0.2 record transformation with golden vectors.
- Bidirectional migration (0.1 ↔ 0.2) with schema validation: forward and backward migration functions validate source/destination schemas, emit field-level loss warnings, regenerate fingerprints, and preserve input order. Round-trip test (0.1→0.2→0.1) with explicit loss warnings.
- Schema changelog at `schemas/CHANGELOG.md` documenting every breaking change.
- Quality gate CI integration: unified runner wrapping downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance, and prompt-gates; configurable pass rates and strict mode. Rebuilt per maintainer feedback (PR #151).
- Retention regression gate: baseline store with provenance (dataset/model/schema), regression detection (10pp warning / 20pp critical), stale-baseline checks (>365 days), and nightly CI integration. Types in `packages/eval/src/baseline-store.ts`. 11 tests. (PR #167)
- Retention baseline store: per-language retention metrics save/load (`saveBaseline()`, `loadBaseline()`), snapshot-to-baseline conversion (`snapshotToBaseline()`), regression detection (`compareRetentionAgainstBaseline()` — detects when any language drops below baseline, below minimum threshold 0.5, or overall drops >5pp). Types in `packages/eval/src/retention-baseline.ts`. 289 lines of implementation, 274 lines of tests. (PR #180)
- Multilingual round-trip retention: parse→realize round-trips on EN/EL/ES/ID against local models. Gold Sem realized to target language, parsed back, compared against gold. Scores: predicate match, role match, protected-literal preservation. 14 tests in `packages/eval/test/round-trip-retention.test.ts`. (PR #176)
- Per-model retention profiles: `ModelRetentionProfile` and `ModelLanguageProfile` types tracking per-model retention across all languages. Outputs: `modelProfiles` (per-model metrics with per-language breakdown), `bestModelsByLanguage`, model profile markdown reports, best-models-by-language summary. 18 total round-trip retention tests pass. (PR #186)
- Orchestrator handover doc: `ORCHESTRATOR.md` with 6-layer stack architecture (Cloud Orchestrator, Watchdog, Local Orchestrator with LLM diagnosis, Reviewer, Worker, Merge Bot), key paths, hardware profile, escalation path (bash auto-fix → LLM diagnosis → NEEDS_CLOUD → cloud orchestrator → user notification), merge bot `orchestrator-approved` label for hard-protected PRs, and ops runbook for any LLM to take over. `ORCHESTRATOR-PROMPT.md` provides copy-paste handover instructions.
- Safety rollback process: `rollbackToSource()` and `rollbackBatch()` verify integrity/provenance/source-authenticity (verified/failed/absent), fail closed when evidence is absent, verify source/provenance digests rather than trusting the record itself. 10 unit tests. Types in `packages/core/src/rollback-process.ts`.
- CLI migrate command: `lunum migrate <file> --from 0.1 --to 0.2` or `--from 0.2 --to 0.1` for bidirectional migration, with `--dry-run` mode for preflight reports. Supports single records and arrays; reports schema versions, fingerprints, warnings, and validation status per record. 152 lines of tests in `packages/cli/test/cli.test.ts`.
- Fail-closed merge policy: `scripts/pi-merge-policy.mjs` enforces required checks (verify, schema-drift, report-validation, protected-data-boundary; quality-gates for core/eval src changes), fail-closed exact-head binding (`--match-head-commit`), CI_OUTAGE flag support (skips hosted checks when `reports/orchestrator/CI_OUTAGE` exists), and `scripts/pi-merge-loop.sh` runs auto-merge bot with hard-protected paths (CI, agent infra, protected data → `claude-review` label) and soft-protected paths (core types, schemas, registry → reviewer `LGTM-protected` override), post-merge main verification with auto-revert on red. `scripts/pi-merge-loop.sh` runs `gh pr ready` on labeled PRs before policy. Tests in `scripts/pi-merge-policy.test.mjs`.


## New in v0.2.0

- **Lunum-Sem schema 0.2 frozen:** Locked field names, enum constraints, and `$ref` cross-references between experiment, protected-eval, and core schemas. Migration test validates 0.1→0.2 transformation. See `schemas/CHANGELOG.md`.
- **Schema migration test suite:** 312-line test validating record transformation from 0.1 to 0.2 with golden vectors.
- **Comprehensive type tests for v02 migration:** 122 lines of semantic-contract type tests covering all migration paths.
- **Profile Selection Result type:** Explicit type for renderer profile selection driven by Token Atlas measurements.
- **Realization runner:** Experiment runner with protected-literal scoring for multilingual realization experiments.
- **Token Atlas:** Cross-model, cross-profile token measurement framework for measuring natural vs renderer profiles.
- **Profile selection:** Renderer profile selection driven by Token Atlas measurements (per-model best profile).
- **Tokenizer optimization pass:** Model-specific tight profiles that provably do not change semantics, with per-model best profile selection via Token Atlas.
- **Downstream quality gates:** Task-success metrics and quality gates to verify downstream task quality preservation.
- **Fingerprint migration utilities:** Code-level utilities for detecting versions, migrating records, and golden vectors.
- **Bidirectional migration (0.1 ↔ 0.2):** Forward (`migrateForward01to02`) and backward (`migrateBackward02to01`) migration functions with schema validation, field-level loss warnings, fingerprint regeneration, and input-order preservation. Batch operations (`migrateRecordsForward`, `migrateRecordsBackward`) and round-trip test (`roundTripMigration`) included.
- **CI conformance gates:** Property tests wired into CI as hard gates for idempotence and fingerprint stability.
- **Native model protocol:** Token mappings, instruction templates, and fallback profiles for native and non-native model families.
- **Renderer conformance suite:** Property tests verifying round-trip canonicalization for safe, short, and tight profiles against 10 test records.
- **Agent-state protocol:** Validated types for plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs.
- **Near-semantic fingerprint implementation:** Feature extraction, configurable similarity threshold, nfp:* fingerprint format, similarity comparison with threshold-based matching.
- **Near-semantic retrieval tests:** Identical-record fingerprint stability, near-match similarity within threshold, unrelated-record low similarity, recall comparison vs exact fingerprint, false-positive rate measurement.
- **Near-semantic + exact fingerprint interop:** Records carry both exact (lfp:) and near-semantic (nfp:) fingerprints; hybrid search tries exact first, then falls back to near-semantic.
- **API stability tests:** Snapshot-based tests verifying no public exports are removed and no breaking signature changes occur in `packages/core`.
- **OpenUnum adapter e2e conformance:** End-to-end verification of OpenUnum compatibility adapter against real product runtime.
- **HTTP API reference server:** New `packages/api` package with REST endpoints (parse, realize, render, retrieve, health) and OpenAPI 3.1.0 spec. Third adoption path after MCP and CLI.
- **Standalone CLI pipeline:** `lunum parse | lunum realize | lunum render` pipeline for scriptable offline adoption.
- **Prompt-injection resistance tests:** 10 adversarial inputs crafted to corrupt Lunum-Sem records through the parser.
- **Mixed-context quality gates:** Downstream task accuracy comparison across natural vs Lunum vs mixed context.
- **Threat model expansion:** Concrete mitigations for injection, hallucination, ambiguity, provenance chain integrity, and parser-hallucination.
- **Compatibility matrix:** Schema-package version compatibility testing documented and CI-tested.
- **Error observability:** Circuit-breaker and revert-capability types wired into the eval runner for auto-halt on repeated failures.
- **Nightly experiment runs:** Automated nightly evaluation with structured evidence reports.

## Evidence snapshot

| Line | Environment | Main result | Evidence status |
|---|---|---:|---|
| Lunum-1 | archival benchmark | ~5.78× expansion | documented failure; motivated architecture split |
| 2.4 | local SuperGemma tokenizer | Tight-Code 0.776×; validator 30/30 | historical target-machine result |
| 2.5 | local SuperGemma, 30 examples | Tight 0.7244×; 29/30 wins | historical target-machine result |
| 2.5.4 | local comprehension harness | context 0.7434×; quality delta 0.00 to +0.05 | historical target-machine result |
| 2.6 | local SuperGemma, 22 memories/10 questions | mixed 0.8037×; mixed QA 1.0 | strongest historical product gate |
| 2.7 | portable static suite | mixed rough ratio 0.752; all assertions pass | reproducible rough-token result |

These figures are not presented as universal model results. See [Evidence and achievements](docs/EVIDENCE.md) for provenance and limitations, [the metrics standard](docs/METRICS.md) for future reporting, and [project status](STATUS.md) for the current maturity boundary.

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
pnpm --filter @corpunum/lunum-cli build
node packages/cli/dist/src/cli.js inspect --text "The user prefers concise answers."
node packages/cli/dist/src/cli.js encode --sem examples/preference.sem.json
```

Example semantic record:

```json
{
  "schema": "lunum-sem/0.2",
  "world": "real",
  "kind": "preference",
  "clauses": [
    {
      "predicate": "prefer",
      "negated": false,
      "roles": {
        "experiencer": { "type": "actor", "id": "user" },
        "theme": { "type": "concept", "id": "concise_answers" }
      }
    }
  ]
}
```

Reference output:

```text
R prefer user concise_answers
lfp:0.1:sha256:…
```

## Adoption modes

| Mode | Best for | Capability |
|---|---|---|
| Library dependency | Products controlling their runtime, such as OpenUnum | Full semantic storage, retrieval, compilation, and evaluation |
| Lifecycle hooks/plugin | Agent CLIs exposing prompt/tool/session hooks | Turn-level encoding, logging, and guarded context injection |
| MCP/local service | Products that can call tools but cannot import the SDK | Encode, validate, inspect, compare, and compile operations |
| CLI wrapper | Command-line products with limited extension APIs | External preprocessing and evaluation |
| Offline evaluation | Closed or inaccessible runtimes | Export analysis only; not full adoption |

Start with [the adoption model](docs/ADOPTION-MODEL.md) and [the integration matrix](integrations/README.md).

## Repository map (extended)

The repository map at the end of this document lists top-level directories. Package-specific details are in each `packages/<name>/README.md`.

## Naming

- **OpenLunum** is the repository and project umbrella.
- **Lunum** is the technology and protocol family.
- **Lunum-I** means *Lunum Interlingua*, not “version one.” It names the independent specification line.
- Historical Lunum 1→2.7 artifacts remain preserved and are not rewritten.
- Draft schema identifiers use explicit versions, for example `lunum-sem/0.1-draft`.
- Lunum-Sem schema 0.2 is frozen; see `schemas/CHANGELOG.md` for migration instructions.

## Non-negotiable principles

- Natural source text is never deleted solely because Lunum exists.
- Semantic identity and compact surface rendering are separate.
- “Fewer characters” is not accepted as evidence of fewer tokens.
- Every renderer profile is measured on a named tokenizer/model environment.
- Compact context is opt-in, risk-classified, reversible, and quality-gated.
- Core packages never import product integrations.
- Product-specific workarounds stay in adapters unless generalized.

## Repository map

```text
packages/core/            Core library: semantics, canonicalization, fingerprints (exact + near-semantic), renderer conformance, native-model protocol, agent-state protocol, policy classifier.
packages/cli/             Command line interface for inspection, encoding, compilation, release verification, and pipeline adoption.
packages/api/             HTTP API reference server with OpenAPI spec and integration tests.
packages/eval/            Local-model experiment runner, metrics, failure reports, Token Atlas, and downstream quality gates.
packages/mcp/             Prototype reference server and tooling for Model Context Protocol (MCP) integration.
packages/adapter-openunum/ OpenUnum compatibility adapter package.
packages/core/test/       API stability test suite with golden snapshots; near-semantic fingerprint interop and retrieval tests.
schemas/                  machine-readable contracts (0.1-draft and frozen 0.2); `schemas/CHANGELOG.md` for migration instructions
registry/                 worlds, roles, categories, predicates
profiles/models/          Model profile definitions (token mappings, instruction templates).
profiles/renderers/       Renderer profile definitions (safe, short, tight).
scripts/                  Automation: nightly window, release sign/verify, schema-to-ts, validation, orchestrator loop (pi-orchestrator.sh), merge policy evaluator (pi-merge-policy.mjs with fail-closed exact-head), auto-merge bot (pi-merge-loop.sh with hard/soft-protected path classification and post-merge main verification), worker/reviewer/merge/watchdog loops.

test-fixtures/            Integration and retrieval test fixtures with manifests.
python/                   Python research workspace for model, tokenizer, corpus, and statistics work.
examples/                 Example semantic records for quick-start and pipeline adoption.
datasets/                 Evaluation datasets: dev, adversarial, protected, and manifests; see DATASET_POLICY.md.
experiments/              Worker experiment manifests and evidence directories.
reports/                  Structured evidence reports from nightly runs, conformance gates, and campaign tracking.
eval/                     metrics, fixtures, gates, and historical ledger
research/archive/         complete initial handover and prior experiments
docs/                     vision, architecture, language, security, versioning
docs/decisions/           architecture decision records (ADRs)
integrations/openunum/    verified-current-state reference and adoption plan
integrations/*/           design/reference profiles for other products
```

## Honest status

OpenLunum has a credible architecture and promising controlled results. It does **not** yet have a production-grade multilingual semantic parser, broad cross-model validation, a stable public protocol, or evidence that compact Lunum improves every workload. The project is intentionally pre-1.0 until those gaps are closed.
