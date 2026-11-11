# Integration matrix

Status labels:

- **Working:** integration code exists, tested, and documented with setup instructions.
- **Verified-current-state:** current product code/docs inspected; Lunum integration may still be proposed.
- **Reference:** complete implementation pattern and tests exist.
- **Design:** adoption path based on documented extension surfaces; not yet exercised end to end.
- **Evaluation-only:** no live integration is claimed.

| Product | Preferred path | Status | Notes |
|---|---|---|---|
| OpenUnum | package dependency + product adapter | Verified-current-state / Reference plan | Detailed gap analysis against current private repo |
| Claude Code | MCP server over stdio via `.mcp.json` | **Versioned evidence** | Claude Code 2.1.270: ten tools discovered and exercised with supplied Sem; see `docs/CLIENT_COMPATIBILITY.md` |
| Codex CLI | Native MCP via `codex mcp add` | **Versioned evidence** | Codex CLI 0.154.0 direct stdio MCP; supplied-Sem execution passed |
| OpenClaw | Native MCP via `openclaw mcp add` | **Versioned evidence** | OpenClaw 2026.11.3 on Node 24 with local Qwen: 12 tools probed, `lunum_derive` execution passed (provider timeout ≥ 300 s) |
| OpenCode | Native MCP, `mcp` key in `opencode.jsonc` | **Versioned evidence** | OpenCode 1.18.33 with local Qwen: discovery and `lunum_derive` execution passed |
| Pi | Native `defineTool` extension | **Versioned evidence** | pi 0.84.0 with local Qwen: 7-tool extension, execution and error path passed |
| AGY | Native MCP | **Discovery evidence** | AGY 1.2.2 discovered Lunum schemas; headless MCP execution was permission-blocked |
| Gemini CLI | extension/hooks/MCP | Design | Product surface is evolving; pin tested versions |
| Generic Node agent | direct `@corpunum/lunum` dependency | Reference | Most complete reusable example after OpenUnum |
| Source locator (optional) | separate `lunum-locator-mcp` over stdio, backed by an unumsearch daemon | Evaluation-only (diagnostic) | [`source-locator/`](source-locator/README.md); measured in `experiments/source-locator-v1`: grounding precision 0.40, so diagnostic only |

Every product guide must state the tested product version, required permissions, limitations, and removal path before promotion to Verified.
