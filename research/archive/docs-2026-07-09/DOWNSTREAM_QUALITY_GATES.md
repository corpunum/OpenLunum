# Downstream Quality Gates

## Purpose

Task-success metrics and quality gates that verify downstream task quality is
preserved when using Lunum context vs raw text.

## Motivation

From VISION.md "What success looks like":
> downstream task quality is preserved or improved

Quality gates ensure that converting to/from Lunum-Sem doesn't degrade task
performance for common downstream operations.

## Types

### Task Types

| Type | Description |
|------|-------------|
| `qa` | Question answering |
| `summarization` | Text summarization |
| `extraction` | Information extraction |
| `classification` | Text classification |
| `generation` | Text generation |
| `reasoning` | Logical reasoning |
| `other` | Uncategorized tasks |

### Quality Metrics

| Metric | Range | Description |
|--------|-------|-------------|
| `accuracy` | 0-1 | Correct predictions / total |
| `recall` | 0-1 | True positives / actual positives |
| `precision` | 0-1 | True positives / predicted positives |
| `f1` | 0-1 | Harmonic mean of precision and recall |
| `semantic_similarity` | 0-1 | Embedding-based semantic closeness |
| `token_efficiency` | 0-1+ | Tokens saved vs raw text |

### Gate Results

| Result | Meaning |
|--------|---------|
| `pass` | Score meets minimum threshold |
| `warn` | Score below warning threshold |
| `fail` | Score below fail threshold |

## Architecture

```
Downstream Task → QualityEvaluator → GateEvaluation
                                        ↓
                                   Report/Dashboard
```

## Components

### QualityMeasurement

```typescript
interface QualityMeasurement {
  metric: QualityMetric;
  value: number;
  baseline: number;    // Raw text baseline
  delta: number;       // Lunum - baseline
  unit: string;
}
```

### DownstreamTaskResult

```typescript
interface DownstreamTaskResult {
  taskId: string;
  taskType: TaskType;
  quality: QualityMeasurement[];
  overallScore: number;  // 0-1 weighted average
  gateResult: GateResult;
  warnings: string[];
}
```

### QualityGate

```typescript
interface QualityGate {
  name: string;
  taskType: TaskType;
  minimumScore: number;      // Required score
  minimumMetrics: Partial<Record<QualityMetric, number>>;
  warnThreshold: number;     // Warning level
  failThreshold: number;     // Failure level
}
```

### GateEvaluation

```typescript
interface GateEvaluation {
  gateName: string;
  result: GateResult;
  score: number;
  minimumScore: number;
  delta: number;
  metrics: Record<QualityMetric, QualityMeasurement | undefined>;
  warnings: string[];
}
```

## Default Gates

### QA Gate
- Minimum score: 0.7
- Minimum accuracy: 0.7
- Warning: 0.85
- Failure: 0.5

### Extraction Gate
- Minimum score: 0.8
- Minimum precision/recall/F1: 0.8
- Warning: 0.9
- Failure: 0.6

### Classification Gate
- Minimum score: 0.75
- Minimum accuracy: 0.75, F1: 0.7
- Warning: 0.85
- Failure: 0.5

## API

### evaluateQuality(evaluator, taskType, result)
Evaluates a task result against quality gates. Returns null if no gate matches.

### validateGate(gate)
Validates gate configuration.

### createDefaultEvaluator()
Creates evaluator with three default gates (qa, extraction, classification).

## Implementation

See `packages/core/src/downstream-quality.ts` for types and utilities.

## References

- VISION.md: "downstream task quality is preserved or improved"
- AGENTS.md: Evaluation protocol
