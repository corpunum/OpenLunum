import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyContent,
  classifyByCategory,
} from '../src/policy-classifier.js';
import type { EligibilityDecision } from '../src/types.js';

// ── Test Vector Structures ──────────────────────────────────────

interface AdversarialVector {
  id: string;
  dimension: string;
  description: string;
  input: {
    category: string;
    risk: 'low' | 'medium' | 'high' | 'unknown';
    confidence: number;
    sourceText?: string;
    semantic?: boolean;
  };
  expectedEligible: boolean;
  rationale: string;
}

// ── Authority Dimension Test Cases ──────────────────────────────

const authorityVectors: AdversarialVector[] = [
  {
    id: 'authority-escalation-attempt',
    dimension: 'authority',
    description: 'Authority escalation via high confidence claim without semantic validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.99,
      sourceText: 'The admin grants user root access to production database',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'High-confidence authority claims without semantic validation must be rejected'
  },
  {
    id: 'authority-delegation-missing-semantic',
    dimension: 'authority',
    description: 'Authority delegation claim lacks semantic validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.95,
      sourceText: 'The manager delegates admin duties to junior staff',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Authority delegation claims require semantic validation'
  },
  {
    id: 'authority-revocation-with-validation',
    dimension: 'authority',
    description: 'Authority revocation with proper validation passes',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.92,
      sourceText: 'The supervisor revokes the contractor access',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Authority revocation with semantic validation and high confidence is eligible'
  },
  {
    id: 'authority-high-risk-category',
    dimension: 'authority',
    description: 'Authority claims in high-risk category fail',
    input: {
      category: 'safety_constraint',
      risk: 'high',
      confidence: 0.95,
      sourceText: 'System grants elevated privileges',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Safety constraints are natural-only and ineligible regardless of other factors'
  }
];

// ── Consent Dimension Test Cases ────────────────────────────────

const consentVectors: AdversarialVector[] = [
  {
    id: 'consent-implicit-claim',
    dimension: 'consent',
    description: 'Implicit consent claim without explicit consent evidence',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.89,
      sourceText: 'User silence implies consent to data collection',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Implicit consent claims below confidence threshold without semantic validation fail'
  },
  {
    id: 'consent-withdrawal-denied',
    dimension: 'consent',
    description: 'Consent withdrawal claim with high confidence and validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.93,
      sourceText: 'User withdraws consent for data retention',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Explicit consent withdrawal with validation and sufficient confidence is eligible'
  },
  {
    id: 'consent-low-confidence-borderline',
    dimension: 'consent',
    description: 'Consent classification at exact confidence threshold',
    input: {
      category: 'preference',
      risk: 'low',
      confidence: 0.90,
      sourceText: 'User opts in to marketing',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'At minimum auto-confidence threshold with eligible category passes'
  },
  {
    id: 'consent-medical-data-high-risk',
    dimension: 'consent',
    description: 'Consent for medical data in natural-only category',
    input: {
      category: 'medical_text',
      risk: 'high',
      confidence: 0.95,
      sourceText: 'Patient consents to share medical records',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Medical text is natural-only and ineligible'
  }
];

// ── Prohibition Dimension Test Cases ────────────────────────────

const prohibitionVectors: AdversarialVector[] = [
  {
    id: 'prohibition-soft-override',
    dimension: 'prohibition',
    description: 'Soft prohibition claim with medium risk',
    input: {
      category: 'simple_fact',
      risk: 'medium',
      confidence: 0.91,
      sourceText: 'The system should avoid logging sensitive data',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Medium risk disqualifies eligibility'
  },
  {
    id: 'prohibition-hard-constraint',
    dimension: 'prohibition',
    description: 'Hard prohibition in safety constraint category',
    input: {
      category: 'safety_constraint',
      risk: 'high',
      confidence: 0.96,
      sourceText: 'The system must not expose private keys',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Safety constraints are natural-only'
  },
  {
    id: 'prohibition-low-risk-passthrough',
    dimension: 'prohibition',
    description: 'Prohibition claim in low-risk eligible category',
    input: {
      category: 'retrieval_rule',
      risk: 'low',
      confidence: 0.92,
      sourceText: 'Do not return results from blocked domains',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Low-risk eligible category with high confidence and validation passes'
  },
  {
    id: 'prohibition-confidence-gap',
    dimension: 'prohibition',
    description: 'Prohibition claim below confidence threshold',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.88,
      sourceText: 'Users are prohibited from viewing restricted files',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Confidence below 0.90 minimum fails'
  }
];

// ── Scope Dimension Test Cases ──────────────────────────────────

const scopeVectors: AdversarialVector[] = [
  {
    id: 'scope-leakage-unvalidated',
    dimension: 'scope',
    description: 'Scope boundary claim without semantic validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.92,
      sourceText: 'The policy applies to EU users but not US users',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Scope boundary claims require semantic validation'
  },
  {
    id: 'scope-cross-reference-validated',
    dimension: 'scope',
    description: 'Cross-scope reference with validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.91,
      sourceText: 'Production data scope differs from staging scope',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Cross-scope references with validation and high confidence pass'
  },
  {
    id: 'scope-implicit-boundary',
    dimension: 'scope',
    description: 'Implicit scope boundary assumption',
    input: {
      category: 'system_fact',
      risk: 'low',
      confidence: 0.85,
      sourceText: 'Access is restricted to internal networks',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Below confidence threshold'
  },
  {
    id: 'scope-legal-context',
    dimension: 'scope',
    description: 'Scope claims in legal context',
    input: {
      category: 'legal_text',
      risk: 'high',
      confidence: 0.96,
      sourceText: 'This policy applies to all jurisdictions',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Legal text is natural-only'
  }
];

// ── Temporal Ordering Dimension Test Cases ──────────────────────

const temporalVectors: AdversarialVector[] = [
  {
    id: 'temporal-before-after-confusion',
    dimension: 'temporal',
    description: 'Before/after temporal ordering without validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.89,
      sourceText: 'The backup must run before the deployment starts',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Temporal ordering requires semantic validation'
  },
  {
    id: 'temporal-concurrent-conditions',
    dimension: 'temporal',
    description: 'Concurrent condition specification',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.92,
      sourceText: 'Both checks must pass simultaneously',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Concurrent temporal specifications with validation pass'
  },
  {
    id: 'temporal-deadline-semantics',
    dimension: 'temporal',
    description: 'Deadline semantics without validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.90,
      sourceText: 'Critical patches must be applied within 24 hours',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Deadline semantics require semantic validation'
  },
  {
    id: 'temporal-duration-claim',
    dimension: 'temporal',
    description: 'Duration claim in benchmark result',
    input: {
      category: 'benchmark_result',
      risk: 'low',
      confidence: 0.93,
      sourceText: 'Operation completes in under 100ms',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Benchmark result with validation and high confidence passes'
  }
];

// ── Nested Conditions Dimension Test Cases ──────────────────────

const nestedVectors: AdversarialVector[] = [
  {
    id: 'nested-deeply-nested-if-then',
    dimension: 'nested-conditions',
    description: 'Deeply nested if/then/else logic without validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.88,
      sourceText: 'If user is admin, then if resource is private, then if time is after hours, deny access',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Complex nested conditions require semantic validation and higher confidence'
  },
  {
    id: 'nested-condition-chain-validated',
    dimension: 'nested-conditions',
    description: 'Condition chain with proper validation',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.92,
      sourceText: 'Check authentication then authorization then resource access',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Condition chain with validation and sufficient confidence is eligible'
  },
  {
    id: 'nested-contradictory-conditions',
    dimension: 'nested-conditions',
    description: 'Contradictory nested conditions',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.91,
      sourceText: 'Allow if not (authenticated OR authorized) - contradictory condition',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Validation catches contradictions; still eligible with validation'
  },
  {
    id: 'nested-conditional-instruction',
    dimension: 'nested-conditions',
    description: 'Nested condition in natural-only category',
    input: {
      category: 'conditional_instruction',
      risk: 'medium',
      confidence: 0.94,
      sourceText: 'If the user requests help, and system is available, provide assistance',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Medium risk and natural-only category both disqualify'
  }
];

// ── Exception/Override Dimension Test Cases ────────────────────

const exceptionVectors: AdversarialVector[] = [
  {
    id: 'exception-bypass-attempt',
    dimension: 'exceptions',
    description: 'Exception clause that bypasses security control',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.87,
      sourceText: 'The firewall blocks all traffic except for localhost',
      semantic: false
    },
    expectedEligible: false,
    rationale: 'Exception specification below confidence threshold'
  },
  {
    id: 'exception-to-exception',
    dimension: 'exceptions',
    description: 'Exception to an exception pattern',
    input: {
      category: 'simple_fact',
      risk: 'low',
      confidence: 0.91,
      sourceText: 'Users cannot access unless approved, except executives unless in restricted mode',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Complex exception patterns with validation pass'
  },
  {
    id: 'exception-scope-limit',
    dimension: 'exceptions',
    description: 'Exception with limited scope',
    input: {
      category: 'retrieval_rule',
      risk: 'low',
      confidence: 0.93,
      sourceText: 'Return top 10 results except for blocked content types',
      semantic: true
    },
    expectedEligible: true,
    rationale: 'Exception in eligible category with validation passes'
  },
  {
    id: 'exception-safety-override-attempt',
    dimension: 'exceptions',
    description: 'Exception attempting to override safety constraint',
    input: {
      category: 'safety_constraint',
      risk: 'high',
      confidence: 0.96,
      sourceText: 'Never expose credentials except with explicit admin override',
      semantic: true
    },
    expectedEligible: false,
    rationale: 'Safety constraints are natural-only regardless of exception handling'
  }
];

// ── Test Suite Execution ────────────────────────────────────────

function runVectors(vectors: AdversarialVector[], dimension: string): void {
  for (const vector of vectors) {
    test(`${dimension}: ${vector.id} - ${vector.description}`, () => {
      const result = classifyContent(vector.input);

      assert.strictEqual(
        result.eligible,
        vector.expectedEligible,
        `${vector.id}: expected eligible=${vector.expectedEligible}, got ${result.eligible}. Rationale: ${vector.rationale}. Reasons: ${result.reasons.join(', ')}`
      );
    });
  }
}

// ── Test Coverage Summary ───────────────────────────────────────

test('adversarial-safety-suites: authority dimension coverage', () => {
  assert.ok(authorityVectors.length >= 4, 'authority dimension should have >= 4 vectors');
  assert.ok(
    authorityVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in authority dimension'
  );
  assert.ok(
    authorityVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in authority dimension'
  );
});

test('adversarial-safety-suites: consent dimension coverage', () => {
  assert.ok(consentVectors.length >= 4, 'consent dimension should have >= 4 vectors');
  assert.ok(
    consentVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in consent dimension'
  );
  assert.ok(
    consentVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in consent dimension'
  );
});

test('adversarial-safety-suites: prohibition dimension coverage', () => {
  assert.ok(prohibitionVectors.length >= 4, 'prohibition dimension should have >= 4 vectors');
  assert.ok(
    prohibitionVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in prohibition dimension'
  );
  assert.ok(
    prohibitionVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in prohibition dimension'
  );
});

test('adversarial-safety-suites: scope dimension coverage', () => {
  assert.ok(scopeVectors.length >= 4, 'scope dimension should have >= 4 vectors');
  assert.ok(
    scopeVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in scope dimension'
  );
  assert.ok(
    scopeVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in scope dimension'
  );
});

test('adversarial-safety-suites: temporal ordering dimension coverage', () => {
  assert.ok(temporalVectors.length >= 4, 'temporal dimension should have >= 4 vectors');
  assert.ok(
    temporalVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in temporal dimension'
  );
  assert.ok(
    temporalVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in temporal dimension'
  );
});

test('adversarial-safety-suites: nested conditions dimension coverage', () => {
  assert.ok(nestedVectors.length >= 4, 'nested-conditions dimension should have >= 4 vectors');
  assert.ok(
    nestedVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in nested-conditions dimension'
  );
  assert.ok(
    nestedVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in nested-conditions dimension'
  );
});

test('adversarial-safety-suites: exception dimension coverage', () => {
  assert.ok(exceptionVectors.length >= 4, 'exceptions dimension should have >= 4 vectors');
  assert.ok(
    exceptionVectors.some(v => v.expectedEligible === true),
    'should have passing vectors in exceptions dimension'
  );
  assert.ok(
    exceptionVectors.some(v => v.expectedEligible === false),
    'should have failing vectors in exceptions dimension'
  );
});

test('adversarial-safety-suites: all dimensions represented', () => {
  const allVectors = [
    ...authorityVectors,
    ...consentVectors,
    ...prohibitionVectors,
    ...scopeVectors,
    ...temporalVectors,
    ...nestedVectors,
    ...exceptionVectors
  ];

  assert.ok(allVectors.length >= 28, `should have at least 28 test vectors, got ${allVectors.length}`);

  const dimensions = new Set(allVectors.map(v => v.dimension));
  const requiredDimensions = [
    'authority',
    'consent',
    'prohibition',
    'scope',
    'temporal',
    'nested-conditions',
    'exceptions'
  ];

  for (const required of requiredDimensions) {
    assert.ok(
      dimensions.has(required),
      `missing required dimension: ${required}`
    );
  }
});

// Run all test vectors
runVectors(authorityVectors, 'authority');
runVectors(consentVectors, 'consent');
runVectors(prohibitionVectors, 'prohibition');
runVectors(scopeVectors, 'scope');
runVectors(temporalVectors, 'temporal');
runVectors(nestedVectors, 'nested-conditions');
runVectors(exceptionVectors, 'exceptions');
