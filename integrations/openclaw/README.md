# OpenClaw integration — Lunum MCP server

**Status:** Versioned evidence (OpenClaw 2026.11.3, 2026-11-11): discovery, plus one tool execution on the local model.

OpenClaw has built-in MCP support. The Lunum MCP server connects over stdio and its tools become available to OpenClaw agents.

## Tested version

| Item | Value |
|---|---|
| OpenClaw | 2026.11.3 (`847611d`), npm release |
| Node for OpenClaw | 24.22.3 (OpenClaw requires `>=24.16.0 <25 \|\| >=26.1.0`) |
| Lunum MCP server | `packages/mcp` built at `35a19146` (unchanged by the evidence commit) |
| Discovery | PASS: `openclaw mcp probe` lists 12 tools |
| Execution | PASS: `openclaw agent --local` loaded the tool through `tool_search`, called `lunum__lunum_derive` once (0 failures) and replied with the server's fingerprint unchanged |
| Model | local `qwen3.8-flash-next`, provider `openai-completions`, `timeoutSeconds: 600` |

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

- **Prompt size and timeout on local models.**
  - The first turn of a fresh profile sent a 57,393-token prompt. The rig's local engine took 125 s to prefill it, and OpenClaw abandoned the request at about 100 s ("Couldn't connect to the AI service", logged as a timeout).
  - The recorded run used `timeoutSeconds: 600`. It completed in 51 s with 15–17k-token prompts.
  - On a local model, set the provider's `timeoutSeconds` to at least 300 and use a context window of at least 64k.
- **Node version.** The 2026.11.x releases do not start on Node 22. If the system Node is older, run OpenClaw on its own Node 24 (for example a launcher script that puts a Node 24 `bin` first on `PATH`).
- OpenClaw loads MCP tools lazily (`tool_search`), so the first call costs an extra model turn.
- The evidence covers this version, this model and one synthetic sentence. It is not evidence of semantic quality or token savings.
