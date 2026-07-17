# Multilingual Realization: English, Greek, Spanish, Indonesian

This document describes the realization system supporting four languages in OpenLunum.

## Overview

The realization engine converts Lunum-Semantic content to natural language in four languages:
- **English** (`en`) - Primary pivot language
- **Greek** (`el`) - Ancient and modern Greek support
- **Spanish** (`es`) - Spanish language realization
- **Indonesian** (`id`) - Indonesian language realization

## Supported Languages

### English (`en`)
- Template-based realization
- Subject-verb-object order
- Standard punctuation

### Greek (`el`)
- Template-based realization
- Greek alphabet support
- Greek question marks (¿)

### Spanish (`es`)
- Template-based realization
- Spanish punctuation (¿?)
- Verb conjugation patterns

### Indonesian (`id`)
- Template-based realization
- Simple SVO structure
- No verb conjugation

## Realization Rules by Language

### English Rules

| Predicate | Template | Example |
|-----------|----------|---------|
| greeting | Greetings{subject} | Greetings everyone |
| statement | {subject} {verb} {object} | Apple is testing |
| question | Is {subject} {predicate}? | Is test valid? |
| location | {subject} is located at {location} | Paris is located at France |
| action | {subject} {verb}s {object} | Developer writes code |

### Greek Rules

| Predicate | Template | Example |
|-----------|----------|---------|
| greeting | Γειά σου{subject} | Γειά σου Κόσμε |
| statement | {subject} {verb} {object} | Apple {verb} testing |
| question | Είναι {subject} {predicate}; | Είναι test valid; |
| location | {subject} βρίσκεται στο {location} | Paris βρίσκεται στο France |
| action | {subject} {verb} {object} | Developer {verb} code |

### Spanish Rules

| Predicate | Template | Example |
|-----------|----------|---------|
| greeting | Saludos{subject} | Saludos todos |
| statement | {subject} {verb} {object} | Apple is testing |
| question | ¿Es {subject} {predicate}? | ¿Es test valid? |
| location | {subject} está ubicado en {location} | Madrid está ubicado en España |
| action | {subject} {verb} {object} | Programador escribir código |

### Indonesian Rules

| Predicate | Template | Example |
|-----------|----------|---------|
| greeting | Salam{subject} | Salam semua |
| statement | {subject} {verb} {object} | Google is testing |
| question | Apakah {subject} {predicate}? | Apakah test valid? |
| location | {subject} terletak di {location} | Jakarta terletak di Indonesia |
| action | {subject} {verb} {object} | Developer write code |

## Usage Examples

### Basic Realization

```typescript
import { RealizationEngine } from '@corpunum/lunum-eval';

const engine = new RealizationEngine();

// English
const enResult = engine.realize(record, 'en');

// Greek
const elResult = engine.realize(record, 'el');

// Spanish
const esResult = engine.realize(record, 'es');

// Indonesian
const idResult = engine.realize(record, 'id');
```

### Check Supported Languages

```typescript
const engine = new RealizationEngine();
const langs = engine.getSupportedLanguages();
// ['en', 'el', 'es', 'id']
```

## Quality Consistency

The realization engine maintains consistent quality across all four languages:
- Same template structure per predicate
- Consistent protected literal handling
- Uniform semantic identity verification
- Parallel warning generation

## Protected Literals

Protected literal detection works consistently across all languages:
- Capitalized words (English, Spanish, Indonesian)
- Greek capital letters
- Version numbers
- URLs, dates, paths

## Best Practices

### 1. Language Selection
- Use English as default for unknown languages
- Detect source language from record
- Match realization language to source when possible

### 2. Template Maintenance
- Keep templates simple and consistent
- Test with real data per language
- Update predicates as needed

### 3. Quality Monitoring
- Track realization scores per language
- Compare protected literal preservation
- Monitor consistency scores

## Future Extensions

### Adding New Languages

To add a new language:

1. Define realization rules:
```typescript
const frRules: RealizationRule[] = [
  { predicate: 'greeting', template: 'Salut{subject}', language: 'fr' }
];
```

2. Register rules:
```typescript
engine.realizationRules.set('fr', frRules);
```

3. Update supported languages:
```typescript
SUPPORTED_REALIZATION_LANGUAGES.add('fr');
```

### Planned Enhancements
- Language-specific verb conjugation
- Gender agreement (Spanish, French)
- Formal/informal distinctions
- Regional dialect support