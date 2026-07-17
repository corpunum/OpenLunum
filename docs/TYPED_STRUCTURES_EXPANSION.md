# Typed Structures Expansion

This document describes the expansion of typed structures for time, quantity, uncertainty, reference, and modality in OpenLunum.

## Overview

The typed structures expansion provides:
- Detailed time structures with precision and qualifiers
- Quantity structures with units and ranges
- Uncertainty structures with confidence and alternatives
- Reference structures with cross-references
- Modality structures with source and strength

## Time Structures

### TypedTime
- **Qualifier**: `exact`, `approximate`, `range`, `relative`, `event-based`
- **Precision**: `second` through `millennium`
- **Value**: ISO 8601 datetime with timezone
- **Range**: Start/end times with duration
- **Relative**: Offset from reference point
- **Event-based**: Relationship to events

### Usage
```typescript
const time: TypedTime = {
  qualifier: 'range',
  precision: 'day',
  range: {
    start: { datetime: '2024-01-01T00:00:00Z' },
    end: { datetime: '2024-01-31T23:59:59Z' }
  }
};
```

## Quantity Structures

### TypedQuantity
- **Type**: `number`, `percentage`, `ratio`, `currency`, `unit`, `count`
- **Precision**: `exact`, `approximate`, `estimated`, `minimum`, `maximum`
- **Value**: Numeric with unit/currency
- **Range**: Min/max values

### Usage
```typescript
const quantity: TypedQuantity = {
  type: 'currency',
  precision: 'exact',
  value: { value: 100, currency: 'USD' }
};
```

## Uncertainty Structures

### TypedUncertainty
- **Type**: `confidence`, `probability`, `likelihood`, `risk`, `variance`
- **Source**: `measurement`, `estimation`, `inference`, `model`, `human`
- **Value**: Numeric (0-1) with confidence interval
- **Alternatives**: Multiple uncertainty values

### Usage
```typescript
const uncertainty: TypedUncertainty = {
  type: 'confidence',
  value: {
    value: 0.95,
    type: 'confidence',
    source: 'measurement',
    confidenceInterval: { lower: 0.9, upper: 1.0 }
  }
};
```

## Reference Structures

### TypedReference
- **Type**: `url`, `doi`, `isbn`, `pmid`, `identifier`, `local`, `cross-ref`
- **Value**: ID with metadata (title, authors, date, etc.)
- **CrossReference**: Target ID with relationship type

### Usage
```typescript
const reference: TypedReference = {
  type: 'doi',
  value: {
    type: 'doi',
    id: '10.1234/example',
    title: 'Example Paper',
    authors: ['Smith, J.']
  }
};
```

## Modality Structures

### TypedModality
- **Type**: `fact`, `opinion`, `belief`, `possibility`, `necessity`, etc.
- **Source**: `direct`, `reported`, `inferred`, `observed`, `assumed`
- **Value**: Type with strength and certainty level
- **Alternatives**: Multiple modality values

### Usage
```typescript
const modality: TypedModality = {
  type: 'belief',
  value: {
    type: 'belief',
    source: 'reported',
    strength: 0.7,
    certainty: 'likely'
  }
};
```

## Integration with LunumClause

The `ExtendedLunumClause` interface extends the base `LunumClause` with:
- `timeTyped`: TypedTime structure
- `modalityTyped`: TypedModality structure
- `quantity`: TypedQuantity structure
- `uncertainty`: TypedUncertainty structure
- `reference`: TypedReference structure

## Benefits

1. **Precision**: More accurate semantic representation
2. **Interoperability**: Standardized structures for exchange
3. **Analysis**: Better support for reasoning and inference
4. **Fingerprinting**: Improved semantic identity tracking
5. **Validation**: Structured validation of semantic data

## Best Practices

### 1. Use Structured Data
```typescript
const clause: ExtendedLunumClause = {
  predicate: 'happen',
  roles: { subject: 'event' },
  timeTyped: time,
  uncertainty: uncertainty
};
```

### 2. Include Uncertainty
Always include uncertainty for non-absolute statements.

### 3. Reference Sources
Include references for verifiable claims.

### 4. Specify Modality
Clearly indicate the modality type for each clause.

## Future Enhancements

### Planned Features
- Machine-readable time parsing
- Automatic quantity normalization
- Cross-reference resolution
- Modality inheritance

### Integrations
- Database storage formats
- API serialization
- Visualization tools
- Reasoning engines