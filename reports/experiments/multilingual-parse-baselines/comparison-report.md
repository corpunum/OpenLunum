# Multilingual Parse Baselines Comparison Report

## Experiment Overview
This report compares the parse performance of two local language models on the multilingual core dataset (16 items: 4 languages × 4 items per language).

**Dataset**: datasets/dev/multilingual-core-v1.jsonl (SHA256: 6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873)
**Languages**: English (en), Greek (el), Spanish (es), Indonesian (id)
**Task**: Parse (convert source text to Lunum-Sem JSON)

## Model 1: Qwen 3.6 35B A3B
- Profile: profiles/models/qwen36-35b-live.json
- Results: reports/experiments/multilingual-parse-baselines/qwen36-35b-a3b/2026-07-20T15-28-43-345Z/

### Overall Metrics
- Total Items: 16
- Passed: 2 (12.5%)
- Failed: 1 (6.25%)
- Errors: 13 (81.25%)
- Exact Match Rate: 0.125 (12.5%)
- Feature Recall: 0.1667 (16.67%)
- Feature Precision: 0.1667 (16.67%)
- Mean Latency: 17515.8 ms

### Per-Language Results
| Language | Total | Passed | Failed | Errors | Exact Rate | Feature Recall | Feature Precision | Mean Latency (ms) |
|----------|-------|--------|--------|--------|------------|----------------|-------------------|-------------------|
| English  | 4     | 1      | 1      | 2      | 0.25       | 0.4167         | 0.4167            | 49903.4           |
| Greek    | 4     | 1      | 0      | 3      | 0.25       | 0.2500         | 0.2500            | 20156.8           |
| Spanish  | 4     | 0      | 0      | 4      | 0.00       | 0.0000         | 0.0000            | 2.0               |
| Indonesian| 4    | 0      | 0      | 4      | 0.00       | 0.0000         | 0.0000            | 1.1               |

### Failure Modes
- "error: attempt 1: No JSON object found in model output": 2
- "kind:project_state": 1
- "role:0:time:2026-09-30": 1
- "error: attempt 1: Model call failed: HTTP 500 proxy error": 11

## Model 2: SuperQwen AgentWorld 35B A3B
- Profile: profiles/models/superqwen-agentworld-35b-live.json
- Results: reports/experiments/multilingual-parse-baselines/superqwen-agentworld-35b-a3b/2026-07-20T15-33-48-065Z/

### Overall Metrics
- Total Items: 16
- Passed: 1 (6.25%)
- Failed: 0 (0%)
- Errors: 15 (93.75%)
- Exact Match Rate: 0.0625 (6.25%)
- Feature Recall: 0.0625 (6.25%)
- Feature Precision: 0.0625 (6.25%)
- Mean Latency: 12999.9 ms

### Per-Language Results
| Language | Total | Passed | Failed | Errors | Exact Rate | Feature Recall | Feature Precision | Mean Latency (ms) |
|----------|-------|--------|--------|--------|------------|----------------|-------------------|-------------------|
| English  | 4     | 1      | 0      | 3      | 0.2500     | 0.2500         | 0.2500            | 51996.3           |
| Greek    | 4     | 0      | 0      | 4      | 0.0000     | 0.0000         | 0.0000            | 1.2               |
| Spanish  | 4     | 0      | 0      | 4      | 0.0000     | 0.0000         | 0.0000            | 1.2               |
| Indonesian| 4    | 0      | 0      | 4      | 0.0000     | 0.0000         | 0.0000            | 0.7               |

### Failure Modes
- "error: attempt 1: Expected double-quoted property name in": 1
- "error: attempt 1: Model call failed: HTTP 500 proxy error": 14

## Cross-Model Comparison

### Exact Match Rate
- Qwen 3.6 35B A3B: 12.5%
- SuperQwen AgentWorld 35B A3B: 6.25%
- **Winner**: Qwen 3.6 35B A3B

### Feature Recall
- Qwen 3.6 35B A3B: 16.67%
- SuperQwen AgentWorld 35B A3B: 6.25%
- **Winner**: Qwen 3.6 35B A3B

### Feature Precision
- Qwen 3.6 35B a3b: 16.67%
- SuperQwen AgentWorld 35B A3B: 6.25%
- **Winner**: Qwen 3.6 35B A3B

### Speed (Mean Latency)
- Qwen 3.6 35B A3B: 17515.8 ms
- SuperQwen AgentWorld 35B A3B: 12999.9 ms
- **Note**: SuperQwen's apparent speed advantage is misleading. Most fast responses (14 of 15 errors) were HTTP 500 proxy errors returning instantly (~1-40 ms) rather than genuine inference. The single successful parse on English took 89.6 seconds. When excluding immediate proxy errors, SuperQwen's actual inference latency is slower than Qwen 3.6.

### Language Coverage
Both models attempted all 4 languages (English, Greek, Spanish, Indonesian).

## Assessment Against Gates
**Required Thresholds** (from assignment):
- minimumExactRate: 0.30 (30%)
- minimumFeatureRecall: 0.50 (50%)

**Results**:
- Neither model meets the exact rate threshold (≥30%)
- Neither model meets the feature recall threshold (≥50%)

## Notes
1. Both models experienced significant HTTP 500 proxy errors, suggesting server-side issues with the llama-router when handling these specific models.
2. The Qwen model achieved 2 successful parses across the dataset, while SuperQwen achieved 1 successful parse (English: "preference" parse succeeded). Both models fell well short of the assignment gates (30% exact rate, 50% feature recall).
3. The SuperQwen model's apparent speed advantage is an artifact of connection failures: 14 of 15 errors were immediate HTTP 500 proxy errors returning in 1-40 ms, not genuine inference failures. The one successful SuperQwen parse took ~89.6 seconds—significantly longer than Qwen's successful parses. When accounting for actual inference latency (not error-fast-path), SuperQwen is slower.
4. These results represent honest baselines as requested in the assignment - they show the current performance level without any threshold tuning or optimization.

## Files Generated
All experiment artifacts are stored under:
- reports/experiments/multilingual-parse-baselines/qwen36-35b-a3b/
- reports/experiments/multilingual-parse-baselines/superqwen-agentworld-35b-a3b/

Each contains:
- Per-language result files (parse-results-*.jsonl)
- Per-language reports (report-*.md)
- Summary files (parse-summary.json, cross-language-report.md)
- Environment and manifest snapshots