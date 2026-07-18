# Prompt-Injection Resistance Tests

## Purpose

Crafts 10 adversarial inputs that attempt to corrupt Lunum-Sem records through
the parser and verifies that all are detected or rejected.

This module implements release gate item **"Add prompt-injection resistance tests:
craft 10 adversarial inputs that attempt to corrupt Lunum-Sem records through the
parser; all must be detected or rejected"** from WORK_QUEUE v4 (release gate 5).

## Motivation

From THREAT-MODEL.md:
> malicious source content attempting persistent prompt injection

When Lunum-Sem records are parsed from untrusted sources (LLM output, user input,
plugin data), an attacker could inject clauses, predicates, or annotations that
corrupt the semantic record. Prompt-injection tests verify the parser and
validator catch these attacks.

## Adversarial Input Types

| # | Type | Attack Vector |
|---|------|---------------|
| 1 | `extra-clause` | Attacker adds unauthorized clause with high-risk predicate |
| 2 | `predicate-injection` | Attacker changes predicate to bypass policy |
| 3 | `role-tampering` | Attacker swaps subject/object to reverse authorization |
| 4 | `false-provenance` | Attacker claims false provenance (trusted source) |
| 5 | `fingerprint-corruption` | Attacker injects record with mismatched fingerprint |
| 6 | `risk-manipulation` | Attacker downgrades risk level for high-risk content |
| 7 | `category-override` | Attacker changes category to bypass natural-only handling |
| 8 | `modality-injection` | Attacker adds false certainty modality (absolute) |
| 9 | `condition-bypass` | Attacker adds condition that makes all checks optional |
| 10 | `annotation-injection` | Attacker adds annotations claiming record is trusted |

## Components

### InjectionTestCase

```typescript
interface InjectionTestCase {
  id: string;              // Unique test case identifier
  type: InjectionType;     // Type of injection
  description: string;     // Description of the attack
  sem: LunumSem;           // The adversarial LunumSem to inject
  expectedDetected: boolean; // Whether detection is expected
  expectedDetection: 'validateSem' | 'schema-mismatch' | 'policy-violation' | 'fingerprint-mismatch';
}
```

### InjectionTestResult

```typescript
interface InjectionTestResult {
  id: string;
  type: InjectionType;
  detected: boolean;
  detection: string | null;
  error: string | null;
  passed: boolean;
}
```

### InjectionTestSummary

```typescript
interface InjectionTestSummary {
  totalTests: number;
  detected: number;
  missed: number;
  passRate: number;
  results: InjectionTestResult[];
}
```

## Detection Mechanisms

The module implements multiple detection layers:

1. **Schema Validation** (`validateLunumSem`)
   - Checks required fields (schema, world, kind, clauses)
   - Validates clause structure (predicate, roles)
   - Verifies known schema versions

2. **Policy Violation Detection** (`detectPolicyViolations`)
   - Detects safety-related clauses in wrong categories
   - Flags invalid risk annotations
   - Catches annotation injection (skip-validation, trusted flags)

3. **False Provenance Detection** (`detectFalseProvenance`)
   - Checks for claimed verification vs actual verification
   - Detects source mismatch between claimed and actual source
   - Flags trusted claims from unknown sources

4. **Modality Injection Detection** (`detectModalityInjection`)
   - Catches certainty clauses with absolute modality
   - Flags confidence 1.0 claims

5. **Condition Bypass Detection** (`detectConditionBypass`)
   - Detects always-true conditions
   - Flags conditions that make checks optional

6. **Fingerprint Mismatch Detection** (`detectFingerprintMismatch`)
   - Checks for missing fingerprints on multi-clause records
   - Flags records with roles exceeding threshold

## Usage

### Run All Tests

```typescript
import { runAllInjectionTests, checkAllDetected } from '@corpunum/lunum';

const summary = runAllInjectionTests();
console.log(`Detected: ${summary.detected}/${summary.totalTests}`);
console.log(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
```

### Check All Detected

```typescript
const { allDetected, summary } = checkAllDetected();
if (!allDetected) {
  console.warn('Some injections were missed:');
  for (const result of summary.results) {
    if (!result.detected) {
      console.warn(`  ${result.id} (${result.type})`);
    }
  }
}
```

### Custom Test Cases

```typescript
import { runInjectionTests, getAdversarialInputs } from '@corpunum/lunum';

const customCases = [...getAdversarialInputs(), {
  id: 'my-test',
  type: 'extra-clause',
  description: 'Custom injection test',
  sem: { /* custom LunumSem */ },
  expectedDetected: true,
  expectedDetection: 'policy-violation'
}];

const summary = runInjectionTests(customCases);
```

## Architecture

```
AdversarialInputs → DetectionLayer → InjectionTestResult
                                              ↓
                                     Summary/Report
                                              ↓
                                  Pass/Fail Decision
```

The module:
1. Defines 10 adversarial inputs covering different injection vectors
2. Runs each through detection layers (schema, policy, provenance, modality, condition, fingerprint)
3. Reports which detections caught which injections
4. Provides pass/fail based on expected detection behavior

## Integration with THREAT-MODEL.md

These tests directly address the threat model items:
- **malicious source content**: Extra clause, predicate injection, role tampering
- **accidental parser hallucination**: Modality injection, condition bypass
- **renderer ambiguity**: False provenance, fingerprint corruption
- **schema drift**: Category override, annotation injection
- **unsafe content**: Risk manipulation

## Testing

```bash
# Run prompt-injection tests
pnpm --filter @corpunum/lunum test:unit -- --test-name-pattern 'prompt-injection'

# Run all tests
pnpm verify
```

## Limitations

- Detection is heuristic-based; production should use formal verification
- Fingerprint check requires actual content hash comparison
- Policy violations assume specific predicate names
- Some injections may evade detection with sophisticated attacks

## Future Enhancements

### Planned Features
- Dynamic adversarial input generation from corpus
- ML-based injection detection
- Historical attack pattern tracking
- Injection severity scoring

### Integrations
- Integration with eval runner for automated testing
- Dashboard for injection detection metrics
- Alerting on new injection patterns

## References

- WORK_QUEUE v4: Release gate 5 — safety and quality gates
- THREAT-MODEL.md: Adversaries and failure modes
- `packages/core/src/prompt-injection.ts` — Implementation
- `packages/core/test/prompt-injection.test.ts` — Tests
