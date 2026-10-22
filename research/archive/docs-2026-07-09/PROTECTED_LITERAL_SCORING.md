# Protected Literal Detection and Semantic Scoring

This document describes the protected literal detection system and semantic scoring methodology in OpenLunum.

## Overview

The protected literal detection and semantic scoring system provides:
- Automatic detection of important terms in semantic content
- Independent evaluation of semantic quality
- Integration with realization engine
- Configurable scoring thresholds

## Protected Literals

### Definition

Protected literals are text elements that should be preserved during realization and other processing:
- **Names**: Person names, place names, organization names
- **Terms**: Technical terms, version numbers, codes
- **Phrases**: Protected phrases, idioms
- **Entities**: Organizations, brands, acronyms
- **Numbers**: Version numbers, quantities
- **Dates**: ISO dates, timestamps
- **URLs**: Web addresses
- **Paths**: File and directory paths

### Detection Rules

The system uses pattern-based rules to detect protected literals:

| Type | Pattern | Example | Confidence |
|------|---------|---------|------------|
| name | Capitalized word(s) | Apple, John Doe | 0.7-0.9 |
| term | Version numbers | v2.0.1, 1.2.3 | 0.85-0.95 |
| url | URL pattern | https://example.com | 0.99 |
| path | Path pattern | /usr/local/bin | 0.8 |
| date | ISO date | 2024-01-15 | 0.95 |
| entity | Acronym | API, HTTP | 0.75 |

### Manual Registration

Protected literals can be manually registered:

```typescript
detector.register('fingerprint-1', {
  text: 'Google',
  language: 'en',
  type: 'name',
  confidence: 0.9
});
```

## Semantic Scoring

### Score Components

The semantic scorer evaluates multiple aspects of semantic quality:

#### 1. Completeness (weight: 0.3)
- Measures if clauses have predicates and roles
- Score = complete clauses / total clauses
- Threshold: 0.7 (configurable)

#### 2. Consistency (weight: 0.25)
- Evaluates predicate pattern consistency
- Flags too many unique predicates
- Threshold: 0.6 (configurable)

#### 3. Predicate Clarity (weight: 0.2)
- Checks predicates are non-empty
- Simple binary check
- Score = clear predicates / total predicates

#### 4. Role Coverage (weight: 0.15)
- Evaluates if clauses have sufficient roles
- Considers well-covered if 2+ roles
- Score = covered clauses / total clauses

#### 5. Protected Literal Preservation (weight: 0.2)
- Checks if detected literals are in source text
- Score = preserved / total literals
- Configurable weight

### Overall Score

```typescript
overall = completeness * 0.3 +
          consistency * 0.25 +
          predicateClarity * 0.2 +
          roleCoverage * 0.15 +
          protectedLiteralPreservation * 0.2
```

### Score Range

- **0.0 - 0.3**: Poor semantic quality
- **0.3 - 0.5**: Below average
- **0.5 - 0.7**: Average
- **0.7 - 0.9**: Good
- **0.9 - 1.0**: Excellent

## Usage Examples

### Protected Literal Detection

```typescript
import { ProtectedLiteralDetector } from '@corpunum/lunum-eval';

const detector = new ProtectedLiteralDetector();

// Detect literals in a record
const literals = detector.detect(record);

console.log(literals);
// [{ text: 'Apple', type: 'name', confidence: 0.9 }]
```

### Semantic Scoring

```typescript
import { SemanticScorer } from '@corpunum/lunum-eval';

const scorer = new SemanticScorer();

// Score a record
const score = scorer.score(record, literals);

console.log(score.overall); // 0.85
console.log(score.components); // { completeness: 0.9, ... }
console.log(score.warnings); // ['Low completeness score: 0.60']
```

### Integration with Realization

```typescript
import { RealizationEngine } from './realization.js';

const engine = new RealizationEngine();

// Register protected literals before realization
const literals = detector.detect(record);
literals.forEach(l => engine.registerProtectedLiterals(record.fingerprint, [l]));

// Realize with preservation
const result = engine.realize(record, 'en');
```

## Configuration

### Scorer Options

```typescript
const scorer = new SemanticScorer({
  minCompleteness: 0.7,
  minConsistency: 0.6,
  protectedLiteralWeight: 0.2
});
```

### Custom Rules

```typescript
// Add custom detection rule
detector.rules.push({
  pattern: /^CUSTOM_/,
  type: 'term' as LiteralType,
  confidence: 0.9,
  language: 'en'
});
```

## Best Practices

### 1. Protected Literals
- Register important literals before processing
- Use appropriate confidence levels
- Verify preservation after realization
- Update rules as needed

### 2. Scoring
- Set appropriate thresholds for use case
- Monitor score distributions
- Investigate low scores
- Use warnings for debugging

### 3. Integration
- Run detection before realization
- Use scores for quality gating
- Log scoring metadata
- Review warnings regularly

## Scoring Metadata

Each score includes metadata:
```typescript
{
  clausesEvaluated: number;
  protectedLiteralsFound: number;
  scoringVersion: string;
}
```

This enables:
- Tracking scoring consistency
- Comparing scores across versions
- Debugging scoring issues
- Monitoring quality trends

## Future Enhancements

### Planned Features
- ML-based literal classification
- Context-aware scoring
- Domain-specific rules
- Real-time scoring
- Score visualization

### Integrations
- MCP server tools
- CLI scoring interface
- Web UI for exploration
- Dashboard integration