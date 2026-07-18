# Verify Strict Mode

- **Worker**: qwen
- **Area**: hardening — P2
- **Branch**: `agent/qwen/hardening/verify-strict-mode`
- **Start date**: 2026-07-18
- **Dataset**: No protected dataset changes
- **Intended dataset**: Add a `pnpm verify --strict` mode that also runs slow property tests, schema-drift checks, and the full eval smoke suite — gate nightly on this.

## Hypothesis

A `verify:strict` script that extends the standard verify with slow property tests, schema-drift checks, and full eval smoke provides a comprehensive gate for nightly CI.

## Acceptance criteria

1. `verify:strict` script exists in root package.json
2. Runs standard verify (typecheck + test + smoke)
3. Includes slow property tests
4. Includes schema-drift checks
5. Includes full eval smoke suite with all options
