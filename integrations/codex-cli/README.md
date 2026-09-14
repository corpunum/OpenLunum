# Codex integration — Lunum MCP server

**Status:** Working — native MCP via `codex mcp add`.

Codex has built-in MCP support. The Lunum MCP server connects directly over stdio.

## Setup

```bash
codex mcp add lunum \
  --env LUNUM_COMPACTION=auto \
  --env LUNUM_MULTILINGUAL=off \
  --env LUNUM_CONTEXT_MODE=mixed \
  -- node /home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js
```

Verify:

```bash
codex mcp list   # should show lunum as enabled
```

## Remove

```bash
codex mcp remove lunum
```

## Tools

All 7 Lunum tools become available in Codex sessions:

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
codex "Use lunum_derive to compact this text: The quick brown fox jumps over the lazy dog"
```
