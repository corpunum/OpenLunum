# API Stability Tests

- **Worker**: qwen
- **Area**: hardening — P2
- **Branch**: `agent/qwen/hardening/api-stability-tests`
- **Start date**: 2026-07-18
- **Dataset**: No protected dataset changes
- **Intended dataset**: Add `packages/core` API stability tests: snapshot all public exports and fail CI if any are removed or have breaking signature changes without a major version bump.

## Hypothesis

A golden-snapshot approach to API stability testing can detect breaking changes (removed exports, signature changes) and non-breaking changes (new exports) automatically in CI.

## Acceptance criteria

1. Golden snapshot covers all public exports from packages/core
2. Tests verify no exports are removed (breaking change)
3. Tests verify no signatures change (breaking change)
4. Tests verify expected modules and export types exist
5. Snapshot file is generated and loadable
