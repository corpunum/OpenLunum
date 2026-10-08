import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRecord } from '../src/derive.js';
import { fingerprintSem } from '../src/fingerprint.js';
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

function otherwisePromotable(sourceText: string) {
  return {
    sourceText,
    sem,
    category: 'preference',
    risk: 'low' as const,
    confidenceEvidence: highEvidence,
    classificationEvidence: {
      category: 'preference',
      risk: 'low' as const,
      method: 'independent_model' as const,
      evidenceId: 'development-fixture-classification',
      verifiedAt: '2026-10-02T00:00:00.000Z',
    },
    verification: {
      method: 'independent_model' as const,
      verifierId: 'development-fixture-verifier',
      verifiedAt: '2026-10-02T00:00:01.000Z',
      result: 'match' as const,
      sourceTextSha256: createHash('sha256').update(sourceText).digest('hex'),
      candidateFingerprint: fingerprintSem(sem),
    },
    knownPredicates: new Set(['prefer']),
  };
}

test('createRecord withholds source-bound identity and promotion when a digit literal is dropped', () => {
  const sourceText = 'The user prefers dark mode only above 5.';
  const record = createRecord(otherwisePromotable(sourceText));

  assert.equal(record.semanticFingerprint, undefined);
  assert.equal(record.meta.semanticIdentityBinding, 'source-bound');
  assert.deepEqual(record.meta.sourceLiteralRetention, {
    retained: false,
    sourceNumbers: [5],
    sourceIdentifiers: [],
    sourceDates: [],
    sourceRelativeTimes: [],
    missingNumbers: [5],
    missingIdentifiers: [],
    missingDates: [],
    missingRelativeTimes: [],
  });
  assert.equal(record.meta.semanticTrustStatus, 'candidate');
  assert.equal(record.meta.semanticPromoted, false);
  assert.equal(record.policy.eligible, false);
  assert.ok((record.meta.semanticTrust as { reasons: string[] }).reasons.includes('unretained_source_literal'));
  assert.equal(record.source.text, sourceText);
  assert.equal(record.sem.clauses[0]?.roles.theme && (record.sem.clauses[0]!.roles.theme as { id?: string }).id, 'dark_mode');
});

test('createRecord retains source-bound exact identity when the digit is present in the candidate', () => {
  const sourceText = 'The user prefers dark mode 5.';
  const retainedSem: LunumSem = {
    ...sem,
    clauses: [{
      ...sem.clauses[0]!,
      roles: {
        ...sem.clauses[0]!.roles,
        theme: { type: 'concept', id: 'dark_mode_5' },
      },
    }],
  };
  const record = createRecord({ sem: retainedSem, sourceText });

  assert.match(record.semanticFingerprint ?? '', /^lfp:2\.1:sha256:/u);
  assert.equal(record.meta.semanticIdentityBinding, 'source-bound');
  assert.equal((record.meta.sourceLiteralRetention as { retained: boolean }).retained, true);
  // Literal presence is a deterministic floor, not a semantic-fidelity result.
  assert.equal(record.meta.semanticPromoted, false);
  assert.equal(record.policy.eligible, false);
});

test('source-absent records keep an explicitly unbound Sem fingerprint', () => {
  const record = createRecord({ sem });

  assert.match(record.semanticFingerprint ?? '', /^lfp:2\.1:sha256:/u);
  assert.equal(record.meta.semanticIdentityBinding, 'unbound');
  assert.equal(record.meta.sourceLiteralRetention, null);
  assert.equal(record.meta.semanticPromoted, false);
  assert.equal(record.policy.eligible, false);
});

test('createRecord rejects transport-invalid fields before normalization', () => {
  const invalidTransport = { ...sem, extractorHint: 'must not be normalized away' };

  assert.throws(
    () => createRecord({ sem: invalidTransport as LunumSem, sourceText: 'The user prefers dark mode.' }),
    /Invalid Lunum-Sem candidate: transport validation failed:.*additionalProperties/u,
  );
});
