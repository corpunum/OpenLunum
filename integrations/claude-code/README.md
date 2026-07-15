# Claude Code adoption profile

**Status:** Design, based on official hooks and MCP surfaces.

Preferred options:

1. A project plugin or committed `.claude/settings.json` hooks can call the Lunum CLI/service at `SessionStart`, `UserPromptSubmit`, `PreCompact`, `PostCompact`, and `SessionEnd`.
2. An MCP server can expose explicit `lunum.encode`, `lunum.validate`, `lunum.inspect`, and `lunum.compile_context` tools.
3. A repository `CLAUDE.md`/rules file should explain when the agent is integrating Lunum versus merely using a tool.

Do not inject compact context into every prompt by default. Hooks must preserve source evidence and avoid blocking or rewriting safety-critical instructions.

Official references:
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/mcp
