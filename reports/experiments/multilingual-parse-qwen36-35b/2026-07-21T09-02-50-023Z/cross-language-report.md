# Cross-Language Parse Comparison

## Overview
- Experiment: multilingual-parse-qwen36-35b
- Run: 2026-07-21T09-02-50-023Z
- Total Items: 16
- Total Passed: 8
- Total Failed: 7
- Total Errors: 1

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.2500 | 0.2500 | 0.6944 | 0.6944 | 35737.74 |
| Greek (el) | 4 | 2 | 0.5000 | 0.0000 | 0.9472 | 0.9472 | 31829.98 |
| Spanish (es) | 4 | 2 | 0.5000 | 0.2500 | 0.8917 | 0.8917 | 37692.99 |
| Indonesian (id) | 4 | 3 | 0.7500 | 0.0000 | 0.9444 | 0.9444 | 34419.11 |

## Cross-Language Analysis
- Best Exact Rate: Indonesian
- Best Recall: Greek
- Fastest: Greek
- Overall Near-Semantic-Only Rate: 0.1250
- Consistency Score: 0.5000

## Variance
- Exact Rate Variance: 0.031250
- Recall Variance: 0.010698
- Latency Variance: 4539314.136674

## Failure Modes
- error: attempt 1: No JSON object found in model output: 1
- predicate:0.condition.0:confirmed: 4
- role:0:agent:assistant: 3
- predicate:0.condition.0:below: 2
- kind:safety_constraint: 1
