# @corpunum/lunum-api

**Experimental HTTP reference scaffold, not a production semantic service.**

The server and protocol tests exist, but several operations in [src/server.ts](src/server.ts) are placeholders:

| Route | Current implementation boundary |
|---|---|
| `/parse` | Calls `buildDefaultSem`, not a configured general natural-language model parser. |
| `/realize` | Constructs a `Realized:` diagnostic string, not demonstrated multilingual realization. |
| `/render` | Returns a `rendered/<profile>/<kind>` placeholder, not the core renderer's semantic output. |
| `/retrieve` | Returns an empty results array, not a persistent semantic search engine. |
| `/context` | Delegates to shadow-context compilation. |

Routes may have a configured prefix; the [server](src/server.ts) is authoritative. Auth/rate-limit/schema tests do not turn placeholder handlers into capability evidence.

For the working supplied-Sem library path, use the [core example](../../examples/structured-record-demo.mjs). For agent construction/submission, inspect [MCP](../mcp/README.md).

From the repository root, the maintainer test/build paths are:

```bash
pnpm build
pnpm --filter @corpunum/lunum-api test:unit
```

Do not deploy this scaffold as a general parser or retrieval service based on its route names or OpenAPI descriptions. The [repository license](../../LICENSE.md) and [current limitations](../../docs/LUNUM_READINESS.md) apply.
