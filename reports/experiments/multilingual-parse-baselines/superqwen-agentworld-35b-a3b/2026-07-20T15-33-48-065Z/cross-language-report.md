# Cross-Language Parse Comparison

## Overview
- Experiment: multilingual-parse-baselines-superqwen
- Run: 2026-07-20T15-33-48-065Z
- Total Items: 16
- Total Passed: 1
- Total Failed: 0
- Total Errors: 15

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.2500 | 0.0000 | 0.2500 | 0.2500 | 51996.25 |
| Greek (el) | 4 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 1.24 |
| Spanish (es) | 4 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 1.22 |
| Indonesian (id) | 4 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.71 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: English
- Fastest: Indonesian
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 0.7500

## Variance
- Exact Rate Variance: 0.011719
- Recall Variance: 0.011719
- Latency Variance: 506906306.733748

## Failure Modes
- error: attempt 1: Expected double-quoted property name in: 1
- error: attempt 1: Model call failed: HTTP 500 proxy error: 14
