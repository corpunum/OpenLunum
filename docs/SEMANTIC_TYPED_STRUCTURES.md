# Semantic Typed Structures

This document describes the expanded typed structures added to the Lunum semantic contract to improve semantic precision and parsing accuracy.

## Overview

The semantic contract has been enhanced with typed structures for:
- **Time**: More precise temporal information
- **Quantity**: Quantitative values with units and precision
- **Uncertainty**: Uncertainty measures with different types and confidence levels
- **Reference**: Semantic references with context and type information
- **Modality**: Modal logic representations for different types of necessity/possibility

## Detailed Structure Definitions

### Modality
Represents modal logic concepts with different types and strengths.

```typescript
interface Modality {
  type: 'epistemic' | 'deontic' | 'alethic' | 'temporal' | 'other';
  strength?: 'strong' | 'moderate' | 'weak' | 'possible' | 'necessary';
  source?: string;
}
```

### Time Structure
Provides structured temporal information.

```typescript
interface TimeStructure {
  type: 'absolute' | 'relative' | 'duration' | 'period' | 'temporal-phrase';
  value: string | number;
  unit?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'decade' | 'century';
  reference?: string;
  temporalRelation?: 'before' | 'after' | 'during' | 'at' | 'since' | 'until';
}
```

### Quantity Structure
Handles quantitative information with units and precision.

```typescript
interface QuantityStructure {
  type: 'exact' | 'approximate' | 'range' | 'ratio';
  value: number | [number, number];
  unit?: string;
  precision?: number;
}
```

### Uncertainty Structure
Represents uncertainty with different types and confidence measures.

```typescript
interface UncertaintyStructure {
  type: 'probabilistic' | 'possibilistic' | 'epistemic' | 'aleatory';
  value: number | [number, number];
  confidence?: number;
  source?: string;
}
```

### Reference Structure
Semantic references with context and type information.

```typescript
interface ReferenceStructure {
  type: 'entity' | 'event' | 'concept' | 'relation' | 'attribute';
  id: string;
  label?: string;
  context?: string;
}
```

## Usage Examples

These structures enable more precise semantic representations that can improve parsing accuracy, especially in multilingual contexts where temporal, quantitative, and modal expressions vary significantly.

The addition of these typed structures allows for:
1. More accurate semantic parsing
2. Better handling of complex linguistic expressions
3. Improved retrieval and reasoning capabilities
4. Enhanced cross-linguistic semantic consistency