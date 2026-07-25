# Cross-Language Parse Comparison

## Overview
- Experiment: audit-321-parse-qwen36-35b
- Run: 2026-07-25T06-09-46-753Z
- Total Items: 16
- Total Passed: 9
- Total Failed: 7
- Total Errors: 0

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 2 | 0.5000 | 0.2500 | 0.9444 | 0.9444 | 29757.50 |
| Greek (el) | 4 | 2 | 0.5000 | 0.2500 | 0.9472 | 0.9472 | 38227.62 |
| Spanish (es) | 4 | 2 | 0.5000 | 0.2500 | 0.9194 | 0.9194 | 35204.37 |
| Indonesian (id) | 4 | 3 | 0.7500 | 0.0000 | 0.9167 | 0.9167 | 33644.90 |

## Cross-Language Analysis
- Best Exact Rate: Indonesian
- Best Recall: Greek
- Fastest: English
- Overall Near-Semantic-Only Rate: 0.1875
- Consistency Score: 0.7500

## Variance
- Exact Rate Variance: 0.011719
- Recall Variance: 0.000195
- Latency Variance: 9318521.000224

## Failure Modes
- predicate:0.condition.0:confirmed: 4
- role:0:agent:assistant: 3
- predicate:0.condition.0:below: 2
- kind:safety_constraint: 1
