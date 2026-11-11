# OpenClaw integration — Lunum MCP server

**Status:** Discovery evidence (OpenClaw 2026.11.3, 2026-11-11). Tool execution on a local model is not yet recorded; see [Limitations](#limitations).

OpenClaw has built-in MCP support. The Lunum MCP server connects over stdio and its tools become available to OpenClaw agents.

## Tested version

| Item | Value |
|---|---|
| OpenClaw | 2026.11.3 (`847611d`), npm release |
| Node for OpenClaw | 24.22.3 (OpenClaw requires `>=24.16.0 <25 \|\| >=26.1.0`) |
| Lunum MCP server | `packages/mcp` built at `35a19146` (unchanged by the evidence commit) |
| Discovery | PASS: `openclaw mcp probe` lists 12 tools |
| Execution | NOT_RUN (see Limitations) |

Evidence: [`docs/CLIENT_COMPATIBILITY.md`](../../docs/CLIENT_COMPATIBILITY.md#openclaw).

## Setup

Build the server first (`pnpm --filter @corpunum/lunum build && pnpm --filter @corpunum/lunum-mcp build`), then:

```bash
openclaw mcp add lunum \
  --command node \
  --arg /absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js \
  --env LUNUM_COMPACTION=off \
  --env LUNUM_MULTILINGUAL=off \
  --env LUNUM_CONTEXT_MODE=natural
```

`mcp add` connects and checks the server before saving it. To try it without touching your normal configuration, add `--profile <name>` to every command; state then lives under `~/.openclaw-<name>`.

Verify:

```bash
openclaw mcp list    # shows lunum
openclaw mcp probe   # "lunum: 12 tools"
```

Reload running agents after a config change:

```bash
openclaw mcp reload
```

## Permissions

- The server is a local stdio process: no network, no file writes, no credentials.
- The tools carry no MCP safety annotations yet, so `mcp probe` warns that "tools have no safety annotations" and prompting postures ask for approval on every call. Adding `readOnlyHint`/`idempotentHint` is proposed; it changes the served runtime, so it waits for a new instruction package.
- `--include` / `--exclude` restrict which Lunum tools agents see.

## Remove

```bash
openclaw mcp remove lunum
openclaw mcp reload
```

## Tools

The 12 tools are listed in [`docs/CLIENT_COMPATIBILITY.md`](../../docs/CLIENT_COMPATIBILITY.md#shared-deterministic-server).

## Limitations

- **Base prompt size on local models.** One OpenClaw agent turn sent a 57,393-token prompt. The rig's local engine took 125 s to prefill it, and OpenClaw abandoned the request at about 100 s ("Couldn't connect to the AI service", logged as a timeout). On a local model, set the provider's `timeoutSeconds` above the prefill time, and use a context window of at least 64k.
- **Node version.** The 2026.11.x releases do not start on Node 22. If the system Node is older, run OpenClaw on its own Node 24 (for example a launcher script that puts a Node 24 `bin` first on `PATH`).
- Evidence covers discovery only for this version; it does not show semantic quality or token savings.
