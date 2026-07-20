# Cross-Language Parse Comparison

## Overview
- Experiment: multilingual-parse-baselines-qwen36
- Run: 2026-07-20T15-28-43-345Z
- Total Items: 16
- Total Passed: 2
- Total Failed: 1
- Total Errors: 13

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.2500 | 0.0000 | 0.4167 | 0.4167 | 49903.38 |
| Greek (el) | 4 | 1 | 0.2500 | 0.0000 | 0.2500 | 0.2500 | 20156.83 |
| Spanish (es) | 4 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 2.04 |
| Indonesian (id) | 4 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 1.13 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: English
- Fastest: Indonesian
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 0.7500

## Variance
- Exact Rate Variance: 0.015625
- Recall Variance: 0.031250
- Latency Variance: 417356478.515519

## Failure Modes
- error: attempt 1: No JSON object found in model output: 2
- kind:project_state: 1
- role:0:time:2026-09-30: 1
- error: attempt 1: Model call failed: HTTP 500 proxy error: 11
