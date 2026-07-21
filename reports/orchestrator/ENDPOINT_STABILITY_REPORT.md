# Local Endpoint Stability Report (Issue #272)

## Status: STABLE / VERIFIED

### Probed Endpoints

1. **`openai/qwen3.6-35b-a3b`**
   - **Port:** `42181` (direct llama-server) / `8080` (router)
   - **PID:** 3970858
   - **Model:** `Qwen3.6-35B-A3B MTP`
   - **Probes Attempted:** 5 consecutive requests
   - **HTTP Status:** 200 OK across all 5 runs
   - **Transport Failures / HTTP 500:** 0
   - **Notes:** Endpoint uses MTP + thinking content; requires `max_tokens >= 256` to allow thinking tokens + output content completion.

2. **`openai/qwen3-coder-30b-a3b`**
   - **Port:** `48127` (direct llama-server)
   - **PID:** 2446669
   - **Model:** `Qwen3-Coder-30B-A3B`
   - **Probes Attempted:** 5 consecutive requests
   - **HTTP Status:** 200 OK across all 5 runs
   - **Transport Failures / HTTP 500:** 0

### Summary

Both local endpoints are confirmed operational and stable. PR #260's diagnostic runs are archived and marked rejected; no model capability scores will be derived from them. Issue #253 unblocked for Semantics 0.2 migration and evaluation runs.
