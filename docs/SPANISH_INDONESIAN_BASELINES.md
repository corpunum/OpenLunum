# Spanish and Indonesian Parse Baselines

This document describes the parse baselines for Spanish and Indonesian in OpenLunum.

## Overview

The Spanish and Indonesian parse baselines provide:
- Language-specific parsing rules
- Predicate detection for key constructions
- Role extraction from natural language
- Negation handling
- Question detection
- Location parsing

## Supported Languages

### Spanish (`es`)
- Latin script
- Subject-Verb-Object word order (flexible)
- Verb conjugation system
- Gendered nouns and adjectives

### Indonesian (`id`)
- Latin script
- Subject-Verb-Object word order (fixed)
- No verb conjugation
- No grammatical gender

## Parse Baselines

### Spanish Baseline
- **Version**: 1.0.0
- **Features**:
  - Predicate detection
  - Role extraction
  - Negation handling
  - Temporal expressions
  - Named entity recognition
  - Question detection

### Indonesian Baseline
- **Version**: 1.0.0
- **Features**:
  - Predicate detection
  - Role extraction
  - Negation handling
  - Temporal expressions
  - Named entity recognition
  - Question detection

## Parse Rules

### Spanish Rules

| Predicate | Pattern Example | Confidence |
|-----------|-----------------|------------|
| statement | `es`, `son`, `está` | 0.85 |
| question | `dónde`, `cuándo`, `cómo` | 0.9 |
| location | `en`, `a`, `de` | 0.8 |
| negation | `no`, `nunca`, `tampoco` | 0.85 |

### Indonesian Rules

| Predicate | Pattern Example | Confidence |
|-----------|-----------------|------------|
| statement | `adalah`, `merupakan`, `berada` | 0.85 |
| question | `apa`, `siapa`, `di mana` | 0.9 |
| location | `di`, `pada`, `ke` | 0.8 |
| negation | `bukan`, `tidak`, `belum` | 0.85 |

## Usage Examples

### Basic Parsing

```typescript
import { BaselineParser } from '@corpunum/lunum-eval';

const parser = new BaselineParser();

// Parse Spanish
const esClauses = parser.parseSpanish('Apple es una empresa');

// Parse Indonesian
const idClauses = parser.parseIndonesian('Google adalah perusahaan');
```

### Language Detection

```typescript
const parser = new BaselineParser();
const langs = parser.getSupportedLanguages();
// ['es', 'id']
```

### Get Rules

```typescript
const esRules = parser.getSpanishRules();
const idRules = parser.getIndonesianRules();
```

## Integration with Realization

The parse baselines work with the realization engine:

```typescript
import { BaselineParser } from './spanish-indonesian-baselines';
import { RealizationEngine } from './realization';

const parser = new BaselineParser();
const engine = new RealizationEngine();

// Parse Spanish
const clauses = parser.parseSpanish(text);

// Create semantic representation
const sem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'text',
  clauses
};

// Realize to any language
const realization = engine.realize({
  source: { text, language: 'es', role: null, ref: null },
  sem,
  fingerprint: 'fp-1',
  renderings: {},
  policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.9, reasons: [] },
  meta: {}
}, 'en');
```

## Limitations

### Both Languages
- Complex nested conditions not fully supported
- Domain-specific terminology may need tuning
- Context-dependent meanings not fully captured

### Spanish
- Verb conjugation variations may affect parsing
- Regional dialect differences not handled

### Indonesian
- Formal/informal distinctions not captured
- Javanese loanwords may need special handling

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