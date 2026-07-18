# Error Observability Integration

- **Worker**: qwen
- **Area**: hardening — P2
- **Branch**: `agent/qwen/hardening/error-observability-integration`
- **Start date**: 2026-07-18
- **Dataset**: No protected dataset changes
- **Intended dataset**: Error observability integration: wire circuit-breaker and revert-capability types into the eval runner so experiments auto-halt on repeated failures.

## Hypothesis

Wiring the existing circuit-breaker and revert-capability types from @corpunum/lunum into the eval runner will provide automatic failure detection and experiment halting without manual intervention.

## Acceptance criteria

1. Circuit-breaker tracks errors per operation type
2. Auto-halt triggers after configurable threshold of consecutive failures
3. Snapshot/restore capability records before/after state
4. Integration tests verify circuit open → halt behavior
5. Observability data serializes for reports
