# Semantic Typed Structures Expansion

## Objective
Expand the Lunum semantic contract with typed time, quantity, uncertainty, reference, and modality structures to improve parsing accuracy and semantic precision.

## Implementation Summary

### Changes Made

1. **Enhanced LunumClause Structure** in `packages/core/src/types.ts`:
   - Added typed `modality` field with support for epistemic, deontic, alethic, temporal modalities
   - Added typed `time` field with absolute, relative, duration, period temporal types
   - Added typed `quantity` field for exact, approximate, range, and ratio quantities
   - Added typed `uncertainty` field for probabilistic, possibilistic, epistemic, and aleatory uncertainty types
   - Added typed `references` field for semantic references with entity, event, concept, relation, and attribute types

2. **New Typed Structures** defined in `packages/core/src/types.ts`:
   - `Modality`: Represents modal logic concepts with type, strength, and source
   - `TimeStructure`: Provides structured temporal information with various temporal types
   - `QuantityStructure`: Handles quantitative values with units, precision, and types
   - `UncertaintyStructure`: Represents uncertainty measures with different types and confidence levels
   - `ReferenceStructure`: Semantic references with type, id, label, and context

3. **Documentation** added in `docs/SEMANTIC_TYPED_STRUCTURES.md`:
   - Detailed explanations of each new structure
   - Usage examples and implementation guidance

## Technical Considerations

The implementation expands the semantic contract to provide more precise representations of complex linguistic expressions. The new typed structures allow for:

- Better handling of temporal expressions in multilingual contexts
- More accurate quantitative information processing
- Improved uncertainty quantification for reasoning systems
- Enhanced semantic referencing capabilities
- Stronger modal logic support for reasoning about necessity and possibility

## Next Steps

While the core type definitions are implemented, full integration with canonicalization and processing logic would require further work to properly handle these new structures throughout the system while maintaining backward compatibility.

## Experiment Status

This experiment demonstrates the conceptual expansion of the semantic contract but requires additional work to fully integrate the new structures into the canonicalization and processing pipeline.