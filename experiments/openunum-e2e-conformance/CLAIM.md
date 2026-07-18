# OpenUnum End-to-End Conformance Verification

- **Worker**: qwen
- **Area**: adoption — release gate 6 (P1)
- **Branch**: `agent/qwen/adoption/openunum-e2e-conformance`
- **Start date**: 2026-07-18
- **Dataset**: Existing Lunum test fixtures (no protected dataset changes)
- **Intended dataset**: Verify the OpenUnum adapter end-to-end: install, configure, run in shadow mode, compare outputs to direct API — publish a conformance report.

## Hypothesis

The `@corpunum/lunum-openunum` adapter correctly preserves Lunum-Sem semantics when used in shadow mode, with measurable delta between shadow and production outputs.

## Acceptance criteria

1. Adapter installs and configures without errors
2. Shadow mode processes a diverse record set (preference, safety, conditional, negation)
3. Shadow outputs are compared to direct API outputs with structured diff
4. Conformance report is generated with pass/fail per test category
