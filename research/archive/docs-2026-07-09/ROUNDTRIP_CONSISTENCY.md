# Round-Trip Self-Consistency Checking

This document describes the round-trip self-consistency checking system for evaluating realization quality in OpenLunum.

## Overview

Round-trip self-consistency validates realization quality by checking that:
1. Original Lunum-Sem -> Realized Text (via realization engine)
2. Realized Text -> Parsed Lunum-Sem (simulated parse-back)
3. Original and parsed semantic representations are consistent

This serves as a **secondary metric** for quality evaluation, complementing primary metrics like semantic identity verification and protected literal preservation.

## How It Works

### The Round-Trip Process

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Original       │     │  Realized       │     │  Parsed         │
│  Lunum-Sem      │────▶│  Text           │────▶│  Lunum-Sem      │
│  (Record)       │     │                 │     │  (Simulated)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                                       │
        │              ┌─────────────────┐                      │
        └─────────────▶│  Consistency    │◀─────────────────────┘
                       │  Check          │
                       └─────────────────┘
```

### Consistency Components

The system evaluates three components:

#### 1. Predicate Match (weight: 0.4)
- Compares predicates between original and parsed clauses
- Score = matching predicates / original predicates
- Higher weight because predicates are core to meaning

#### 2. Role Match (weight: 0.3)
- Compares role names between original and parsed clauses
- Score = matching roles / original roles
- Measures structural consistency

#### 3. Protected Literal Preservation (weight: 0.3)
- Checks if detected protected literals are preserved
- Score = preserved literals / total literals
- Ensures important terms survive round-trip

### Overall Score

```typescript
consistencyScore = 
  predicateMatch * 0.4 +
  roleMatch * 0.3 +
  protectedLiteralPreservation * 0.3
```

**Range**: 0.0 (completely inconsistent) to 1.0 (perfectly consistent)

## Usage Examples

### Basic Round-Trip Check

```typescript
import { RoundTripChecker } from '@corpunum/lunum-eval';

const checker = new RoundTripChecker();

// After realization
const realizedText = engine.realize(record, 'en').text;

// Check consistency
const result = checker.checkConsistency(record, realizedText, protectedLiterals);

console.log(result.consistencyScore); // 0.85
console.log(result.components); // { predicateMatch: 0.9, ... }
console.log(result.warnings); // []
```

### Configurable Threshold

```typescript
// Set custom threshold
const checker = new RoundTripChecker({
  minConsistencyScore: 0.8
});

// Check if consistent
if (checker.isConsistent(result)) {
  console.log('Round-trip consistent');
} else {
  console.log('Round-trip inconsistent');
}
```

### Integration with Realization Pipeline

```typescript
// Realize
const realization = engine.realize(record, 'en');

// Detect protected literals
const literals = detector.detect(record);

// Check consistency
const consistency = checker.checkConsistency(
  record,
  realization.text,
  literals
);

// Use both scores
const finalQuality = (
  realization.semanticIdentity.matchConfidence * 0.5 +
  consistency.consistencyScore * 0.5
);
```

## Interpretation Guidelines

### Score Ranges

| Score | Interpretation | Action |
|-------|---------------|--------|
| 0.9 - 1.0 | Excellent | No action needed |
| 0.7 - 0.9 | Good | Monitor but OK |
| 0.5 - 0.7 | Moderate | Investigate warnings |
| 0.3 - 0.5 | Poor | Review realization rules |
| 0.0 - 0.3 | Very Poor | Major issues, fix rules |

### Common Issues

#### Low Predicate Match
- **Cause**: Realization changed predicate meaning
- **Fix**: Review predicate templates
- **Example**: "statement" realized as "question"

#### Low Role Match
- **Cause**: Roles not preserved during realization
- **Fix**: Check role filling logic
- **Example**: Missing "subject" role

#### Low Protected Literal Preservation
- **Cause**: Literals modified or lost
- **Fix**: Review literal detection rules
- **Example**: "Apple" changed to "apple"

## Configuration

### Checker Options

```typescript
const checker = new RoundTripChecker({
  minConsistencyScore: 0.7  // Default: 0.7
});
```

### Weight Tuning

Weights can be adjusted based on use case:
- **Semantic focus**: Increase predicateMatch weight
- **Structural focus**: Increase roleMatch weight
- **Term preservation**: Increase protectedLiteralPreservation weight

## Performance Considerations

### Computational Cost
- **Low overhead**: Simulated parse-back is fast
- **Linear complexity**: O(clauses) per check
- **Memory efficient**: No large intermediate structures

### When to Use
- **Quality gate**: Run on all realizations in production
- **Debugging**: Run on suspicious realizations
- **Testing**: Run in test suites
- **Not for**: Real-time streaming (optional)

## Integration with Other Metrics

### Primary Metrics
1. **Semantic Identity**: Fingerprint comparison (primary)
2. **Protected Literals**: Preservation check (primary)

### Secondary Metrics
3. **Round-Trip Consistency**: Self-consistency check (secondary)

### Combined Quality Score

```typescript
const quality = {
  semanticIdentity: 0.95,  // From realization
  protectedLiterals: 0.90,  // From detection
  roundtrip: 0.85,          // From consistency
  overall: 0.90             // Weighted average
};
```

## Best Practices

### 1. Threshold Setting
- Start with default (0.7)
- Adjust based on domain requirements
- Monitor score distributions
- Set higher for critical applications

### 2. Warning Handling
- Log all warnings
- Investigate low scores
- Review rules for consistent issues
- Update templates as needed

### 3. Testing
- Include in test suites
- Test with known good/bad cases
- Monitor over time
- Alert on score drops

### 4. Documentation
- Record score distributions
- Document threshold changes
- Track issue resolutions
- Update guidelines as needed

## Future Enhancements

### Planned Features
- ML-based parse-back
- Language-specific consistency rules
- Domain-specific weights
- Real-time scoring
- Score visualization

### Integration
- MCP server tools
- CLI consistency check
- Web UI for exploration
- Dashboard integration