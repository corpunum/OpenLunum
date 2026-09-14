# API Service Failover Procedures

**R14.6 — Operational readiness**

## Overview

When the Lunum API service encounters dependency failures, it follows documented
failover procedures to minimize impact and guide operators through recovery.

The service exposes two endpoints for monitoring:

| Endpoint | Purpose | HTTP Status |
|---|---|---|
| `GET /health` | Liveness check — process is running and dependencies are reachable | 200 |
| `GET /ready` | Readiness check — all critical components are ready to serve requests | 200 |

Both endpoints return JSON. The service always returns 200; the JSON body
describes the actual state (`ok`, `degraded`, or `unhealthy` for health;
`ready` or `not-ready` for readiness).

## Health endpoint

`GET /health` returns:

```json
{
  "status": "ok",
  "version": "0.2.0",
  "uptime": 1234,
  "lunumVersion": "0.2.0",
  "routes": 8,
  "dependencies": [
    { "name": "core", "status": "ok", "detail": "Lunum core library loaded", "latencyMs": 0 },
    { "name": "datastore", "status": "ok", "detail": "Datastore connected", "latencyMs": 0 },
    { "name": "model", "status": "ok", "detail": "Model endpoint reachable", "latencyMs": 0 }
  ]
}
```

**Status rules:**
- `ok` — all dependencies report `ok`.
- `degraded` — at least one dependency reports `degraded` and none report `unhealthy`.
- `unhealthy` — at least one dependency reports `unhealthy`.

## Ready endpoint

`GET /ready` returns:

```json
{
  "state": "ready",
  "version": "0.2.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "components": [
    { "component": "model", "ready": true, "detail": "Model endpoint reachable" },
    { "component": "schema", "ready": true, "detail": "Schema loaded" },
    { "component": "auth", "ready": true, "detail": "Auth configured" }
  ]
}
```

**State rules:**
- `ready` — all components report `ready: true`.
- `not-ready` — at least one component reports `ready: false`.

## Failover procedures

The API service defines five documented failover procedures:

### 1. Model endpoint recovery

**Trigger:** `model` dependency reports `unhealthy`

1. Log the model health check failure with timestamp and error detail.
2. Attempt first retry after 1 second.
3. Attempt second retry after 2 seconds (exponential backoff).
4. Attempt third retry after 4 seconds.
5. If all retries fail, mark model as unavailable and route parse/realize
   requests to queue.
6. Send alert to operations channel with model endpoint and error details.
7. Continue serving `/health` and `/ready` with degraded status.

**Verification:** Confirm model health check passes and queued requests are processed.

**Max recovery time:** 10 seconds

### 2. Datastore connection recovery

**Trigger:** `datastore` dependency reports `unhealthy`

1. Log the datastore connection failure.
2. Close the existing connection and clear any pending transactions.
3. Re-establish connection with new parameters.
4. Run schema version check to ensure compatibility.
5. Verify read/write with a test record.
6. If recovery fails, mark datastore as unavailable and return 503 on
   data-dependent endpoints.

**Verification:** Confirm datastore health check passes and test read/write succeeds.

**Max recovery time:** 15 seconds

### 3. Core library restart

**Trigger:** `core` dependency reports `unhealthy`

1. Log the core library error with stack trace.
2. Trigger a graceful shutdown of the current process.
3. Wait up to 5 seconds for active requests to complete.
4. Restart the process with clean state.
5. Run startup health checks on all dependencies.
6. If startup fails, retry once more before declaring outage.

**Verification:** Confirm all health checks pass after restart and uptime resets.

**Max recovery time:** 10 seconds

### 4. Authentication degradation

**Trigger:** `auth` component reports `ready: false`

1. Log the auth service failure.
2. Switch to cached authentication mode (last known valid tokens).
3. Return 200 with cached auth for existing tenants.
4. Return 401 for new tenants until auth is restored.
5. Send alert to operations channel.
6. Resume normal auth when service recovers.

**Verification:** Confirm cached auth works for existing tenants and new tenant
requests return 401.

**Max recovery time:** 5 seconds

### 5. Full system restart

**Trigger:** Two or more components report `unhealthy` simultaneously

1. Log all unhealthy components and their status.
2. Initiate graceful shutdown: stop accepting new requests, complete in-flight
   requests.
3. Wait up to 10 seconds for graceful shutdown.
4. Force shutdown if graceful period expires.
5. Restart the process.
6. Run all health checks on startup.
7. Verify each dependency before marking service ready.
8. If any critical dependency fails, report specific failure and keep process
   running.

**Verification:** Confirm all components report `ok` status and service responds
on `/health` and `/ready`.

**Max recovery time:** 20 seconds

## Decision logic

The service uses the following rules to select failover procedures:

1. If **half or more** components are `unhealthy`, execute **full system restart**.
2. Otherwise, execute the specific procedure for each `unhealthy` component.
3. `degraded` components do not trigger failover but are included in the health
   response.

## Recoverability

A condition is considered **recoverable** when:

- No more than one critical component has been unhealthy for longer than the
  maximum downtime threshold (60 seconds by default).
- The condition can be addressed by a single documented failover procedure.

If the condition is **unrecoverable**, operators should escalate and consider
a manual intervention or full system restart.

## Monitoring integration

These endpoints are designed for integration with common monitoring systems:

- **Kubernetes:** Use `/health` as `livenessProbe` and `/ready` as `readinessProbe`.
- **Prometheus:** Expose `/health` as a text-format metrics endpoint or scrape
  the JSON response via an adapter.
- **PagerDuty/Opsgenie:** Configure alerts on `status: unhealthy` or
  `state: not-ready` for more than N consecutive checks.

## Default dependency configuration

The server initializes with three default dependencies:

| Name | Description | Initial Status |
|---|---|---|
| `core` | Lunum core library loaded | `ok` |
| `datastore` | Datastore connected | `ok` |
| `model` | Model endpoint reachable | `ok` |

These can be overridden via `server.setDependencies()` for custom environments
(e.g., when the datastore or model endpoint is unavailable during testing).

## Default component configuration

The ready endpoint initializes with three default components:

| Component | Description | Initial Ready |
|---|---|---|
| `model` | Model endpoint reachable | `true` |
| `schema` | Schema loaded | `true` |
| `auth` | Auth configured | `true` |

These can be overridden via `server.setReadyDetails()` for custom environments
(e.g., during deployment when the model endpoint is not yet reachable).
