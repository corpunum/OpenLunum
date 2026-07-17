# @corpunum/lunum-mcp

MCP (Model Context Protocol) server for Lunum semantic content integration.

## Purpose

This package provides a reference implementation of an MCP server that enables AI agents to interact with Lunum semantic content through standardized tools. It is **not** a production-grade integration; it demonstrates the pattern for products that prefer MCP as an adoption path.

## Tools

| Tool | Description |
|---|---|
| `lunum_parse` | Parse natural language text into Lunum-Semantic representation |
| `lunum_realize` | Realize Lunum-Semantic representation to natural language |
| `lunum_fingerprint` | Generate or verify fingerprint for Lunum-Semantic content |
| `lunum_retrieve` | Retrieve Lunum records by fingerprint or query |
| `lunum_validate` | Validate Lunum-Semantic content against schema |

## Architecture

```
MCP client (agent)
    ↓
LunumMcpServer (this package)
    ↓
LunumContextManager (in-memory store)
    ↓
@corpunum/lunum (core, via workspace dependency)
```

## Usage

```typescript
import { createLunumMcpServer } from '@corpunum/lunum-mcp';

const server = createLunumMcpServer({
  serverInfo: { name: 'my-lunum-server', version: '0.2.0' },
  maxContextItems: 1000,
  enableValidation: true
});

await server.start();

// The server exposes standard MCP tools
// Tools can be called via the MCP protocol
```

## Limitations

- Tool handlers use placeholder implementations; production use requires wiring to the real `@corpunum/lunum` core functions.
- Context storage is in-memory; persistent backends require a custom adapter.
- Only tested against the MCP reference server interface; compatibility with specific MCP clients may vary.

## Status

**Prototype.** Reference implementation exists and builds. Production validation against live MCP clients is pending.
