# OpenLunum

**Experimental TypeScript toolkit for structured semantic records, versioned fingerprints, and model-facing rendering.**

**License status: public repository, all rights reserved; not currently open source.**
See [LICENSE.md](LICENSE.md) before reuse, redistribution, or product integration.

OpenLunum develops **Lunum**, a proposed intermediate representation (IR) for agent and language-model context. It separates a structured interpretation of source material from the text rendered for a model. The long-term aim is to preserve meaning across languages and reduce context cost without losing task quality. Those end-to-end benefits are research goals, not established production capabilities.

```text
original source + supplied or extracted candidate Sem
                  |
          validation and canonicalization
                  |
        versioned fingerprint of the representation
                  |
       optional rendering / natural-source fallback
```

A fingerprint is **not a meaning hash of raw text**. Different languages converge only when extraction and grounding produce compatible semantic records. A valid candidate is not automatically correct, verified, or safe to serve. Near-semantic comparison is a separate experimental similarity mechanism, not exact identity.

## What works, and what remains unproven

| Area | Present in the repository | Evidence boundary |
|---|---|---|
| Supplied semantic records | Types, canonicalization, frame validation, versioned fingerprints and tests | Conformance does not prove correct interpretation of natural language. |
| Agent interface | Generated extraction contract, candidate builder/submission, CLI and MCP tools | Extractor quality depends on the model, task, language and permitted grounding evidence. |
| Multilingual extraction | Small versioned English/Greek development experiments | Not broad language support or a protected generalization result. Other language fixtures are not support guarantees. |
| Rendering and context | Renderer profiles, context compilation and natural fallback paths | No accepted general claim of token savings with preserved downstream task quality. Compaction remains experimental. |
| Retrieval | Fingerprint/comparison primitives and research harnesses | No verified unrelated-product adoption or general cross-language retrieval advantage. |
| HTTP API / product adapter | Reference server and in-tree OpenUnum compatibility package | Several HTTP operations are placeholders; the adapter is not evidence of live product integration. |

We do not publish readiness percentages. Test, commit, PR and fixture counts measure repository activity or coverage, not completion. See the [evidence and limitations](docs/LUNUM_READINESS.md) for the current research record and the [vision](VISION.md) for the intended destination.

## See the core without a model

Technical walkthrough, subject to the license above. Requires Node.js 22+ and pnpm 10.13.1. No GPU, API key, model server, OpenUnum checkout, or worker assignment is needed.

```bash
git clone https://github.com/corpunum/OpenLunum.git
cd OpenLunum
corepack enable
pnpm install --frozen-lockfile
pnpm demo:core
```

The [example](examples/structured-record-demo.mjs) supplies an explicitly constructed preference record, validates it, checks identity stability and a negation contrast, renders it, and verifies that an unpromoted record keeps the original context.

**The example supplies Sem and its identifiers itself. It does not extract or translate text.** It is a deterministic SDK walkthrough, not independent adoption, multilingual accuracy, or token-savings evidence.

```bash
pnpm test:public-demo   # demo regression tests (builds core first)
pnpm verify            # full repository build, tests and smoke evaluation
```

## Use the right entry point

- **Read or report a problem:** [START_HERE.md](START_HERE.md), then [CONTRIBUTING.md](CONTRIBUTING.md). Visitors do not need an orchestrator assignment.
- **Inspect the SDK:** [core package](packages/core/README.md) and the runnable example above. Checkout instructions are not an npm release promise.
- **Connect an agent:** [MCP package](packages/mcp/README.md). The agent proposes semantics; core validation does not certify the proposal's truth.
- **Study the design:** [architecture](docs/ARCHITECTURE.md), [semantic contract](docs/SEMANTIC_CONTRACT.md), [ecosystem alignment](docs/ECOSYSTEM_ALIGNMENT.md).

## Package boundaries

| Package | Responsibility |
|---|---|
| `packages/core` | Semantic representation, validation, canonicalization, fingerprints, rendering and policy primitives. |
| `packages/eval` | Conformance and experiment tooling; inspect each result's provenance and limitations. |
| `packages/cli` | Command-line access to core operations. |
| `packages/mcp` | Agent-facing contract, builder and submission tools. |
| `packages/api` | HTTP reference scaffold; [read the placeholder limitations](packages/api/README.md). |
| `packages/adapter-openunum` | In-repository typed compatibility/shadow adapter, not a deployed OpenUnum integration. |

Core has no dependency on OpenUnum. Applications own storage, retrieval integration, permissions and runtime behavior. This separation is a design property, not proof that an ecosystem exists.

## What would demonstrate progress

The next meaningful results are a fair independently reviewed extraction baseline, then a reproducible standalone consumer that reports **both** named-tokenizer cost and downstream task quality against a natural-text baseline. Preserve failures, fallback coverage and negative results. A manually aligned example or a simulated benchmark cannot substitute for that result.

[Project status](STATUS.md) tracks the current blocker. [Evaluation guidance](docs/EVALUATION_PROTOCOL.md) explains evidence requirements. Historical “Lunum-I / Interlingua” terminology describes an ambition, not an established linguistic standard or a newly learned spoken language.
