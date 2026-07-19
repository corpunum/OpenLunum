# Claim: Quality Gate CLI Integration

- **Worker:** agent/qwen
- **Area:** safety / quality-gate
- **Branch:** agent/qwen/retention/quality-gate-cli
- **Start Date:** 2026-07-19
- **Intended Dataset:** quality gate CI integration

## Background

STATUS.md lists "Quality gate CI integration" as Prototype status. The existing implementation has:
- A unified quality gate runner in `packages/core/src/quality-gate-ci.ts`
- 8 tests in `packages/core/test/quality-gate-ci.test.ts`
- A CI workflow at `.github/workflows/quality-gate.yml`

What's missing:
1. CLI command for running quality gates standalone
2. More comprehensive tests

## Goal

Upgrade Quality Gate CI integration from Prototype to Reference implementation by:
1. Adding a `lunum quality-gate` CLI command
2. Adding comprehensive tests

## Deliverables

1. `lunum quality-gate --records <file> [--min-pass-rate 0.8] [--strict] [--output report.md]` CLI command
2. 16 tests (up from 8) covering edge cases, selective gates, strict mode, etc.
