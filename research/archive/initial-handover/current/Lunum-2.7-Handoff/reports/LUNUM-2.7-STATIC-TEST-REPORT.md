# Lunum-2.7 Static Test Report

Generated: 2026-04-24T12:38:18.699345+00:00

## Test command

```bash
node scripts/run_static_tests_2_7.mjs
```

## Exit code

```text
0
```

## Context rough-token ratios

```text
natural: 137
lunum:   98
mixed:   103

lunum ratio: 0.715
mixed ratio: 0.752
```

## Static assertions

[
  {
    "name": "mixed ratio <= 0.90",
    "pass": true,
    "value": 0.7518248175182481
  },
  {
    "name": "lunum ratio <= 0.85",
    "pass": true,
    "value": 0.7153284671532847
  },
  {
    "name": "at least one natural fallback in mixed",
    "pass": true,
    "value": 3
  },
  {
    "name": "at least one Lunum eligible memory",
    "pass": true,
    "value": 9
  }
]

## Notes

These are static/rough-token tests only. They validate package logic and mixed-mode eligibility behavior here. SuperGemma tokenizer and model-answer tests still belong on the local machine.
