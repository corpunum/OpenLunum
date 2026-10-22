# English and Greek Parse Baselines

This document describes the parse baselines for English and Greek in OpenLunum.

## Overview

The English and Greek parse baselines provide:
- Language-specific parsing rules
- Predicate detection for key constructions
- Role extraction from natural language
- Negation handling
- Question detection
- Location parsing

## Supported Languages

### English (`en`)
- Latin script
- Subject-Verb-Object word order (fixed)
- Auxiliary verb system
- No grammatical gender

### Greek (`el`)
- Greek script
- Subject-Verb-Object word order (flexible)
- Verb conjugation system
- Grammatical gender

## Parse Baselines

### English Baseline
- **Version**: 1.0.0
- **Features**:
  - Predicate detection
  - Role extraction
  - Negation handling
  - Temporal expressions
  - Named entity recognition
  - Question detection

### Greek Baseline
- **Version**: 1.0.0
- **Features**:
  - Predicate detection
  - Role extraction
  - Negation handling
  - Temporal expressions
  - Named entity recognition
  - Question detection

## Parse Rules

### English Rules

| Predicate | Pattern Example | Confidence |
|-----------|-----------------|------------|
| statement | `is`, `are`, `was`, `were` | 0.85 |
| question | `what`, `where`, `when`, `who` | 0.9 |
| location | `in`, `on`, `at`, `to` | 0.8 |
| negation | `not`, `no`, `never` | 0.85 |

### Greek Rules

| Predicate | Pattern Example | Confidence |
|-----------|-----------------|------------|
| statement | `είναι`, `είμαι`, `είσαι` | 0.85 |
| question | `τι`, `πού`, `πότε`, `ποιος` | 0.9 |
| location | `σε`, `από`, `με`, `για` | 0.8 |
| negation | `όχι`, `δεν`, `κανένας` | 0.85 |

## Usage Examples

### Basic Parsing

```typescript
import { BaselineParser } from '@corpunum/lunum-eval';

const parser = new BaselineParser();

// Parse English
const enClauses = parser.parseEnglish('Apple is a company');

// Parse Greek
const elClauses = parser.parseGreek('Η Apple είναι μια εταιρεία');
```

### Language Detection

```typescript
const parser = new BaselineParser();
const langs = parser.getSupportedLanguages();
// ['en', 'el']
```

### Get Rules

```typescript
const enRules = parser.getEnglishRules();
const elRules = parser.getGreekRules();
```

## Integration with Realization

The parse baselines work with the realization engine:

```typescript
import { BaselineParser } from './english-greek-baselines';
import { RealizationEngine } from './realization';

const parser = new BaselineParser();
const engine = new RealizationEngine();

// Parse English
const clauses = parser.parseEnglish(text);

// Create semantic representation
const sem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'text',
  clauses
};

// Realize to any language
const realization = engine.realize({
  source: { text, language: 'en', role: null, ref: null },
  sem,
  fingerprint: 'fp-1',
  renderings: {},
  policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.9, reasons: [] },
  meta: {}
}, 'el');
```

## Limitations

### Both Languages
- Complex nested conditions not fully supported
- Domain-specific terminology may need tuning
- Context-dependent meanings not fully captured

### English
- Phrasal verbs may affect parsing
- Idioms not fully handled

### Greek
- Verb conjugation variations may affect parsing
- Ancient vs modern Greek differences not handled

## Best Practices

### 1. Language Detection
- Detect source language from text
- Use appropriate parser for each language
- Verify parsing results

### 2. Rule Maintenance
- Update patterns as needed
- Test with real data
- Monitor parsing accuracy

### 3. Quality Monitoring
- Track parsing success rates
- Monitor error patterns
- Update rules periodically

## Future Enhancements

### Planned Features
- ML-based predicate detection
- Context-aware parsing
- Domain-specific rules
- Real-time parsing
- Parse confidence scoring

### Integrations
- MCP server tools
- CLI parsing interface
- Web UI for exploration
- Dashboard integration