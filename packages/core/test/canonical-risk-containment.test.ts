import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalizeSem } from '../src/canonicalize.js';
import { createRecord } from '../src/derive.js';
import { isHighRisk } from '../src/fallback-policy.js';
import { fingerprintSem, semanticFingerprint } from '../src/fingerprint.js';
import { validateSemFrames } from '../src/frame-registry.js';
import { normalizeSemanticCandidate } from '../src/semantic-registry.js';
import type { ConfidenceEvidenceFactors, LunumSem } from '../src/index.js';

const evidence: ConfidenceEvidenceFactors = {
  syntacticValidity: 0.98,
  roleCompletion: 0.97,
  predicateKnown: 0.98,
  modalityClarity: 0.98,
  structuralWellFormedness: 0.99,
  contextAlignment: 0.97,
};

function makeSem(clause: LunumSem['clauses'][number]): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [clause],
  };
}

test('high risk is found through arbitrarily nested conditions and consequences', () => {
  const sem = makeSem({
    predicate: 'prefer',
    roles: {},
    conditions: [{
      predicate: 'when',
      roles: {},
      consequences: [{
        predicate: 'then',
        roles: {},
        conditions: [{ predicate: 'approved', roles: {} }],
        consequences: [{ predicate: 'delete', roles: {} }],
      }],
    }],
  });

  assert.equal(isHighRisk(sem).highRisk, true);
  assert.ok(isHighRisk(sem).reasons.some((reason) => reason.includes("predicate 'delete'")));
});

test('canonical obligation and necessity plus registered legacy obligation aliases are high risk', () => {
  for (const modality of ['obligation', 'necessity', 'must', 'must_not', 'shall', 'shall_not', 'mandatory', 'required', 'prohibited', 'forbidden']) {
    assert.equal(isHighRisk(makeSem({ predicate: 'prefer', roles: {}, modality })).highRisk, true, modality);
  }
});

test('permission and possibility are not collapsed into high-risk obligation modalities', () => {
  for (const modality of ['permission', 'possibility', 'may', 'might', 'possible', 'allowed', 'optional']) {
    assert.equal(isHighRisk(makeSem({ predicate: 'prefer', roles: {}, modality })).highRisk, false, modality);
  }
});

test('canonical high-risk descendant prevents createRecord promotion despite complete bound evidence', () => {
  const sourceText = 'Priya prefers daylight. The system deletes backups.';
  const sem = makeSem({
    predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'Priya' }, theme: { type: 'concept', id: 'daylight' } },
    consequences: [{ predicate: 'delete', roles: { agent: { type: 'system', id: 'system' }, object: { type: 'collection', id: 'backups' } } }],
  });
  const normalized = normalizeSemanticCandidate(sem);
  assert.ok(normalized.sem);
  const canonical = canonicalizeSem(normalized.sem);
  assert.equal(normalized.canonical, true);
  assert.equal(validateSemFrames(canonical).valid, true);
  assert.match(semanticFingerprint(canonical), /^lfp:2\.1:/u);

  const record = createRecord({
    sem,
    sourceText,
    category: 'preference',
    risk: 'low',
    confidenceEvidence: evidence,
    classificationEvidence: {
      category: 'preference',
      risk: 'low',
      method: 'independent_model',
      evidenceId: 'classification-risk-containment-1',
      verifiedAt: '2026-09-01T00:00:00.000Z',
    },
    verification: {
      method: 'independent_model',
      verifierId: 'verifier-model@sha256:risk-containment',
      verifiedAt: '2026-09-01T00:00:01.000Z',
      result: 'match',
      sourceTextSha256: createHash('sha256').update(sourceText).digest('hex'),
      candidateFingerprint: fingerprintSem(canonical),
    },
    knownPredicates: new Set(['prefer', 'delete']),
  });

  assert.equal((record.meta.semanticTrust as { promoted: boolean }).promoted, false);
  assert.equal(record.policy.eligible, false);
  assert.ok((record.meta.semanticTrust as { reasons: string[] }).reasons.some((reason) => reason.startsWith('high_risk_semantics:')));
});

test('public risk inspection terminates on a malformed cyclic clause graph', () => {
  const clause: LunumSem['clauses'][number] = { predicate: 'prefer', roles: {} };
  clause.consequences = [clause];

  assert.equal(isHighRisk(makeSem(clause)).highRisk, false);
});
