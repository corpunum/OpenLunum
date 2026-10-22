# Error Observability

## Purpose

Support observable and reversible failure modes in Lunum:
- Error tracking with structured metadata
- Circuit-breaker pattern for cascading failure prevention
- Revert capability with snapshot/restore

## Types

### Error Severity

| Level | Description |
|-------|-------------|
| `info` | Informational, no action needed |
| `warning` | Something unusual, may need attention |
| `error` | Operation failed, may be recoverable |
| `critical` | System-level failure, likely unrecoverable |

### Circuit Breaker States

| State | Description |
|-------|-------------|
| `closed` | Normal operation, failures counted |
| `open` | Failures exceed threshold, operations blocked |
| `half-open` | Testing recovery, one success closes circuit |

### Operation Kinds

`parse` | `realize` | `render` | `classify` | `fingerprint` | `context` | `unknown`

## Architecture

```
Lunum Operation → ObservabilityTracker → errors | circuits | snapshots
                                              ↓
                                         Report/Dashboard
```

## Components

### LunumError

Structured error record:

```typescript
interface LunumError {
  id: string;           // Auto-generated: 'err-N'
  severity: ErrorSeverity;
  operation: OperationKind;
  message: string;
  code: string;         // Machine-readable error code
  timestamp: string;    // ISO 8601
  context?: Record<string, unknown>;
  recoverable: boolean;
  stackTrace?: string;
}
```

### CircuitBreaker

Prevents cascading failures:

```typescript
interface CircuitBreaker {
  name: string;
  state: CircuitState;           // closed | open | half-open
  failureCount: number;
  successCount: number;
  threshold: number;             // Failures before opening
  timeout: number;               // ms before half-open
  lastFailureAt?: string;
  lastStateChangeAt: string;
}
```

### StateSnapshot

Revert capability:

```typescript
interface StateSnapshot {
  id: string;            // Auto-generated: 'snap-N'
  timestamp: string;
  operation: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
```

## API

### createDefaultTracker()
Creates an observability tracker with default settings (max 1000 errors).

### createCircuitBreaker(name, options)
Creates a circuit breaker. Default threshold: 5 failures, timeout: 30s.

### recordError(tracker, error)
Records an error in the tracker. Auto-generates ID and timestamp.

### updateCircuitBreaker(tracker, name, success)
Updates circuit breaker state based on operation result.

### isCircuitOpen(tracker, name)
Checks if a circuit is open (should block operations).

### createSnapshot(tracker, operation, before, after)
Captures state before/after an operation for revert capability.

### validateTracker(tracker)
Validates tracker structure.

## State Machine

```
[closed] --failure--> [closed]
[closed] --failure>threshold--> [open]
[open] --timeout--> [half-open]
[half-open] --success--> [closed]
[half-open] --failure--> [open]
```

## Implementation

See `packages/core/src/error-observability.ts` for types and utilities.

## References

- VISION.md: "failures are observable and reversible"
- AGENTS.md: Error contracts section
