# Near-Semantic Fingerprints

This document describes the near-semantic fingerprints for fuzzy matching and semantic similarity in OpenLunum.

## Overview

The near-semantic fingerprints provide:
- Fuzzy matching for semantic similarity
- Separate from exact identity tracking
- Configurable similarity threshold
- Feature-based fingerprint generation

## Fingerprint Type

### NearSemanticFingerprint

```typescript
type NearSemanticFingerprint = string;
// Format: nfp:<hash>
```

## Similarity Result

### SimilarityResult

```typescript
interface SimilarityResult {
  /** First fingerprint */
  fingerprint1: NearSemanticFingerprint;
  /** Second fingerprint */
  fingerprint2: NearSemanticFingerprint;
  /** Similarity score (0-1) */
  similarity: number;
  /** Whether they are similar */
  similar: boolean;
  /** Threshold used */
  threshold: number;
}
```

## Usage Examples

### Generate Fingerprint

```typescript
import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';

const generator = new NearSemanticFingerprintGenerator();

// Generate fingerprint
const sem = { /* LunumSem */ };
const fingerprint = generator.generate(sem);
console.log('Fingerprint:', fingerprint);
```

### Compare Fingerprints

```typescript
const fp1 = 'nfp:12345678';
const fp2 = 'nfp:12345678';

const result = generator.compare(fp1, fp2);
console.log('Similar:', result.similar);
console.log('Score:', result.similarity);
```

### Compare Records

```typescript
const record1 = { /* LunumRecord */ };
const record2 = { /* LunumRecord */ };

const result = generator.compareRecords(record1, record2);
console.log('Similar:', result.similar);
```

### Configure Threshold

```typescript
const generator = new NearSemanticFingerprintGenerator(0.9);
console.log('Threshold:', generator.getThreshold());

generator.setThreshold(0.95);
```

## Feature Extraction

### Extracted Features

The near-semantic fingerprint is generated from:
- Schema
- World
- Kind
- Predicates
- Roles with values
- Negation markers
- Time expressions
- Modality markers

### Hashing

Features are sorted and hashed to create a consistent fingerprint. Similar semantics produce similar fingerprints.

## Comparison Algorithm

### Similarity Calculation

1. Extract hashes from fingerprints
2. Compare character by character
3. Count matching characters
4. Calculate ratio: matches / total length

### Threshold

- Default: 0.8
- Configurable via constructor
- `similar` is true when `similarity >= threshold`

## Best Practices

### 1. Set Appropriate Threshold
```typescript
const generator = new NearSemanticFingerprintGenerator(0.85);
```

### 2. Use for Clustering
```typescript
const fingerprints = [];
for (const record of records) {
  const fp = generator.generateFromRecord(record);
  fingerprints.push(fp);
}

// Cluster similar fingerprints
const clusters = clusterBySimilarity(fingerprints, 0.8);
```

### 3. Monitor Similarity Distribution
```typescript
const results = [];
for (const fp1 of fingerprints) {
  for (const fp2 of fingerprints) {
    if (fp1 !== fp2) {
      const result = generator.compare(fp1, fp2);
      results.push(result.similarity);
    }
  }
}

const avg = results.reduce((a, b) => a + b, 0) / results.length;
console.log('Average similarity:', avg);
```

## Integration with Exact Fingerprints

### Using Both

```typescript
import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';

const nearGen = new NearSemanticFingerprintGenerator();
const exactFp = record.fingerprint; // Existing exact fingerprint
const nearFp = nearGen.generateFromRecord(record);

// Use exact for identity
if (exactFp === otherExactFp) {
  console.log('Same identity');
}

// Use near for similarity
const similarity = nearGen.compare(nearFp, otherNearFp);
if (similarity.similar) {
  console.log('Semantically similar');
}
```

## Limitations

- Hash collisions possible
- Similarity is approximate
- No semantic understanding beyond features

## Future Enhancements

### Planned Features
- ML-based similarity scoring
- Historical similarity tracking
- Automatic threshold adjustment
- Similarity visualization

### Integrations
- Database indexing for fast lookup
- Dashboard for similarity exploration