import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecord, deriveLunumSidecar } from '../src/derive.js';
import { evaluateSemanticTrust, validateSemanticCandidate } from '../src/policy.js';
import type { ConfidenceEvidenceFactors } from '../src/fallback-policy.js';
import type { LunumSem } from '../src/types.js';

const sem: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [{
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'dark_mode' },
    },
  }],
};

const highEvidence: ConfidenceEvidenceFactors = {
  syntacticValidity: 0.98,
  roleCompletion: 0.97,
  predicateKnown: 0.98,
  modalityClarity: 0.98,
  structuralWellFormedness: 0.99,
  contextAlignment: 0.97,
};

const verifiedInputs = {
  sourceText: 'The user prefers dark mode.',
  category: 'preference',
  risk: 'low' as const,
  confidenceEvidence: highEvidence,
  classificationEvidence: {
    category: 'preference',
    risk: 'low' as const,
    method: 'independent_model' as const,
    evidenceId: 'classification-run-17',
    verifiedAt: '2026-09-01T00:00:00.000Z',
  },
  verification: {
    method: 'independent_model' as const,
    verifierId: 'verifier-model@sha256:1234',
    verifiedAt: '2026-09-01T00:00:01.000Z',
    result: 'match' as const,
  },
  knownPredicates: new Set(['prefer']),
};

test('schema-valid Sem plus caller confidence is a candidate, never an automatic promotion', () => {
  const decision = evaluateSemanticTrust({
    sem,
    sourceText: verifiedInputs.sourceText,
    category: 'preference',
    risk: 'low',
    callerConfidence: 1,
  });

  assert.equal(decision.status, 'candidate');
  assert.equal(decision.promoted, false);
  assert.equal(decision.confidence, 0);
  assert.ok(decision.reasons.includes('caller_confidence_ignored'));
  assert.ok(decision.reasons.includes('missing_independent_verification'));
  assert.ok(decision.reasons.includes('missing_controlled_predicate_vocabulary'));
});

test('record creation contains wrong-but-schema-valid Sem instead of marking it eligible', () => {
  const wrongButValid: LunumSem = {
    ...sem,
    clauses: [{
      predicate: 'delete',
      roles: { object: { type: 'collection', id: 'all_user_data' } },
      negated: false,
    }],
  };
  const record = createRecord({
    sem: wrongButValid,
    sourceText: 'Do not delete any user data.',
    category: 'preference',
    risk: 'low',
    confidence: 1,
  });

  assert.equal((record.meta.semanticTrust as { status: string }).status, 'candidate');
  assert.equal((record.meta.semanticTrust as { promoted: boolean }).promoted, false);
  assert.equal(record.policy.eligible, false);
  assert.ok(record.policy.reasons.some((reason) => reason.startsWith('high_risk_semantics:')));
  assert.ok(record.policy.reasons.includes('caller_confidence_ignored'));
});

test('only corroborated, low-risk, vocabulary-checked Sem is promoted', () => {
  const record = createRecord({ sem, ...verifiedInputs });

  assert.equal((record.meta.semanticTrust as { status: string }).status, 'promoted');
  assert.equal((record.meta.semanticTrust as { promoted: boolean }).promoted, true);
  assert.equal(record.policy.eligible, true);
  assert.equal(record.policy.confidence >= 0.9, true);
});

test('a category/risk assertion that disagrees with its evidence cannot be promoted', () => {
  const decision = evaluateSemanticTrust({
    sem,
    ...verifiedInputs,
    classificationEvidence: { ...verifiedInputs.classificationEvidence, risk: 'medium' },
  });

  assert.equal(decision.promoted, false);
  assert.ok(decision.reasons.includes('invalid_classification_evidence'));
});

test('prohibited source domains remain candidate Sem even with otherwise complete evidence', () => {
  const decision = evaluateSemanticTrust({
    sem,
    ...verifiedInputs,
    sourceText: 'What are my legal rights after a breach of contract?',
  });

  assert.equal(decision.promoted, false);
  assert.ok(decision.reasons.some((reason) => reason.startsWith('prohibited_domain_detected:legal_advice')));
});

test('candidate validation rejects malformed nested clauses before canonicalization', () => {
  const malformed = {
    ...sem,
    clauses: [{
      ...sem.clauses[0],
      conditions: [{ predicate: 'confirmed', roles: {}, negated: 'no' }],
    }],
  };
  const validation = validateSemanticCandidate(malformed);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('conditions[0].negated must be boolean')));
  assert.throws(() => createRecord({ sem: malformed as unknown as LunumSem }), /Invalid Lunum-Sem candidate/);
});

test('sidecar exposes structural Sem separately from its trust status', () => {
  const sidecar = deriveLunumSidecar({
    content: 'The user prefers dark mode.',
    sem,
    confidence: 1,
  });

  assert.equal(sidecar.lunumMeta.semantic, true);
  assert.equal(sidecar.lunumMeta.trustedSemantics, false);
  assert.equal(sidecar.lunumMeta.semanticTrustStatus, 'candidate');
  assert.equal(sidecar.lunumMeta.eligible, false);
});
