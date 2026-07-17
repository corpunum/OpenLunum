# Fingerprint Migration Guide

This document provides guidance for migrating semantic fingerprints from version 0.1 to newer versions, ensuring semantic identity consistency and compatibility across different versions of the semantic contract.

## Overview

Fingerprints in OpenLunum identify canonical semantics under a named version. When breaking changes are introduced to canonicalization or semantic schema, fingerprint versions must be updated to maintain semantic identity consistency.

## Current Fingerprint Version

As of the current implementation, fingerprints use version `0.1` as defined in `packages/core/src/constants.ts`:

```typescript
export const FP_VERSION = '0.1' as const;
```

The fingerprint format is:
```
lfp:0.1:sha256:<digest>
```

Where:
- `lfp` is the fingerprint prefix
- `0.1` is the canonicalization version  
- `sha256` is the hash algorithm used
- `<digest>` is the hexadecimal hash of the canonicalized semantic representation

## Migration Process

### 1. Version Identification

Before migrating, identify all existing fingerprints that were generated using version 0.1:

```bash
# Find all v0.1 fingerprints in a dataset
grep "lfp:0.1:" datasets/dev/multilingual-core-v1.jsonl
```

### 2. Compatibility Assessment

Review breaking changes that may affect fingerprint consistency:

- Semantic schema changes (in `packages/core/src/types.ts`)
- Canonicalization algorithm modifications (in `packages/core/src/canonicalize.ts`) 
- Fingerprint input changes (in `packages/core/src/fingerprint.ts`)

### 3. Migration Strategy

#### For Schema Changes:
If the semantic schema changes (e.g., adding new typed structures), you must:

1. Create a new fingerprint version (e.g., `0.2`)
2. Update the version constant in `packages/core/src/constants.ts`
3. Generate new fingerprints using the updated version
4. Implement migration procedures for existing records

#### For Canonicalization Changes:
If canonicalization rules change (e.g., normalization or ordering), you must:

1. Update the canonicalization version 
2. Regenerate fingerprints for all affected records
3. Document the migration path

### 4. Migration Implementation

#### Versioned Fingerprint Generation:

```typescript
// In packages/core/src/fingerprint.ts
export function fingerprintSem(sem: unknown, options: { length?: number } = {}): string {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  // Versioned fingerprint format
  return `lfp:0.1:sha256:${digest.slice(0, boundedLength(options.length ?? 32))}`;
}
```

#### Migration Procedure Example:

```typescript
// Function to migrate records from old format to new
function migrateFingerprintVersion(record: LunumRecord): LunumRecord {
  // Preserve semantic content
  const migratedSem = canonicalizeSem(record.sem);
  
  // Generate new fingerprint with updated version
  const newFingerprint = fingerprintSem(migratedSem, { length: 32 });
  
  return {
    ...record,
    sem: migratedSem,
    fingerprint: newFingerprint
  };
}
```

### 5. Validation

After migration, validate that:

1. Semantic identity is preserved
2. Fingerprint consistency is maintained
3. No data is lost during migration

## Best Practices

### Version Pinning
Products should pin pre-1.0 versions exactly and run contract and shadow tests on update:

```json
{
  "dependencies": {
    "@corpunum/lunum": "0.2.0"
  }
}
```

### Explicit Migration
When canonicalization changes alter fingerprints, explicit migration should be performed:

```bash
# Run fingerprint migration
pnpm migrate:fingerprints --from-version 0.1 --to-version 0.2
```

### Fingerprint Tracking
Track fingerprint versions in metadata for debugging and compatibility:

```json
{
  "fingerprint": "lfp:0.1:sha256:...",
  "fingerprintVersion": "0.1",
  "semanticVersion": "0.1-draft"
}
```

## Migration Considerations

### Breaking Change Scenarios

1. **Schema Changes**: Adding new fields to LunumClause or LunumSem structures
2. **Canonicalization Changes**: Modifying normalization or ordering of semantic elements  
3. **Algorithm Changes**: Switching from SHA-256 to different hash algorithm
4. **Format Changes**: Altering the fingerprint prefix or structure

### Migration Testing

Test migration with:
- Multilingual-core-v1 dataset
- Real-world semantic examples
- Edge cases and error conditions
- Performance impact analysis

## Future Considerations

### Semantic Versioning
As OpenLunum approaches 1.0, semantic versioning will become more important for compatibility:

```typescript
// Future versioned semantic fingerprint
export function fingerprintSem(sem: unknown, options: { 
  schemaVersion?: string, 
  canonicalizationVersion?: string 
} = {}): string {
  // Implementation for versioned fingerprints
}
```

### Migration Tools
Consider creating standardized migration tools for common fingerprint version transitions:

```bash
# Migration tool example
pnpm fingerprint:migrate \
  --input dataset.jsonl \
  --output migrated-dataset.jsonl \
  --from 0.1 \
  --to 0.2
```

## Summary

Fingerprint migration is a critical aspect of maintaining semantic identity across OpenLunum versions. The key principles are:

1. Version fingerprints explicitly to track canonicalization changes
2. Maintain semantic identity during migration
3. Document migration procedures clearly
4. Test migration thoroughly before deployment
5. Pin versions in production environments to ensure stability

This approach ensures compatibility while allowing for necessary improvements and evolution of the semantic contract.