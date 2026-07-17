# Lunum-Sem Realization to Natural Language

This document describes the realization system for converting Lunum-Semantic content to natural language in English and Greek.

## Overview

The realization engine converts structured semantic representations into readable natural language while preserving:
- Protected literals (names, terms, entities)
- Semantic identity (via fingerprint verification)
- Clause structure and relationships

## Supported Languages

Currently supported languages:
- **English** (`en`)
- **Greek** (`el`)

Additional languages can be added by extending the realization rules.

## Core Components

### 1. RealizationEngine

The `RealizationEngine` class provides:
- Language-specific realization rules
- Protected literal extraction and preservation
- Semantic identity verification
- Realization statistics

### 2. Realization Rules

Rules define how predicates are realized:
- **Predicate matching**: Matches clause predicates to rules
- **Template filling**: Fills templates with role values
- **Language-specific**: Different rules per language

### 3. Protected Literals

Protected literals are text elements that should be preserved during realization:
- **Names**: Person names, place names
- **Terms**: Technical terms, version numbers
- **Phrases**: Protected phrases
- **Entities**: Organizations, brands

### 4. Semantic Identity Verification

After realization, the engine verifies that semantic identity is preserved by comparing fingerprints.

## Usage Examples

### Basic Realization

```typescript
import { RealizationEngine } from '@corpunum/lunum-eval';

const engine = new RealizationEngine();

// Create a semantic record
const record = {
  source: { text: 'Hello world', language: 'en' },
  sem: { 
    clauses: [{ 
      predicate: 'greeting', 
      roles: { subject: 'everyone' } 
    }] 
  },
  fingerprint: 'test-fp-1'
};

// Realize to English
const result = engine.realize(record, 'en');
console.log(result.text); // "Greetings everyone"
```

### Protected Literal Handling

```typescript
// Register protected literals
engine.registerProtectedLiterals('fp-1', [
  { text: 'Apple', language: 'en', type: 'name' },
  { text: 'v2.0', language: 'en', type: 'term' }
]);

// Realization will preserve these literals
```

### Semantic Identity Verification

```typescript
const result = engine.realize(record, 'en');

console.log(result.semanticIdentity);
// {
//   originalFingerprint: 'fp-1',
//   realizationFingerprint: 'rfp:abc123',
//   matchConfidence: 0.85
// }
```

## Realization Rules

### English Rules

| Predicate | Template |
|-----------|----------|
| greeting | Greetings{subject} |
| statement | {subject} {verb} {object} |
| question | Is {subject} {predicate}? |
| location | {subject} is located at {location} |
| action | {subject} {verb}s {object} |

### Greek Rules

| Predicate | Template |
|-----------|----------|
| greeting | Γειά σου{subject} |
| statement | {subject} {verb} {object} |
| question | Είναι {subject} {predicate}; |
| location | {subject} βρίσκεται στο {location} |
| action | {subject} {verb} {object} |

## Protected Literal Classification

The engine classifies protected literals into types:
- **name**: Person or place names (capitalized multi-word)
- **term**: Technical terms, versions (v\d pattern)
- **phrase**: General phrases
- **entity**: Acronyms, brands (uppercase sequences)

## Realization Result Structure

```typescript
interface RealizationResult {
  text: string;              // Realized natural language
  language: 'en' | 'el';     // Target language
  protectedLiterals: {        // Preserved literals
    text: string;
    language: string;
    type: 'name' | 'term' | 'phrase' | 'entity';
  }[];
  semanticIdentity: {        // Identity verification
    originalFingerprint: string;
    realizationFingerprint: string;
    matchConfidence: number;
  };
  metadata: {                // Processing metadata
    clausesProcessed: number;
    protectedLiteralsPreserved: number;
    warnings?: string[];
  };
}
```

## Best Practices

### 1. Rule Design
- Use clear, consistent templates
- Handle missing roles gracefully
- Test with real data

### 2. Protected Literals
- Register important literals before realization
- Use proper classification
- Verify preservation after realization

### 3. Identity Verification
- Always check match confidence
- Investigate low confidence scores
- Compare original and realized text

### 4. Error Handling
- Check for warnings in metadata
- Handle clauses without matching rules
- Log realization failures

## Extending to New Languages

To add a new language:

1. Define realization rules:
```typescript
const rules: RealizationRule[] = [
  {
    predicate: 'greeting',
    template: 'Hello{subject}',
    language: 'en'
  }
];
```

2. Register rules with engine:
```typescript
engine.realizationRules.set('en', rules);
```

3. Add to supported languages set:
```typescript
SUPPORTED_REALIZATION_LANGUAGES.add('en');
```

## Metrics and Quality

### Quality Indicators
- Clauses processed ratio
- Protected literals preserved
- Semantic identity confidence
- Warning count

### Improvement Areas
- Template refinement
- Rule coverage
- Literal classification accuracy
- Language-specific grammar

## Future Enhancements

### Planned Features
- Context-aware realization
- Style control (formal/informal)
- Domain-specific rules
- Real-time grammar checking
- Cross-language consistency

### Integration
- MCP server tools
- CLI interface
- Web UI for exploration