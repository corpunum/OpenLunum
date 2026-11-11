# OpenCode integration — Lunum MCP server

**Status:** Versioned evidence (OpenCode 1.18.33, 2026-11-11): discovery and one tool execution on the local model.

OpenCode has built-in MCP support. The Lunum MCP server connects over stdio as a `local` MCP server.

## Tested version

| Item | Value |
|---|---|
| OpenCode | 1.18.33 |
| Model | local `qwen3.8-flash-next` through an OpenAI-compatible endpoint (`@ai-sdk/openai-compatible`) |
| Lunum MCP server | `packages/mcp` built at `35a19146` (unchanged by the evidence commit) |
| Discovery | PASS: `opencode mcp list` shows `lunum connected` |
| Execution | PASS: `opencode run` called `lunum_derive` once; the reply carried the server's fingerprint unchanged |

Evidence: [`docs/CLIENT_COMPATIBILITY.md`](../../docs/CLIENT_COMPATIBILITY.md#opencode).

## Setup

Build the server first (`pnpm --filter @corpunum/lunum build && pnpm --filter @corpunum/lunum-mcp build`). Then add an `mcp` entry to `~/.config/opencode/opencode.jsonc` (merge it; do not replace the file):

```jsonc
{
  "mcp": {
    "lunum": {
      "type": "local",
      "command": ["node", "/absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"],
      "enabled": true,
      "environment": {
        "LUNUM_COMPACTION": "off",
        "LUNUM_MULTILINGUAL": "off",
        "LUNUM_CONTEXT_MODE": "natural"
      }
    }
  }
}
```

The key is `mcp` with `type: "local"` and `command` as one array. An `mcpServers` key (the earlier version of this guide) is not read by OpenCode. `opencode mcp add` is interactive.

To try it without touching your configuration, put the entry in a separate file and point `OPENCODE_CONFIG` at it; OpenCode merges it over the global config for that run.

Verify:

```bash
opencode mcp list   # "✓ lunum connected"
```

Bounded test:

```bash
opencode run --format json -m <provider>/<model> \
  'Call the tool lunum_derive exactly once with text "Maria prefers quiet mode." Then reply with only the fingerprint value from the result.'
```

## Permissions

- The server is a local stdio process: no network, no file writes, no credentials.
- The tools carry no MCP safety annotations yet (a change is proposed; it needs a new instruction package because it changes the served runtime).
- OpenCode exposes the tools as `lunum_<tool>`, so `lunum_derive` appears as `lunum_lunum_derive`. Permission rules must use that prefixed name.

## Remove

Delete the `lunum` entry under `mcp` (or set `"enabled": false`) and restart OpenCode.

## Limitations

- The recorded run took 2 min 24 s wall-clock for one tool call on the local model; most of it is OpenCode's own system prompt and agent loop, not the Lunum call.
- The run proves this version, this model route and this synthetic sentence only. It is not evidence of semantic quality or token savings.
