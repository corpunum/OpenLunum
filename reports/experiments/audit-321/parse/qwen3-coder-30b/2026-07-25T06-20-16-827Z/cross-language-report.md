# Cross-Language Parse Comparison

## Overview
- Experiment: audit-321-parse-qwen3-coder-30b
- Run: 2026-07-25T06-20-16-827Z
- Total Items: 16
- Total Passed: 4
- Total Failed: 12
- Total Errors: 0

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.2500 | 0.0000 | 0.8500 | 0.8333 | 2705.02 |
| Greek (el) | 4 | 1 | 0.2500 | 0.0000 | 0.8222 | 0.8222 | 2555.35 |
| Spanish (es) | 4 | 1 | 0.2500 | 0.0000 | 0.8222 | 0.8222 | 2453.61 |
| Indonesian (id) | 4 | 1 | 0.2500 | 0.0000 | 0.8250 | 0.8083 | 2539.14 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: English
- Fastest: Spanish
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 1.0000

## Variance
- Exact Rate Variance: 0.000000
- Recall Variance: 0.000136
- Latency Variance: 8190.735832

## Failure Modes
- negated:0.condition.0:false: 4
- negated:0:true: 4
- role:0:agent:assistant: 4
- predicate:0.condition.0:below: 4
- predicate:0:deadline: 4
- role:0.condition.0:agent:user: 2
- predicate:0.condition.0:confirmed: 1
