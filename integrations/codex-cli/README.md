# Codex CLI adoption profile

**Status:** Design, based on official `AGENTS.md` and MCP support.

Preferred options:

- Put repository adoption instructions in `AGENTS.md`, pointing Codex to the OpenLunum integration contract.
- Add the Lunum MCP server for explicit encode/validate/compile tools.
- For a product being modified by Codex, add `@corpunum/lunum` as a normal dependency and keep a product-owned adapter.

`AGENTS.md` guides implementation; it is not itself a runtime memory integration. MCP tools can provide operations, but the host product must still decide when Lunum enters persistent memory or model context.

Official references:
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/extend/mcp?surface=cli
