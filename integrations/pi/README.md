# Pi integration — Lunum native extension

**Status:** Versioned evidence (pi 0.84.0, 2026-11-11): the extension loads, and the local model called a Lunum tool successfully and also hit its error path.

Pi uses its own `defineTool` API from `@earendil-works/pi-coding-agent`, not MCP. This extension imports the built OpenLunum core directly, so calls run in-process with no MCP roundtrip.

## Tested version

| Item | Value |
|---|---|
| pi | 0.84.0 (`@earendil-works/pi-coding-agent`) |
| Model | local `qwen3.8-flash-next`, provider `openai-completions` with `compat.supportsDeveloperRole: false` |
| Extension | `integrations/pi/lunum-extension.ts`, 7 tools, at the commit that records this evidence |
| Execution | PASS: `lunum_derive` returned a sidecar; the model replied with its fingerprint unchanged |
| Error path | PASS: an invalid Sem makes `lunum_fingerprint` fail with `isError: true` |

Evidence: [`docs/CLIENT_COMPATIBILITY.md`](../../docs/CLIENT_COMPATIBILITY.md#pi).

## Setup

1. Build the core: `pnpm --filter @corpunum/lunum build`.
2. Link the extension into Pi's extensions directory:

```bash
ln -sf /absolute/path/to/OpenLunum/integrations/pi/lunum-extension.ts \
       ~/.pi/agent/extensions/openlunum-lunum.ts
```

3. If the checkout is not at `/home/corpunum/OpenLunum`, set `LUNUM_CORE_PATH` to `<checkout>/packages/core/dist/src/index.js` in Pi's environment.
4. Restart Pi.

To try it without touching your Pi setup: `PI_CODING_AGENT_DIR=<empty dir with a models.json> pi -p -ne -e <path>/lunum-extension.ts ... </dev/null`.

## Tools

`lunum_derive`, `lunum_compile_context`, `lunum_fingerprint`, `lunum_validate`, `lunum_render`, `lunum_compare`, `lunum_classify`. The MCP-only tools (`lunum_get_extraction_contract`, `lunum_submit_candidate`, `lunum_build_candidate`, `lunum_analyze_discourse`, `lunum_compact_messages`) are not in this extension.

## Permissions

The tools are pure functions of their input. They do no file, network or session writes.

## Remove

```bash
rm ~/.pi/agent/extensions/openlunum-lunum.ts
```

Then restart Pi.

## Limitations and traps

- **Errors must throw.** Pi marks a tool call as failed only when `execute` throws. Before 2026-11-11 the extension returned `{ isError: true }`, which Pi reported to the model as a success.
- **`pi -p` reads stdin.** In a non-interactive shell, give it `</dev/null`, or it waits indefinitely.
- **Local Qwen templates** reject the `developer` role ("Unexpected message role"). Set `compat.supportsDeveloperRole: false` on the provider.
- The extension has 7 of the server's 12 tools. Use the MCP server through another client for the candidate and discourse tools.
- The evidence covers this version, this model and one synthetic sentence. It is not evidence of semantic quality or token savings.
