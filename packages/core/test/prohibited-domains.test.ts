import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROHIBITED_DOMAIN_IDS,
  PROHIBITED_DOMAIN_SPECS,
  classifyDomain,
  validateDomainEvidence,
  DomainOptInRegistry,
  evaluateDomainGate,
  enforceDomainGate,
  ProhibitedDomainError,
  type DomainEvidence,
  type DomainOptIn
} from '../src/prohibited-domains.js';

// Test suite for prohibited automatic-use domains (R6.4 readiness, #465)

// ============================================
// Registry shape
// ============================================

test('registry: exposes exactly the 4 initial prohibited domains', () => {
  assert.deepEqual(
    [...PROHIBITED_DOMAIN_IDS].sort(),
    ['destructive_action_authorization', 'financial_advice', 'legal_advice', 'medical_diagnosis'].sort()
  );
});

test('registry: every domain spec has evidence requirements', () => {
  for (const id of PROHIBITED_DOMAIN_IDS) {
    const spec = PROHIBITED_DOMAIN_SPECS[id];
    assert.ok(spec.requiredEvidenceTypes.length > 0, `${id} should require evidence types`);
    assert.ok(spec.minEvidenceCount > 0, `${id} should require at least 1 evidence entry`);
    assert.ok(spec.keywords.length > 0, `${id} should have keyword signals`);
  }
});

// ============================================
// Domain classifier
// ============================================

test('classifier: benign content is not prohibited', () => {
  const result = classifyDomain({ sourceText: 'Paris is the capital of France.' });
  assert.equal(result.isProhibited, false);
  assert.equal(result.primaryDomain, null);
  assert.deepEqual(result.domains, []);
});

test('classifier: detects legal_advice via keyword', () => {
  const result = classifyDomain({ sourceText: 'What are my legal rights if my landlord breaks the lease?' });
  assert.equal(result.isProhibited, true);
  assert.equal(result.primaryDomain, 'legal_advice');
});

test('classifier: detects legal_advice via pattern', () => {
  const result = classifyDomain({ sourceText: 'Should I sue my former employer for wrongful termination?' });
  assert.equal(result.primaryDomain, 'legal_advice');
  assert.ok(result.domains[0]!.matchedPatterns.length > 0);
});

test('classifier: detects medical_diagnosis', () => {
  const result = classifyDomain({ sourceText: 'Do I have covid? My symptoms of fever and cough started yesterday.' });
  assert.equal(result.primaryDomain, 'medical_diagnosis');
});

test('classifier: detects financial_advice', () => {
  const result = classifyDomain({ sourceText: 'Should I invest in this stock, and which stocks should I buy for retirement?' });
  assert.equal(result.primaryDomain, 'financial_advice');
});

test('classifier: detects destructive_action_authorization', () => {
  const result = classifyDomain({ sourceText: 'Run rm -rf /var/data to clean up the disk.' });
  assert.equal(result.primaryDomain, 'destructive_action_authorization');
});

test('classifier: destructive keyword "delete all" is detected', () => {
  const result = classifyDomain({ sourceText: 'Please delete all records from the production table.' });
  assert.equal(result.primaryDomain, 'destructive_action_authorization');
});

test('classifier: tag-based signal boosts confidence to near-certain', () => {
  const result = classifyDomain({ sourceText: 'unrelated text', tags: ['legal_advice'] });
  assert.equal(result.primaryDomain, 'legal_advice');
  assert.ok(result.domains[0]!.confidence >= 0.95);
});

test('classifier: multiple domains can match, sorted by confidence descending', () => {
  const result = classifyDomain({
    sourceText: 'Should I sue for this and also, do I have cancer based on these symptoms of fatigue?'
  });
  assert.ok(result.domains.length >= 2);
  for (let i = 1; i < result.domains.length; i++) {
    assert.ok(result.domains[i - 1]!.confidence >= result.domains[i]!.confidence);
  }
});

