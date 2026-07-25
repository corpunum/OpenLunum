# Cross-Language Parse Comparison

## Overview
- Experiment: audit-321-parse-qwen36-35b
- Run: 2026-07-25T17-57-09-870Z
- Total Items: 16
- Total Passed: 15
- Total Failed: 1
- Total Errors: 0

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 4 | 1.0000 | 0.0000 | 1.0000 | 1.0000 | 34627.91 |
| Greek (el) | 4 | 3 | 0.7500 | 0.0000 | 0.9444 | 0.9444 | 32595.85 |
| Spanish (es) | 4 | 4 | 1.0000 | 0.0000 | 1.0000 | 1.0000 | 33949.75 |
| Indonesian (id) | 4 | 4 | 1.0000 | 0.0000 | 1.0000 | 1.0000 | 34292.27 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: English
- Fastest: Greek
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 0.7500

## Variance
- Exact Rate Variance: 0.011719
- Recall Variance: 0.000579
- Latency Variance: 595625.891646

## Failure Modes
- kind:safety_constraint: 1
- role:0.condition.0:agent:user: 1
