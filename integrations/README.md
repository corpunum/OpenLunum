# Integration matrix

Status labels:

- **Verified-current-state:** current product code/docs inspected; Lunum integration may still be proposed.
- **Reference:** complete implementation pattern and tests exist.
- **Prototype:** working integration exists but lacks production validation.
- **Design:** adoption path based on documented extension surfaces; not yet exercised end to end.
- **Evaluation-only:** no live integration is claimed.

| Product | Preferred path | Status | Notes |
|---|---|---|---|
| OpenUnum | package dependency + product adapter | Verified-current-state / Reference plan | Detailed gap analysis against current private repo |
| Claude Code | MCP server over stdio via `.mcp.json` | **Working** | 7 real tools wired to core functions; auto-discovered by Claude Code |
| Codex CLI | `AGENTS.md` + MCP + repo dependency | Design | Best for repository adoption and explicit Lunum tools |
| Gemini CLI / transition path | extension/hooks/MCP | Design | Product surface is evolving; pin tested versions |
| OpenCode | plugin + MCP | Design | Use plugin lifecycle where context control is available |
| Pi | TypeScript extension/package | Design | Self-extensible runtime; sandbox separately |
| OpenClaw | skill for guidance + native extension/service for runtime | Design | A text skill alone is not a full memory integration |
| Generic Node agent | direct `@corpunum/lunum` dependency | Reference | Most complete reusable example after OpenUnum |

Every product guide must state the tested product version, required permissions, limitations, and removal path before promotion to Verified.
