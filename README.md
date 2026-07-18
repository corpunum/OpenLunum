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
4. [`docs/AGENT_OPERATING_MODEL.md`](docs/AGENT_OPERATING_MODEL.md)
5. [`docs/EXPERIMENT_PROTOCOL.md`](docs/EXPERIMENT_PROTOCOL.md)
6. [`docs/EVALUATION_PROTOCOL.md`](docs/EVALUATION_PROTOCOL.md)
7. [`docs/DATASET_POLICY.md`](docs/DATASET_POLICY.md)
8. [`docs/LOCAL_MODEL_WORKERS.md`](docs/LOCAL_MODEL_WORKERS.md)
9. [`docs/MULTILINGUAL_MODEL.md`](docs/MULTILINGUAL_MODEL.md)

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
- Near-semantic fingerprint design separate from exact identity.
- Expanded typed structures: time, quantity, uncertainty, reference, and modality.
- Canonical conformance vectors and property tests.
- Multilingual realization (English, Greek, Spanish, Indonesian) with protected-literal and independent semantic scoring.
- Round-trip self-consistency as a secondary metric.
- Abstention/clarification outputs for low-confidence parses.
- Context quality measurement framework and policy datasets.
- Multilingual retrieval and false-equivalence tests.
- An MCP (Model Context Protocol) reference server with parse, realize, fingerprint, retrieve, and validate tools.
- Conformance reports for hook/plugin/CLI integration paths.
- An OpenUnum compatibility adapter preserving its current sidecar return shape.
- Historical research and measured results from Lunum 1 through 2.7.
- Integration profiles for OpenUnum, Claude Code, Codex CLI, Gemini CLI/Antigravity transition, OpenCode, Pi, OpenClaw, and generic Node agents.
- Contract and safety-oriented tests.
- Architecture decision records in `docs/decisions/`.

## New in v0.2.0

- **Profile Selection Result type:** Explicit type for renderer profile selection driven by Token Atlas measurements.
- **Realization runner:** Experiment runner with protected-literal scoring for multilingual realization experiments.
- **Token Atlas:** Cross-model, cross-profile token measurement framework for measuring natural vs renderer profiles.
- **Profile selection:** Renderer profile selection driven by Token Atlas measurements (per-model best profile).
- **Downstream quality gates:** Task-success metrics and quality gates to verify downstream task quality preservation.
- **Fingerprint migration utilities:** Code-level utilities for detecting versions, migrating records, and golden vectors.
- **CI conformance gates:** Property tests wired into CI as hard gates for idempotence and fingerprint stability.
- **API stability tests:** Snapshot-based tests verifying no public exports are removed and no breaking signature changes occur in `packages/core`.
- **OpenUnum adapter e2e conformance:** End-to-end verification of OpenUnum compatibility adapter against real product runtime.

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
  "schema": "lunum-sem/0.1-draft",
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

## Naming

- **OpenLunum** is the repository and project umbrella.
- **Lunum** is the technology and protocol family.
- **Lunum-I** means *Lunum Interlingua*, not “version one.” It names the independent specification line.
- Historical Lunum 1→2.7 artifacts remain preserved and are not rewritten.
- Draft schema identifiers use explicit versions, for example `lunum-sem/0.1-draft`.

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
packages/core/            Core library providing strict TypeScript reference semantics, canonicalization, and release provenance.
packages/cli/             Command line interface for inspection, encoding, compilation, and release verification.
packages/eval/            Local-model experiment runner, metrics, failure reports, and Token Atlas measurements.
packages/mcp/            Prototype reference server and tooling for Model Context Profile (MCP) integration.
packages/adapter-openunum/ OpenUnum compatibility adapter package.
packages/core/test/       API stability test suite with golden snapshots.
schemas/                  machine-readable contracts
registry/                 worlds, roles, categories, predicates
integrations/openunum/    verified-current-state reference and adoption plan
integrations/*/            design/reference profiles for other products
eval/                     metrics, fixtures, gates, and historical ledger
research/archive/         complete initial handover and prior experiments
docs/                     vision, architecture, language, security, versioning
docs/decisions/           architecture decision records (ADRs)
```

## Honest status

OpenLunum has a credible architecture and promising controlled results. It does **not** yet have a production-grade multilingual semantic parser, broad cross-model validation, a stable public protocol, or evidence that compact Lunum improves every workload. The project is intentionally pre-1.0 until those gaps are closed.
