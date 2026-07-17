# Tokenizer Measurement

This document describes the tokenizer measurement framework for generic-en-pivot/0.1 in OpenLunum.

## Overview

The tokenizer measurement framework provides:
- Token counting for Lunum records
- Support for exact and estimated tokenization
- Batch measurement capabilities
- Statistics and monitoring

## Tokenizer Configuration

### TokenizerConfig

```typescript
interface TokenizerConfig {
  /** Tokenizer name */
  name: string;
  /** Tokenizer version */
  version?: string;
  /** Maximum tokens per record */
  maxTokens?: number;
  /** Whether to measure exact tokens */
  exact?: boolean;
}
```

### Default Values

```typescript
{
  name: 'generic',
  version: '1.0.0',
  maxTokens: 4096,
  exact: true
}
```

## Tokenizer Result

### TokenizerResult

```typescript
interface TokenizerResult {
  /** Tokenizer name */
  tokenizer: string;
  /** Token count */
  tokens: number;
  /** Actual token list if exact */
  tokenList?: string[];
  /** Error if any */
  error?: string;
}
```

## Measurement Result

### MeasurementResult

```typescript
interface MeasurementResult {
  /** Record being measured */
  record: LunumRecord;
  /** Results for each tokenizer */
  results: TokenizerResult[];
  /** Average token count */
  averageTokens: number;
  /** Minimum token count */
  minTokens: number;
  /** Maximum token count */
  maxTokens: number;
  /** Timestamp */
  timestamp: number;
}
```

## Usage Examples

### Basic Measurement

```typescript
import { TokenizerMeasurementFramework } from '@corpunum/lunum';

const framework = new TokenizerMeasurementFramework({
  name: 'gpt2',
  exact: true
});

// Measure a record
const record = { /* LunumRecord */ };
const measurement = framework.measure(record);

console.log('Tokens:', measurement.averageTokens);
```

### Exact Tokenization

```typescript
const framework = new TokenizerMeasurementFramework({
  name: 'llama3',
  exact: true
});

// Use a custom tokenizer
const tokenizer = (text: string) => {
  // Return actual tokenizer output
  return { tokens: 10, tokenList: ['token1', 'token2', ...] };
};

const measurement = framework.measure(record, tokenizer);
console.log('Token list:', measurement.results[0].tokenList);
```

### Batch Measurement

```typescript
const records = [/* LunumRecords */];
const measurements = framework.measureBatch(records);

console.log('Total records:', measurements.length);
```

### Get Statistics

```typescript
const stats = framework.getStats();
console.log('Total measurements:', stats.totalMeasurements);
console.log('Average tokens:', stats.averageTokens);
console.log('Min tokens:', stats.minTokens);
console.log('Max tokens:', stats.maxTokens);
```

## Integration with Renderer

### Using with generic-en-pivot/0.1

```typescript
import { compileContext } from '@corpunum/lunum';
import { TokenizerMeasurementFramework } from '@corpunum/lunum';

const framework = new TokenizerMeasurementFramework({
  name: 'generic-en-pivot/0.1'
});

// Compile context
const result = compileContext(messages, { mode: 'lunum' });

// Measure tokens
const measurement = framework.measure(record);
console.log('Tokens:', measurement.averageTokens);
```

## Best Practices

### 1. Use Exact Tokenization
```typescript
const framework = new TokenizerMeasurementFramework({
  exact: true
});
```

### 2. Set Appropriate Limits
```typescript
const framework = new TokenizerMeasurementFramework({
  maxTokens: 4096
});
```

### 3. Monitor Statistics
```typescript
const stats = framework.getStats();
if (stats.averageTokens > stats.maxTokens * 0.8) {
  console.warn('Average tokens approaching limit');
}
```

### 4. Clear Periodically
```typescript
// Clear old measurements periodically
if (stats.totalMeasurements > 1000) {
  framework.clear();
}
```

## Limitations

- Estimated tokenization is approximate
- Token counting is per-record
- No caching of tokenizer results

## Future Enhancements

### Planned Features
- Caching of tokenizer results
- Historical trend analysis
- Automatic tokenizer selection
- Performance metrics

### Integrations
- Dashboard for measurement visualization
- Alerting on token limits
- A/B testing support
- Reporting tools