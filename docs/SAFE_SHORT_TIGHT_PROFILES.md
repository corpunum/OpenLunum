# Safe, Short, and Tight Profiles

This document describes the three profile types for reducing token usage while preserving semantic meaning in OpenLunum.

## Overview

The profile types provide:
- **Safe**: Minimal reduction, preserves most data
- **Short**: Moderate reduction, removes annotations
- **Tight**: Maximum reduction, removes everything optional

## Profile Types

### Safe Profile
- **Token Reduction**: Up to 30%
- **Preserves**: All annotations, provenance
- **Removes**: None
- **Use Case**: Production where accuracy is critical

### Short Profile
- **Token Reduction**: Up to 50%
- **Preserves**: Provenance
- **Removes**: Annotations
- **Use Case**: Development and testing

### Tight Profile
- **Token Reduction**: Up to 70%
- **Preserves**: Nothing optional
- **Removes**: Annotations, provenance, renderings
- **Use Case**: Edge devices, low bandwidth

## Profile Configuration

### ProfileConfig

```typescript
interface ProfileConfig {
  /** Profile type */
  type: ProfileType;
  /** Whether to preserve all annotations */
  preserveAnnotations?: boolean;
  /** Whether to preserve provenance */
  preserveProvenance?: boolean;
  /** Maximum token reduction ratio */
  maxTokenReduction?: number;
}
```

### Default Configurations

| Profile | Annotations | Provenance | Max Reduction |
|---------|-------------|------------|---------------|
| safe    | ✅ Yes       | ✅ Yes      | 30%           |
| short   | ❌ No        | ✅ Yes      | 50%           |
| tight   | ❌ No        | ❌ No       | 70%           |

## Profile Result

### ProfileResult

```typescript
interface ProfileResult {
  /** Profile type */
  type: ProfileType;
  /** Original token count */
  originalTokens: number;
  /** Profiled token count */
  profiledTokens: number;
  /** Token reduction percentage */
  reduction: number;
  /** Semantic preservation score */
  preservation: number;
  /** Profiled record */
  record: LunumRecord;
  /** Warnings about potential loss */
  warnings?: string[];
}
```

## Usage Examples

### Safe Profile

```typescript
import { ProfileGenerator } from '@corpunum/lunum';

const generator = new ProfileGenerator();

const record = { /* LunumRecord */ };
const result = generator.profileSafe(record);

console.log('Tokens:', result.originalTokens, '->', result.profiledTokens);
console.log('Reduction:', result.reduction);
console.log('Preservation:', result.preservation);
```

### Short Profile

```typescript
const result = generator.profileShort(record);
console.log('Reduction:', result.reduction);
console.log('Warnings:', result.warnings);
```

### Tight Profile

```typescript
const result = generator.profileTight(record);
console.log('Reduction:', result.reduction);
console.log('Warnings:', result.warnings);
```

### Get Configuration

```typescript
const config = generator.getConfig('safe');
console.log('Preserve annotations:', config.preserveAnnotations);
console.log('Max reduction:', config.maxTokenReduction);
```

### Set Configuration

```typescript
generator.setConfig('safe', {
  preserveAnnotations: false
});
```

## Profile Behavior

### Safe Profile
- Keeps all semantic data
- Minimal token reduction
- Highest preservation score
- No warnings expected

### Short Profile
- Removes annotations
- Moderate token reduction
- May generate warnings
- Good for development

### Tight Profile
- Removes annotations, provenance, renderings
- Maximum token reduction
- Lowest preservation score
- Highest warnings

## Integration with Rendering

### Using with Context

```typescript
import { compileContext } from '@corpunum/lunum';
import { ProfileGenerator } from '@corpunum/lunum';

const profileGen = new ProfileGenerator();

// Profile record
const profiled = profileGen.profileShort(record).record;

// Compile context with profiled record
const result = compileContext([{ record: profiled }], { mode: 'lunum' });
```

### Using with Local Models

```typescript
// For edge devices with limited resources
const result = profileGen.profileTight(record);
if (result.reduction > 0.6) {
  sendToEdgeDevice(result.record);
}
```

## Best Practices

### 1. Choose Profile Based on Use Case
```typescript
if (isProduction) {
  profileGen.profileSafe(record);
} else if (isDevelopment) {
  profileGen.profileShort(record);
} else {
  profileGen.profileTight(record);
}
```

### 2. Monitor Preservation
```typescript
const result = profileGen.profileShort(record);
if (result.preservation < 0.8) {
  console.warn('Low semantic preservation');
}
```

### 3. Handle Warnings
```typescript
const result = profileGen.profileTight(record);
if (result.warnings && result.warnings.length > 0) {
  console.warn('Profile warnings:', result.warnings);
}
```

### 4. Compare Profiles
```typescript
const safe = profileGen.profileSafe(record);
const short = profileGen.profileShort(record);
const tight = profileGen.profileTight(record);

console.log('Safe tokens:', safe.profiledTokens);
console.log('Short tokens:', short.profiledTokens);
console.log('Tight tokens:', tight.profiledTokens);
```

## Limitations

- Token counting is approximate
- Profile reduction is estimated
- No automatic profile selection

## Future Enhancements

### Planned Features
- ML-based profile selection
- Automatic token optimization
- Historical profile tracking
- Custom profile definitions

### Integrations
- Dashboard for profile comparison
- Automatic profile recommendation