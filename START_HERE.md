# Start here

OpenLunum is an experimental semantic-IR toolkit. Its original code is open source under **Apache-2.0**; see [LICENSE](LICENSE) and [license scope / third-party terms](LICENSE.md).

## I want to understand or try it

Read the short [README](README.md). Then, with Node.js 22+ and pnpm 10.13.1:

```bash
git clone https://github.com/corpunum/OpenLunum.git
cd OpenLunum
corepack enable
pnpm install --frozen-lockfile
pnpm demo:core
```

The demo supplies its own Sem. It demonstrates validation, representation identity, rendering and source fallback, not automatic language understanding or compression benefit.

No local model, GPU, API key, OpenUnum installation, `agent:status`, or worker assignment is required for this walkthrough. Third-party data and models retain their separate terms.

## I found a problem or want to contribute

Open an issue with what you tried, expected and observed. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the small checklist. You do not need to read the agent operating manuals or obtain an assignment to ask a question or report a defect. Contributions should identify any third-party material and its license.

## I need the technical details

Use [architecture](docs/ARCHITECTURE.md) for the layer boundaries, [core package](packages/core/README.md) for executable operations, and [evidence/limitations](docs/LUNUM_READINESS.md) before making a support or performance claim. Read only the area-specific documents needed for the task.

## I am a managed coding/research agent

[AGENTS.md](AGENTS.md) and [the repository operating model](docs/REPOSITORY_OPERATING_MODEL.md) apply to maintainer-run automation, not ordinary visitors. Assigned workers still need explicit scope, one write owner, appropriate review, quota limits and protected-main checks. The dispatcher lock must not be bypassed.

For a proposed empirical claim, use the [experiment](docs/EXPERIMENT_PROTOCOL.md) and [evaluation](docs/EVALUATION_PROTOCOL.md) protocols. Never change protected data to make code pass. Keep original source and failed results.