test('classifier: empty input is not prohibited', () => {
  const result = classifyDomain({});
  assert.equal(result.isProhibited, false);
});

// ============================================
// Evidence validation
// ============================================

test('evidence: missing required types is invalid', () => {
  const evidence: DomainEvidence[] = [
    { type: 'qualified_review', description: 'Reviewed by counsel' }
  ];
  const validation = validateDomainEvidence('legal_advice', evidence);
  assert.equal(validation.valid, false);
  assert.ok(validation.missingTypes.includes('jurisdiction_scope'));
  assert.ok(validation.missingTypes.includes('liability_assessment'));
});

test('evidence: insufficient count is invalid even with right types partially covered', () => {
  const evidence: DomainEvidence[] = [
    { type: 'jurisdiction_scope', description: 'Scoped to US federal law' }
  ];
  const validation = validateDomainEvidence('legal_advice', evidence);
  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.some((r) => r.startsWith('insufficient_evidence_count')));
});

test('evidence: empty description is rejected', () => {
  const evidence: DomainEvidence[] = [
    { type: 'jurisdiction_scope', description: '' },
    { type: 'qualified_review', description: 'ok' },
    { type: 'liability_assessment', description: 'ok' }
  ];
  const validation = validateDomainEvidence('legal_advice', evidence);
  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.some((r) => r.startsWith('empty_evidence_description')));
});

test('evidence: complete evidence set for legal_advice is valid', () => {
  const evidence: DomainEvidence[] = [
    { type: 'jurisdiction_scope', description: 'Scoped to US federal law', reference: 'doc-1' },
    { type: 'qualified_review', description: 'Reviewed by licensed counsel', reference: 'doc-2' },
    { type: 'liability_assessment', description: 'Liability sign-off from legal', reference: 'doc-3' }
  ];
  const validation = validateDomainEvidence('legal_advice', evidence);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.missingTypes, []);
  assert.deepEqual(validation.reasons, []);
});

test('evidence: complete evidence set for destructive_action_authorization is valid', () => {
  const evidence: DomainEvidence[] = [
    { type: 'human_confirmation', description: 'Requires explicit human confirmation step' },
    { type: 'reversibility_assessment', description: 'Action is reversible via backup' },
    { type: 'blast_radius_review', description: 'Limited to staging environment' }
  ];
  const validation = validateDomainEvidence('destructive_action_authorization', evidence);
  assert.equal(validation.valid, true);
});

// ============================================
// Opt-in registry
// ============================================

function completeLegalEvidence(): DomainEvidence[] {
  return [
    { type: 'jurisdiction_scope', description: 'Scoped to US federal law' },
    { type: 'qualified_review', description: 'Reviewed by licensed counsel' },
    { type: 'liability_assessment', description: 'Liability sign-off from legal' }
  ];
}

test('opt-in registry: rejects opt-in with invalid evidence and does not store it', () => {
  const registry = new DomainOptInRegistry();
  const optIn: DomainOptIn = {
    domain: 'legal_advice',
    evidence: [{ type: 'qualified_review', description: 'partial' }],
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'test'
  };
  const result = registry.register(optIn);
  assert.equal(result.ok, false);
  assert.equal(registry.isOptedIn('legal_advice'), false);
});

test('opt-in registry: rejects opt-in missing an approver', () => {
  const registry = new DomainOptInRegistry();
  const optIn: DomainOptIn = {
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: '',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'test'
  };
  const result = registry.register(optIn);
  assert.equal(result.ok, false);
  assert.equal(registry.isOptedIn('legal_advice'), false);
});

test('opt-in registry: accepts and stores valid opt-in', () => {
  const registry = new DomainOptInRegistry();
  const optIn: DomainOptIn = {
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'Domain-specific evidence collected per R6.4 process'
  };
  const result = registry.register(optIn);
  assert.equal(result.ok, true);
  assert.equal(registry.isOptedIn('legal_advice'), true);
  assert.equal(registry.getOptIns('legal_advice').length, 1);
});

