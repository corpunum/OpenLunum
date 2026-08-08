# OpenCode integration — Lunum MCP server

**Status:** Working — native MCP via `opencode mcp add`.

OpenCode has built-in MCP support. The Lunum MCP server connects directly over stdio.

## Setup

```bash
opencode mcp add
```

When prompted, provide:
- **Name:** `lunum`
- **Type:** stdio
- **Command:** `node`
- **Args:** `/home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js`

Or add directly to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  // ... existing config ...
  "mcpServers": {
    "lunum": {
      "command": "node",
      "args": ["/home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"],
      "env": {
        "LUNUM_COMPACTION": "auto",
        "LUNUM_MULTILINGUAL": "off",
        "LUNUM_CONTEXT_MODE": "mixed"
      }
    }
  }
}
```

Verify:

```bash
opencode mcp list   # should show lunum
```

## Tools

All 7 Lunum tools become available in OpenCode sessions:

| Tool | Description |
|---|---|
| `lunum_derive` | Text → sidecar (code + sem + fingerprint + meta) |
| `lunum_compile_context` | Compile messages into compacted context with token counts |
| `lunum_fingerprint` | Deterministic `lfp:VERSION:sha256:DIGEST` identity |
| `lunum_validate` | Validate Sem against frozen schema |
| `lunum_render` | Render Sem to compact code string |
| `lunum_compare` | Feature recall/precision between two Sems |
| `lunum_classify` | Eligibility decision for compact representation |

## Testing

```bash
opencode "Use lunum_derive to compact: The quick brown fox jumps over the lazy dog"
```
