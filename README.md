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

- A draft `Lunum-Sem` schema and deterministic canonicalization/fingerprint library.
- A conservative reference renderer and mixed-context compiler.
- An OpenUnum compatibility adapter preserving its current sidecar return shape.
- Historical research and measured results from Lunum 1 through 2.7.
- Integration profiles for OpenUnum, Claude Code, Codex CLI, Gemini CLI/Antigravity transition, OpenCode, Pi, OpenClaw, and generic Node agents.
- Contract and safety-oriented tests.

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
pnpm install
pnpm test
node packages/cli/src/cli.mjs inspect --text "The user prefers concise answers."
node packages/cli/src/cli.mjs encode --sem examples/preference.sem.json
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
packages/core/           reference library and OpenUnum-compatible surface
packages/cli/            inspect/encode/compile command line
schemas/                 machine-readable contracts
registry/                worlds, roles, categories, predicates
integrations/openunum/   verified-current-state reference and adoption plan
integrations/*/           design/reference profiles for other products
eval/                    metrics, fixtures, gates, and historical ledger
research/archive/        complete initial handover and prior experiments
docs/                    vision, architecture, language, security, versioning
```

## Honest status

OpenLunum has a credible architecture and promising controlled results. It does **not** yet have a production-grade multilingual semantic parser, broad cross-model validation, a stable public protocol, or evidence that compact Lunum improves every workload. The project is intentionally pre-1.0 until those gaps are closed.
