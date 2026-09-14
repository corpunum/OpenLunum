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
| Codex CLI | Native MCP via `codex mcp add` | **Working** | Direct stdio MCP, no bridge needed |
| OpenClaw | Native MCP via `openclaw mcp add` | **Working** | Direct stdio MCP, tools available to all agents |
| OpenCode | Native MCP via `opencode mcp add` | **Working** | Direct stdio MCP, interactive TUI add only (no config file key) |
| Pi / Agy | Native `defineTool` extension | **Working** | Pi native extension is separate; AGY 1.2.2 MCP discovery passed but headless tool execution is permission-blocked |
| Gemini CLI | extension/hooks/MCP | Design | Product surface is evolving; pin tested versions |
| Generic Node agent | direct `@corpunum/lunum` dependency | Reference | Most complete reusable example after OpenUnum |

Every product guide must state the tested product version, required permissions, limitations, and removal path before promotion to Verified.
