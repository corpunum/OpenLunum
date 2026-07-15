# Lunum-2.7 Handoff

Lunum-2.7 is the **Production Shadow Integration** release.

It assumes Lunum-2.6 passed mixed-mode multi-memory testing on your local SuperGemma setup.

## Purpose

Move from benchmark packages to a product integration path:

1. Add memory sidecar fields.
2. Store original text + Lunum-Sem + Lunum-FP + Lunum-Code.
3. Compile natural, Lunum, and mixed contexts.
4. Run mixed mode in shadow before enabling it for user-visible answers.
5. Log failures and update eligibility rules.

## Start here

- `docs/LUNUM-2.7-SHADOW-INTEGRATION.md`
- `docs/LUNUM-2.7-PRODUCT-ROLLOUT.md`
- `docs/CODEX-LUNUM-2.7-PLAN.md`

## Static tests

```bash
node scripts/run_static_tests_2_7.mjs
```

## Dry compile

```bash
node scripts/compile_context_2_7.mjs
```

## Shadow token check

```bash
node scripts/shadow_eval_2_7.mjs --server http://127.0.0.1:18084
```
