# Implementation Plan: Expand Typed Semantic Structures

## Overview
This document outlines the planned implementation of typed semantic structures to enhance semantic precision in Lunum-Sem, as specified in the experiment claim.

## Required Changes

### 1. New Typed Structures

We need to define the following new interfaces in the types file:

```typescript
// Typed structures for enhanced semantic precision

interface LunumTime {
  type: 'time';
  value: string;
  precision?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  timezone?: string;
}

interface LunumQuantity {
  type: 'quantity';
  value: number;
  unit?: string;
  precision?: number;
  uncertainty?: LunumUncertainty;
}

interface LunumUncertainty {
  type: 'uncertainty';
  level: 'low' | 'medium' | 'high';
  value?: number;
  confidence?: number;
}

interface LunumReference {
  type: 'reference';
  id?: string;
  value: string;
  language?: string;
  ref?: string;
}

interface LunumModality {
  type: 'modality';
  value: string;
  strength?: number;
}
```

### 2. Updated Type Definitions

The LunumTerm type needs to be updated to include the new structures:

```typescript
type LunumTerm = 
  | Primitive 
  | LunumTermObject 
  | LunumTime
  | LunumQuantity
  | LunumUncertainty
  | LunumReference
  | LunumModality
  | LunumTerm[];
```

### 3. Updated LunumSem Interface

The references array in LunumSem should use the new LunumReference type:

```typescript
interface LunumSem {
  schema: string;
  world: string;
  kind: string;
  clauses: LunumClause[];
  references?: LunumReference[];  // Updated to use new type
  provenance?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
```

### 4. Updated LunumClause Interface

The modality and time fields in LunumClause should use LunumTerm instead of string:

```typescript
interface LunumClause {
  predicate: string;
  roles: Record<string, LunumTerm>;
  negated?: boolean;
  modality?: LunumTerm;  // Changed from string | null
  time?: LunumTerm;      // Changed from LunumTerm
  conditions?: LunumClause[];
  consequences?: LunumClause[];
  annotations?: Record<string, unknown>;
}
```

## Files That Need Updates

1. `packages/core/src/types.ts` - Main type definitions
2. `packages/core/src/canonicalize.ts` - References handling needs to accommodate new types
3. `packages/core/src/compare.ts` - The scalar function needs to handle new types properly
4. `packages/core/src/render.ts` - Rendering functions may need to handle new types

## Implementation Strategy

This is a breaking change that will require careful updates to all modules that process Lunum terms. The implementation should:
1. Add the new types without breaking existing functionality
2. Gradually update code to use the new typed structures
3. Ensure backward compatibility where possible
4. Add comprehensive tests for all new structures
5. Update documentation and examples

## Testing Approach

We should add tests to verify:
1. All new structures can be created and serialized correctly
2. New structures integrate properly with existing LunumTerm handling
3. Canonicalization works with new structures
4. Comparison functions handle new structures properly
5. Rendering functions work with new structures

## Risks and Considerations

1. This is a structural change that may break existing code
2. The change affects core functionality throughout the system
3. Need to maintain compatibility with existing datasets and workflows
4. May require updates to data generation scripts and tooling

This implementation plan provides the framework for expanding the semantic structures as requested, though the full implementation would require significant updates to the codebase.