# Pi / Agy integration — Lunum native extension

**Status:** Working — native `defineTool` extension, 7 tools, direct core import.

Pi/Agy uses its own `defineTool` API from `@earendil-works/pi-coding-agent`, not MCP. This extension imports `@corpunum/lunum` directly for zero-overhead access to all core functions.

## Setup

1. Symlink the extension into Pi's extensions directory:

```bash
ln -sf /home/corpunum/OpenLunum/integrations/pi/lunum-extension.ts \
       ~/.pi/agent/extensions/openlunum-lunum.ts
```

2. Restart Pi to pick up the new extension.

## Tools

All 7 tools are registered with Pi's native `defineTool`:

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
pi --print-tools   # should list lunum_derive, lunum_validate, etc.
pi "Use lunum_derive to compact the text: The quick brown fox jumps over the lazy dog"
```

## Notes

- Pi extension uses direct `import` from `@corpunum/lunum`, not MCP over stdio
- No network roundtrip — function calls resolve in-process
- The existing `openlunum-workflow.ts` extension (`finish_work` tool) is separate and compatible
