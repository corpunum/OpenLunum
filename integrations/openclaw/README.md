# OpenClaw integration — Lunum MCP server

**Status:** Working — native MCP via `openclaw mcp add`.

OpenClaw has built-in MCP support. The Lunum MCP server connects directly over stdio and exposes all 7 tools to all OpenClaw agents (main, coder, tester, frontend).

## Setup

```bash
openclaw mcp add lunum \
  --command node \
  --arg /home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js \
  --env LUNUM_COMPACTION=auto \
  --env LUNUM_MULTILINGUAL=off \
  --env LUNUM_CONTEXT_MODE=mixed
```

Verify:

```bash
openclaw mcp list    # should show lunum
openclaw mcp probe   # should list all 7 tools
```

Reload after config changes:

```bash
openclaw mcp reload
```

## Remove

```bash
openclaw mcp remove lunum
```

## Tools

All 7 Lunum tools become available in OpenClaw sessions:

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

Via Telegram or any connected channel:

```
Use lunum_derive to compact: The quick brown fox jumps over the lazy dog
```

Or via CLI:

```bash
openclaw chat "Use lunum_derive on 'Hello world'"
```