test('opt-in registry: revoke removes opt-in status', () => {
  const registry = new DomainOptInRegistry();
  registry.register({
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'justified'
  });
  assert.equal(registry.isOptedIn('legal_advice'), true);
  registry.revoke('legal_advice');
  assert.equal(registry.isOptedIn('legal_advice'), false);
});

test('opt-in registry: other domains remain unaffected', () => {
  const registry = new DomainOptInRegistry();
  registry.register({
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'justified'
  });
  assert.equal(registry.isOptedIn('medical_diagnosis'), false);
  assert.equal(registry.isOptedIn('financial_advice'), false);
  assert.equal(registry.isOptedIn('destructive_action_authorization'), false);
});

// ============================================
// Hard block / gate
// ============================================

test('gate: allows benign content', () => {
  const registry = new DomainOptInRegistry();
  const decision = evaluateDomainGate({ sourceText: 'Water boils at 100C.' }, registry);
  assert.equal(decision.allowed, true);
  assert.equal(decision.blocked, false);
  assert.equal(decision.domain, null);
});

test('gate: hard-blocks prohibited domain content without opt-in', () => {
  const registry = new DomainOptInRegistry();
  const decision = evaluateDomainGate(
    { sourceText: 'Should I sue my landlord? What are my legal rights?' },
    registry
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.blocked, true);
  assert.equal(decision.domain, 'legal_advice');
  assert.equal(decision.requiresOptIn, true);
  assert.ok(decision.missingEvidenceTypes.length > 0);
});

test('gate: destructive action content is hard-blocked by default', () => {
  const registry = new DomainOptInRegistry();
  const decision = evaluateDomainGate({ sourceText: 'rm -rf /data/production' }, registry);
  assert.equal(decision.allowed, false);
  assert.equal(decision.domain, 'destructive_action_authorization');
});

test('gate: allows prohibited-domain content once a valid opt-in exists', () => {
  const registry = new DomainOptInRegistry();
  registry.register({
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'justified'
  });
  const decision = evaluateDomainGate(
    { sourceText: 'Should I sue my landlord? What are my legal rights?' },
    registry
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.blocked, false);
  assert.equal(decision.domain, 'legal_advice');
});

test('gate: opt-in for one domain does not unblock another', () => {
  const registry = new DomainOptInRegistry();
  registry.register({
    domain: 'legal_advice',
    evidence: completeLegalEvidence(),
    approvedBy: 'reviewer@example.com',
    approvedAt: '2026-07-31T00:00:00Z',
    justification: 'justified'
  });
  const decision = evaluateDomainGate({ sourceText: 'rm -rf /data/production' }, registry);
  assert.equal(decision.allowed, false);
  assert.equal(decision.domain, 'destructive_action_authorization');
});

test('enforceDomainGate: throws ProhibitedDomainError when blocked', () => {
  const registry = new DomainOptInRegistry();
  assert.throws(
    () => enforceDomainGate({ sourceText: 'Do I have cancer? What are the symptoms of my condition?' }, registry),
    ProhibitedDomainError
  );
});

test('enforceDomainGate: error carries domain and decision', () => {
  const registry = new DomainOptInRegistry();
  try {
    enforceDomainGate({ sourceText: 'Should I invest in this stock? Which stocks should I buy?' }, registry);
    assert.fail('expected ProhibitedDomainError to be thrown');
  } catch (err) {
    assert.ok(err instanceof ProhibitedDomainError);
    assert.equal(err.domain, 'financial_advice');
    assert.equal(err.decision.blocked, true);
  }
});

test('enforceDomainGate: returns decision when not blocked', () => {
  const registry = new DomainOptInRegistry();
  const decision = enforceDomainGate({ sourceText: 'The sky is blue.' }, registry);
  assert.equal(decision.allowed, true);
});
