# Multilingual Retrieval and False-Equivalence Testing

This document describes the multilingual retrieval system and false-equivalence detection mechanisms in OpenLunum.

## Overview

The multilingual retrieval system enables cross-language semantic search and retrieval while detecting and flagging potential false-equivalent matches between different languages.

## Supported Languages

Currently supported languages:
- **English** (`en`)
- **Greek** (`el`)
- **Spanish** (`es`)
- **Indonesian** (`id`)

Additional languages can be added by extending the `SUPPORTED_LANGUAGES` set.

## Core Components

### 1. MultilingualRetrievalIndex

The `MultilingualRetrievalIndex` class provides:
- Language-specific record indexing
- Cross-language search with configurable thresholds
- False-equivalence detection
- Statistics and metrics

### 2. Retrieval Query

Queries support:
- Text search with language specification
- Configurable maximum results
- Minimum score thresholds
- False-equivalence inclusion

### 3. False-Equivalence Detection

The system detects potential false equivalences by:
- Comparing semantic predicates across languages
- Analyzing surface text similarities
- Evaluating contextual differences
- Computing confidence scores

## Usage Examples

### Basic Retrieval

```typescript
import { MultilingualRetrievalIndex } from '@corpunum/lunum-eval';

// Create index
const index = new MultilingualRetrievalIndex();

// Add records
index.add({
  source: { text: 'Hello world', language: 'en' },
  sem: { clauses: [{ predicate: 'greeting' }] },
  fingerprint: 'fp1'
});

// Search
const results = index.search({
  text: 'hello',
  language: 'en',
  maxResults: 10
});
```

### Cross-Language Search with False Equivalence Detection

```typescript
const results = index.search({
  text: 'cat sits',
  language: 'en',
  includeFalseEquivalences: true,
  maxResults: 20
});

// Filter results
const trueMatches = results.filter(r => r.isTrueMatch);
const falseEquivalences = results.filter(r => !r.isTrueMatch);
```

## False-Equivalence Patterns

### Common False Equivalence Types

1. **Surface Match, Semantic Mismatch**
   - Same words, different predicates
   - Example: "bank" (river vs financial)

2. **Contextual Difference**
   - Same structure, different context
   - Example: "time flies" (literal vs idiomatic)

3. **Cultural Variance**
   - Same concept, different expression
   - Example: Greetings across cultures

### Detection Heuristics

- Predicate comparison across languages
- Surface text similarity scoring
- Context analysis
- Confidence thresholding

## Metrics

### Retrieval Quality
- Precision@k
- Recall@k
- Mean Reciprocal Rank (MRR)
- False positive rate

### False-Equivalence Quality
- Detection rate
- False negative rate
- Confidence distribution

## Implementation Notes

### Language Handling
- Default to English if language not specified
- Language codes follow ISO 639-1
- Case-insensitive text matching

### Performance
- Index size scales with record count
- Search complexity: O(n) per language
- Cache false-equivalence results
- Consider vector search for large datasets

### Extensibility
- Add new languages by updating `SUPPORTED_LANGUAGES`
- Implement custom scoring functions
- Add domain-specific false-equivalence rules

## Best Practices

1. **Index Management**
   - Clear index when records change
   - Monitor index size and performance
   - Use fingerprints for stable IDs

2. **Search Optimization**
   - Set appropriate maxResults
   - Use minScore to filter low-quality matches
   - Enable false-equivalence detection for production

3. **Quality Assurance**
   - Test with known translation pairs
   - Validate false-equivalence detection
   - Monitor precision and recall metrics

## Future Work

### Enhancements
- Vector-based semantic search
- Neural false-equivalence detection
- Domain-specific rules
- Real-time index updates

### Integrations
- MCP server for retrieval tools
- CLI search interface
- Web UI for exploration