# Renderer Conformance Suite

## Purpose

Property tests that verify every renderer profile (safe, short, tight) preserves
round-trip canonicalization — the canonical form of a profiled record must be
equivalent to the canonical form of the original record.

This module implements the WORK_QUEUE v4 release gate 4 item:
"Renderer conformance suite: property tests that every profile preserves
round-trip canonicalization."

## Motivation

Renderer profiles transform Lunum-Sem records to reduce token usage while
preserving semantics. Round-trip canonicalization ensures that after applying
a profile, the semantic meaning is unchanged — two records with the same
canonical form represent the same semantics.

## How It Works

1. **Create test records** — 10 diverse Lunum-Sem records covering common structures
2. **Apply profiles** — Run safe, short, and tight profiles on each record
3. **Canonicalize** — Canonicalize both original and profiled sem structures
4. **Compare** — Compare stable stringified canonical forms
5. **Report** — Generate detailed conformance results

If `stableStringify(canonicalizeSem(original.sem)) === stableStringify(canonicalizeSem(profiled.sem))`,
the profile preserves semantics.

## Test Records

The conformance suite includes 10 test records covering:

| # | ID | Structure |
|---|---|-----------|
| 1 | `test-single-clause` | Single clause with basic roles |
| 2 | `test-multi-clause` | Multiple clauses with conditions |
| 3 | `test-with-annotations` | Record with annotations and provenance |
| 4 | `test-negation` | Negated clause |
| 5 | `test-with-time` | Clause with time component |
| 6 | `test-with-modality` | Clause with modality (certainty) |
| 7 | `test-complex-roles` | Clause with many roles |
| 8 | `test-with-renderings` | Record with existing renderings |
| 9 | `test-with-consequences` | Clause with consequences |
| 10 | `test-empty-roles` | Clause with minimal roles |

## Profiles

| Profile | Annotation Handling | Provenance | Token Reduction |
|---------|---------------------|------------|-----------------|
| `safe` | Preserved | Preserved | ~10-30% |
| `short` | Removed | Preserved | ~30-50% |
| `tight` | Removed | Removed | ~50-70% |

## Conformance Results

### Per-Profile Result

```typescript
interface ProfileConformanceResult {
  profile: ProfileType;
  roundTripPass: boolean;
  originalCanonical: string;
  profiledCanonical: string;
  canonicalEqual: boolean;
  warnings: string[];
  tokenReduction: number;
  preservation: number;
}
```

### Per-Test-Case Result

```typescript
interface ConformanceTestCaseResult {
  testCaseId: string;
  description: string;
  profileResults: ProfileConformanceResult[];
  allProfilesPass: boolean;
}
```

### Full Suite Result

```typescript
interface ConformanceSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  results: ConformanceTestCaseResult[];
  profileSummary: Record<ProfileType, { total: number; passed: number; passRate: number }>;
}
```

## Usage

### Run Full Suite

```typescript
import { runConformanceSuite, createTestRecords } from '@corpunum/lunum';

const summary = runConformanceSuite();
console.log(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
console.log(`Passed: ${summary.passedTests}/${summary.totalTests}`);

for (const result of summary.results) {
  console.log(`\n${result.testCaseId}:`);
  for (const pr of result.profileResults) {
    console.log(`  ${pr.profile}: ${pr.canonicalEqual ? 'PASS' : 'FAIL'}`);
    if (pr.warnings.length > 0) {
      console.log(`    Warnings: ${pr.warnings.join(', ')}`);
    }
  }
}
```

### Quick Check

```typescript
import { checkConformance } from '@corpunum/lunum';

const { conforms, summary } = checkConformance();
if (!conforms) {
  console.warn('Conformance failure detected!');
  console.log(summary.results.filter(r => !r.allProfilesPass));
}
```

### Get Failures

```typescript
import { getConformanceFailures } from '@corpunum/lunum';

const failures = getConformanceFailures();
for (const f of failures) {
  console.log(`${f.testCaseId} / ${f.profile}`);
}
```

### Custom Records

```typescript
import { runConformanceSuite } from '@corpunum/lunum';

const customRecords = [
  { id: 'my-record', description: 'My test', record: myLunumRecord }
];

const summary = runConformanceSuite(customRecords);
```

## Architecture

```
TestRecords → ProfileGenerator → ProfileResult → canonicalizeSem → stableStringify
                                                                 ↓
                                                          Compare canonical forms
                                                                 ↓
                                                       ConformanceSuiteResult
```

## Profile Limitations

Not all profiles preserve round-trip canonicalization for all record types:

- **Short/Tight profiles** remove annotations and provenance → changes canonical form if these were present
- **Short profile** strips time and modality fields → changes canonical form
- **Tight profile** removes renderings → changes canonical form
- **Safe profile** preserves all fields → always passes round-trip

The conformance suite tracks which profiles pass which records, providing
detailed evidence for adoption decisions.

## Testing

```bash
# Run renderer conformance tests
pnpm --filter @corpunum/lunum test:unit -- --test-name-pattern 'renderer-conformance'

# Run all tests
pnpm verify
```

## References

- WORK_QUEUE v4: Release gate 4 — renderer measurement
- `packages/core/src/renderer-conformance.ts` — Implementation
- `packages/core/test/renderer-conformance.test.ts` — Tests
- `packages/core/src/profiles.ts` — Profile implementations
- `packages/core/src/canonicalize.ts` — Canonicalization
