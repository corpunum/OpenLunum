# Context Quality Measurement

This document describes the context quality measurement framework for comparing natural, Lunum, and mixed context downstream quality.

## Overview

The context quality measurement framework provides:
- Quality metrics for context evaluation
- Comparison of different context types
- Token counting and efficiency analysis
- Measurement history and statistics

## Measurement Configuration

### ContextMeasurementConfig

```typescript
interface ContextMeasurementConfig {
  /** Enable measurement mode */
  enabled: boolean;
  /** Maximum number of measurements to keep */
  maxMeasurements?: number;
  /** Whether to compare contexts */
  compareContexts?: boolean;
  /** Quality thresholds */
  thresholds?: {
    minimumNaturalQuality?: number;
    minimumLunumQuality?: number;
    minimumMixedQuality?: number;
  };
}
```

### Default Values

```typescript
{
  enabled: false,
  maxMeasurements: 1000,
  compareContexts: true,
  thresholds: {
    minimumNaturalQuality: 0.7,
    minimumLunumQuality: 0.8,
    minimumMixedQuality: 0.75
  }
}
```

## Quality Metrics

### QualityMetrics

```typescript
interface QualityMetrics {
  /** Overall quality score (0-1) */
  overall: number;
  /** Accuracy score (0-1) */
  accuracy: number;
  /** Completeness score (0-1) */
  completeness: number;
  /** Clarity score (0-1) */
  clarity: number;
  /** Semantic preservation score (0-1) */
  semanticPreservation: number;
}
```

### Metric Definitions

- **Accuracy**: How well the context preserves the original meaning
- **Completeness**: How much information is retained
- **Clarity**: How clear and understandable the context is
- **Semantic Preservation**: How well the semantic structure is maintained
- **Overall**: Average of all metrics

## Context Types

### Natural Language Context
- Human-readable text
- Higher clarity, lower semantic precision
- Best for human consumption

### Lunum Context
- Structured semantic representation
- Higher accuracy, better semantic preservation
- Best for machine processing

### Mixed Context
- Combination of natural and Lunum
- Balanced quality across all metrics
- Best for hybrid scenarios

## Usage Examples

### Basic Measurement

```typescript
import { ContextMeasurementFramework } from '@corpunum/lunum';

const framework = new ContextMeasurementFramework({
  enabled: true,
  compareContexts: true
});

// Measure context
const messages = [
  { role: 'user', content: 'Hello', lunumCode: 'lunum:1' }
];

const measurement = framework.measure(messages);
console.log('Quality:', measurement.quality.overall);
console.log('Tokens:', measurement.tokens);
```

### Get Comparison Results

```typescript
const comparisons = framework.getComparisonResults();

for (const comparison of comparisons) {
  console.log('Best context:', comparison.comparison!.best);
  console.log('Natural quality:', comparison.comparison!.naturalQuality.overall);
  console.log('Lunum quality:', comparison.comparison!.lunumQuality.overall);
  console.log('Mixed quality:', comparison.comparison!.mixedQuality.overall);
}
```

### Get Statistics

```typescript
const stats = framework.getStats();
console.log('Total measurements:', stats.totalMeasurements);
console.log('Thresholds:', stats.thresholds);
```

## Context Comparison

### Comparison Process
1. Calculate quality for each context type
2. Compare metrics across contexts
3. Determine best performing context
4. Store comparison results

### Comparison Results

```typescript
interface ContextComparison {
  naturalQuality: QualityMetrics;
  lunumQuality: QualityMetrics;
  mixedQuality: QualityMetrics;
  best: ContextMode;
}
```

## Best Practices

### 1. Enable During Development
```typescript
const framework = new ContextMeasurementFramework({
  enabled: true,
  compareContexts: true
});
```

### 2. Set Appropriate Limits
```typescript
const framework = new ContextMeasurementFramework({
  enabled: true,
  maxMeasurements: 10000
});
```

### 3. Monitor Statistics
```typescript
const stats = framework.getStats();
if (stats.totalMeasurements >= stats.maxMeasurements * 0.8) {
  console.warn('Measurements approaching limit');
}
```

### 4. Clear Periodically
```typescript
// Clear old measurements periodically
if (stats.totalMeasurements > 500) {
  framework.clear();
}
```

## Integration with Context Compilation

### Using compileContext

```typescript
import { compileContext } from '@corpunum/lunum';

const result = compileContext(messages, { mode: 'mixed' });
console.log('Natural tokens:', result.naturalTokens);
console.log('Lunum tokens:', result.lunumTokens);
console.log('Mixed tokens:', result.mixedTokens);
```

### Combining with Measurement

```typescript
const framework = new ContextMeasurementFramework({ enabled: true });

const result = compileContext(messages, { mode: 'mixed' });
const measurement = framework.measure(messages);

console.log('Context mode:', result.mode);
console.log('Quality:', measurement.quality.overall);
```

## Limitations

- Quality metrics are calculated heuristically
- Token counting is approximate
- Comparison assumes equal message sets

## Future Enhancements

### Planned Features
- ML-based quality estimation
- Historical trend analysis
- Automatic threshold adjustment
- Performance metrics

### Integrations
- Dashboard for measurement visualization
- Alerting on quality degradation
- A/B testing support
- Reporting tools