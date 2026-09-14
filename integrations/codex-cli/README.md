# Codex integration — Lunum MCP server

**Status:** Versioned compatibility evidence — Codex CLI 0.154.0 native MCP; supplied-Sem tool path passed.

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

The current server exposes 10 tools; the tested conformance path uses:

| Tool | Description |
|---|---|
| `lunum_derive` | Sidecar from text and optional supplied Sem; no-sem mode is surface-only |
| `lunum_get_extraction_contract` | Return the generated extraction contract |
| `lunum_submit_candidate` | Contain an untrusted candidate |
| `lunum_build_candidate` | Build an untrusted frame candidate |
| `lunum_compile_context` | Compile messages into compacted context with token counts |
| `lunum_fingerprint` | Deterministic `lfp:VERSION:sha256:DIGEST` identity |
| `lunum_validate` | Validate Sem against frozen schema |
| `lunum_render` | Render Sem to compact code string |
| `lunum_compare` | Feature recall/precision between two Sems |
| `lunum_classify` | Eligibility decision for compact representation |

For the exact tested client/version, permissions, limitations, and evidence,
see [`docs/CLIENT_COMPATIBILITY.md`](../../docs/CLIENT_COMPATIBILITY.md).

## Testing

```bash
codex "Use lunum_derive to compact this text: The quick brown fox jumps over the lazy dog"
```
