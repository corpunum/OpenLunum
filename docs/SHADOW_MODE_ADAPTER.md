# OpenUnum Adapter Shadow Mode

This document describes the shadow mode for the OpenUnum adapter, enabling safe integration testing.

## Overview

Shadow mode allows the OpenUnum adapter to:
- Process records without affecting production
- Compare shadow outputs with production
- Track shadow records for analysis
- Test safely before deployment

## Configuration

### ShadowModeConfig

```typescript
interface ShadowModeConfig {
  /** Enable shadow mode */
  enabled: boolean;
  /** Log level for shadow operations */
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  /** Maximum number of shadow records to keep */
  maxRecords?: number;
  /** Whether to compare with production */
  compareWithProduction?: boolean;
}
```

### Default Values

```typescript
{
  enabled: false,
  logLevel: 'info',
  maxRecords: 1000,
  compareWithProduction: false
}
```

## Usage Examples

### Basic Shadow Mode

```typescript
import { ShadowModeAdapter } from '@corpunum/lunum-adapter-openunum';

const adapter = new ShadowModeAdapter({
  enabled: true,
  compareWithProduction: true
});

// Process record
const result = adapter.process(record, shadowSem);

// Access shadow
if (result.shadow) {
  console.log('Shadow fingerprint:', result.shadow.fingerprint);
}

// Compare
if (result.comparison) {
  console.log('Fingerprints match:', result.comparison.fingerprintsMatch);
}
```

### Get Statistics

```typescript
const stats = adapter.getStats();
console.log('Total shadow records:', stats.totalRecords);
console.log('Enabled:', stats.enabled);
```

### Clear Records

```typescript
adapter.clear();
```

## Shadow Records

### Structure

```typescript
interface ShadowRecord {
  /** Original record */
  original: LunumRecord;
  /** Shadow record */
  shadow: LunumRecord;
  /** Comparison result */
  comparison?: {
    fingerprintsMatch: boolean;
    semanticsMatch: boolean;
    differences: string[];
  };
  /** Timestamp */
  timestamp: number;
  /** Error if any */
  error?: string;
}
```

### Comparison

When `compareWithProduction` is enabled:
- Fingerprints are compared
- Semantics are compared
- Differences are logged

## Best Practices

### 1. Enable During Testing
```typescript
const adapter = new ShadowModeAdapter({
  enabled: true,
  compareWithProduction: true
});
```

### 2. Set Appropriate Limits
```typescript
const adapter = new ShadowModeAdapter({
  enabled: true,
  maxRecords: 10000  // Adjust based on needs
});
```

### 3. Monitor Statistics
```typescript
const stats = adapter.getStats();
if (stats.totalRecords >= stats.maxRecords * 0.8) {
  console.warn('Shadow records approaching limit');
}
```

### 4. Clear Periodically
```typescript
// Clear old records periodically
if (stats.totalRecords > 500) {
  adapter.clear();
}
```

## Integration with Production

### Pre-Deployment Testing

1. Enable shadow mode in staging
2. Process production traffic
3. Compare shadow vs production outputs
4. Resolve any differences
5. Deploy when confident

### A/B Testing

1. Run shadow mode alongside production
2. Collect shadow outputs
3. Compare with production outputs
4. Analyze differences
5. Make informed decisions

## Limitations

- Shadow mode uses additional memory
- Comparison can be expensive for large records
- Max records limit enforced (old records removed)

## Future Enhancements

### Planned Features
- Persistent shadow storage
- Statistical analysis tools
- Automatic diff detection
- Performance metrics

### Integrations
- Dashboard for shadow monitoring
- Alerting on significant differences
- Historical comparison tools