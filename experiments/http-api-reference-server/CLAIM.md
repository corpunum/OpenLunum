# HTTP API Reference Server

- **Worker**: qwen
- **Area**: adoption — release gate 6 (P1)
- **Branch**: `agent/qwen/adoption/http-api-server`
- **Start date**: 2026-07-18
- **Dataset**: No protected dataset changes
- **Intended dataset**: Add a third adoption path: HTTP API reference server (extend the MCP package or create `packages/api`) with OpenAPI spec and integration tests.

## Hypothesis

An HTTP API reference server built on Node.js built-in HTTP provides a viable third adoption path for Lunum, alongside the existing MCP server and CLI pipeline.

## Acceptance criteria

1. HTTP API server starts, serves routes, and responds to requests
2. OpenAPI 3.1.0 spec is valid and complete
3. All endpoints return correct Lunum-compatible responses
4. Integration tests verify full request/response cycle
5. Server follows Lunum adoption patterns (pinned dependency, preserves natural content)
