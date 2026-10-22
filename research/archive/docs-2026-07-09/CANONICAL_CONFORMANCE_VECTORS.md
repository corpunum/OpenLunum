# Canonical Conformance Vectors

This document describes the canonical conformance vectors and property tests for semantic comparison in OpenLunum.

## Overview

The conformance vectors provide:
- Canonical vector generation for semantic representations
- Property-based testing of semantic structures
- Efficient semantic comparison
- Schema conformance checking

## Conformance Vector Types

### ConformanceVector

```typescript
interface ConformanceVector {
  /** Vector identifier */
  id: string;
  /** Vector dimensions */
  dimensions: Record<VectorDimension, number>;
  /** Canonical form */
  canonical: string;
  /** Hash of canonical form */
  hash: string;
}
```

### Vector Dimensions

- **schema**: Hash of schema string
- **world**: Hash of world string
- **kind**: Hash of kind string
- **predicate**: Hash of predicates
- **role**: Hash of roles
- **negation**: Count of negated clauses
- **time**: Count of clauses with time
- **modality**: Count of clauses with modality

## Conformance Vector Generator

### Usage

```typescript
import { ConformanceVectorGenerator } from '@corpunum/lunum';

const generator = new ConformanceVectorGenerator();

// Generate vector for semantic representation
const sem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'test',
  kind: 'test',
  clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
};

const vector = generator.generateVector(sem);
console.log('Vector ID:', vector.id);
console.log('Hash:', vector.hash);
```

### Vector Count

```typescript
const count = generator.getVectorCount();
generator.reset();
```

## Property Tests

### PropertyTest

```typescript
interface PropertyTest {
  /** Test name */
  name: string;
  /** Property to test */
  property: string;
  /** Expected value type */
  expectedType: string;
  /** Test result */
  passed: boolean;
  /** Error message if failed */
  error?: string;
}
```

### Test Coverage

1. **Schema Consistency**: Schema must be 'lunum-sem/0.1-draft'
2. **World Consistency**: World must be non-empty string
3. **Kind Consistency**: Kind must be non-empty string
4. **Clause Structure**: Clauses must be non-empty array
5. **Role Types**: Roles must be object
6. **Negation Types**: Negation must be boolean
7. **Time Types**: Time must be object or string
8. **Modality Types**: Modality must be string

### Usage

```typescript
import { PropertyTestRunner } from '@corpunum/lunum';

const runner = new PropertyTestRunner();

// Run property tests
const sem = { /* ... */ };
const tests = runner.runTests(sem);

// Get results
const results = runner.getResults();
console.log('Total tests:', results.totalTests);
console.log('Passed:', results.passedTests);
console.log('Failed:', results.failedTests);
console.log('Pass rate:', results.passRate);
```

## Semantic Comparison

### Using Vectors

```typescript
const vector1 = generator.generateVector(sem1);
const vector2 = generator.generateVector(sem2);

// Compare vectors
const similar = vector1.hash === vector2.hash;
```

### Using Properties

```typescript
const runner = new PropertyTestRunner();
const tests = runner.runTests(sem);

// Check if all tests passed
const allPassed = tests.every(t => t.passed);
```

## Best Practices

### 1. Generate Vectors for Comparison
```typescript
const vector1 = generator.generateVector(sem1);
const vector2 = generator.generateVector(sem2);

if (vector1.hash === vector2.hash) {
  console.log('Semantics are identical');
}
```

### 2. Run Property Tests Before Processing
```typescript
const runner = new PropertyTestRunner();
const tests = runner.runTests(sem);

if (runner.getResults().passRate < 0.95) {
  console.warn('Semantic structure has issues');
}
```

### 3. Monitor Vector Generation
```typescript
const count = generator.getVectorCount();
if (count > 10000) {
  generator.reset();
}
```

## Integration with Canonicalization

### Using Canonical Form

```typescript
import { canonicalize } from '@corpunum/lunum';

const canonical = canonicalize(sem);
console.log('Canonical form:', canonical);
```

### Combining with Vectors

```typescript
const generator = new ConformanceVectorGenerator();
const vector = generator.generateVector(sem);

console.log('Canonical:', vector.canonical);
console.log('Hash:', vector.hash);
```

## Limitations

- Hash collisions possible (low probability)
- Vector comparison is approximate
- Property tests are structural, not semantic

## Future Enhancements

### Planned Features
- ML-based vector comparison
- Historical vector tracking
- Automatic vector optimization
- Distributed vector storage

### Integrations
- Database vector indexing
- API serialization
- Visualization tools