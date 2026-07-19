# @corpunum/lunum-api

## HTTP API Reference Server for Lunum

An HTTP API reference server that exposes Lunum semantic content operations as REST endpoints.

### What it provides

- **Parse** — Convert natural-language text into structured Lunum-Sem records
- **Realize** — Convert Lunum-Sem records into readable realization text
- **Render** — Convert Lunum-Sem records into compact Lunum-Code
- **Retrieve** — Search Lunum records by fingerprint or near-fingerprint
- **Health** — Server health and capabilities check
- **Routes** — List all available endpoints and their schemas

### OpenAPI spec

The server ships with a bundled OpenAPI 3.1.0 specification (`openapi.json`) that documents all endpoints, request/response schemas, and error contracts.

### Adoption path

This package implements the **third adoption path** for OpenLunum:

1. **MCP reference server** (`packages/mcp`) — Tool-based integration via Model Context Protocol
2. **CLI pipeline** (`packages/cli`) — Standalone command-line adoption
3. **HTTP API reference server** (`packages/api`) — REST API with OpenAPI spec

### Usage

```bash
# Build
pnpm build

# Run in development mode
pnpm dev

# Run in production mode
pnpm start

# Run tests
pnpm test:unit
```

### API server options

The server accepts configuration for:

- `port` — HTTP listen port (default: 3000)
- `host` — Bind address (default: `0.0.0.0`)
- `logLevel` — Logging verbosity

### Error contracts

All endpoints return structured error responses with:

- `error.type` — Machine-readable error category
- `error.message` — Human-readable description
- `error.requestId` — Unique request correlation ID

### Integration notes

- Depends on `@corpunum/lunum` (core library) via workspace dependency
- Requires Node.js ≥ 22.0.0
- No external service dependencies; fully self-contained
- Can be deployed as a standalone service or embedded in larger products
