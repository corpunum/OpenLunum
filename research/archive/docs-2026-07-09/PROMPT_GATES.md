# Full-Prompt Quality Gates

This document describes the full-prompt quality gates for local models in OpenLunum.

## Overview

The prompt quality gates provide:
- Token count validation
- Semantic preservation checking
- Configurable thresholds
- Batch validation support

## Quality Gate Configuration

### PromptGateConfig

```typescript
interface PromptGateConfig {
  /** Maximum tokens allowed */
  maxTokens?: number;
  /** Minimum semantic preservation score */
  minSemanticPreservation?: number;
  /** Whether to enforce token limits */
  enforceTokenLimit?: boolean;
  /** Whether to check semantic preservation */
  checkSemanticPreservation?: boolean;
}
```

### Default Values

```typescript
{
  maxTokens: 4096,
  minSemanticPreservation: 0.8,
  enforceTokenLimit: true,
  checkSemanticPreservation: true
}
```

## Quality Gate Result

### PromptGateResult

```typescript
interface PromptGateResult {
  /** Whether the prompt passes all gates */
  passed: boolean;
  /** Token count */
  tokens: number;
  /** Semantic preservation score */
  semanticPreservation?: number;
  /** Errors if any gate failed */
  errors?: string[];
  /** Warnings if any */
  warnings?: string[];
}
```

## Usage Examples

### Basic Validation

```typescript
import { PromptQualityGates } from '@corpunum/lunum';

const gates = new PromptQualityGates();

// Validate a prompt
const record = { /* LunumRecord */ };
const result = gates.validate(record);

if (result.passed) {
  console.log('Prompt is valid');
} else {
  console.log('Errors:', result.errors);
}
```

### Custom Configuration

```typescript
const gates = new PromptQualityGates({
  maxTokens: 2048,
  minSemanticPreservation: 0.9
});
```

### Batch Validation

```typescript
const records = [/* LunumRecords */];
const results = gates.validateBatch(records);

for (const result of results) {
  if (!result.passed) {
    console.log('Failed:', result.errors);
  }
}
```

### Get Configuration

```typescript
const config = gates.getConfig();
console.log('Max tokens:', config.maxTokens);
console.log('Min semantic:', config.minSemanticPreservation);
```

## Quality Checks

### Token Count Gate
- Validates token count against maximum
- Warns when approaching limit (80% of max)
- Errors when exceeding limit

### Semantic Preservation Gate
- Checks semantic structure completeness
- Validates presence of required fields
- Scores based on:
  - Source text presence (20% penalty if missing)
  - Semantics and clauses (30% penalty if missing)
  - Fingerprint presence (10% penalty if missing)
  - Policy eligibility (20% penalty if missing)

## Integration with Local Models

### Using with llama.cpp

```typescript
import { compileContext } from '@corpunum/lunum';
import { PromptQualityGates } from '@corpunum/lunum';

const gates = new PromptQualityGates({ maxTokens: 4096 });

// Compile context
const result = compileContext(messages, { mode: 'lunum' });

// Validate prompt
const validation = gates.validate(record);
if (validation.passed) {
  // Send to model
  sendToModel(result.selectedMessages);
}
```

## Best Practices

### 1. Set Appropriate Token Limits
```typescript
const gates = new PromptQualityGates({
  maxTokens: 4096 // Adjust based on model
});
```

### 2. Enforce Semantic Preservation
```typescript
const gates = new PromptQualityGates({
  minSemanticPreservation: 0.9
});
```

### 3. Monitor Warnings
```typescript
const validation = gates.validate(record);
if (validation.warnings && validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}
```

### 4. Use Batch Validation
```typescript
const results = gates.validateBatch(records);
const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
  console.error(`${failed.length} prompts failed validation`);
}
```

## Limitations

- Token estimation is approximate
- Semantic preservation is heuristic
- No caching of validation results

## Future Enhancements

### Planned Features
- Real token counting integration
- ML-based semantic scoring
- Automatic threshold adjustment
- Performance metrics

### Integrations
- Dashboard for gate monitoring
- Alerting on failures
- Historical trend analysis