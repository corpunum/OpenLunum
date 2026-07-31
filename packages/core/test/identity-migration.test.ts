import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyForwardMigration,
  classifyBackwardMigration,
  validateIdentityGoldenVectors,
  IDENTITY_GOLDEN_VECTORS,
  type IdentityMigrationReport
} from '../src/identity-migration.js';
import type { LunumRecord } from '../src/types.js';

function baseRecord(semOverrides: Record<string, unknown> = {}, clauseExtra: Record<string, unknown> = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'the meeting occurs', language: 'en', role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'occur', roles: { subject: { type: 'event', id: 'meeting' } }, ...clauseExtra }],
      ...semOverrides
    },
    fingerprint: 'lfp:0.1:sha256:0000000000000000',
    renderings: {},
    policy: { eligible: true, category: 'fact', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
}

test('classifyForwardMigration returns identity-preserved for clean records', () => {
  const report = classifyForwardMigration(baseRecord());
  assert.equal(report.direction, 'forward-0.1-to-0.2');
  assert.equal(report.identityPreserved, true);
  assert.equal(report.warnings.length, 0);
  assert.equal(report.beforeDigest, report.afterDigest);
});

test('classifyForwardMigration returns identity-creating for lossy modality', () => {
  const report = classifyForwardMigration(baseRecord({}, { modality: 'speculative' }));
  assert.equal(report.identityPreserved, false);
  assert.ok(report.warnings.some((w) => w.code === 'MODALITY_LOCKED'));
  assert.notEqual(report.beforeDigest, report.afterDigest);
});

test('classifyForwardMigration: time:null is identity-preserving (#360)', () => {
  const report = classifyForwardMigration(baseRecord({}, { time: null }));
  assert.equal(report.identityPreserved, true);
  assert.equal(report.warnings.length, 0);
});

test('classifyForwardMigration: time omitted is identity-preserving (#360)', () => {
  const report = classifyForwardMigration(baseRecord({}, {}));
  assert.equal(report.identityPreserved, true);
});

test('classifyForwardMigration: time:null and time omitted produce the same digest (#360)', () => {
  const withNull = classifyForwardMigration(baseRecord({}, { time: null }));
  const withOmission = classifyForwardMigration(baseRecord({}, {}));
  assert.equal(withNull.afterDigest, withOmission.afterDigest);
});

test('classifyForwardMigration: role undefined vs omitted produce the same digest (#360)', () => {
  const withUndefined = classifyForwardMigration({
    ...baseRecord(),
    sem: {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'occur', roles: { subject: { type: 'event', id: 'meeting' }, theme: undefined } as unknown as Record<string, never> }]
    }
  });
  const withOmission = classifyForwardMigration(baseRecord());
  assert.equal(withUndefined.afterDigest, withOmission.afterDigest);
});

test('classifyBackwardMigration returns a report for 0.1-draft records (backward compat)', () => {
  const record = baseRecord();
  const report = classifyBackwardMigration(record);
  assert.equal(report.direction, 'backward-0.2-to-0.1');
  assert.ok(typeof report.identityPreserved === 'boolean');
  assert.ok(Array.isArray(report.warnings));
});

test('classifyForwardMigration: provenance extra field is identity-creating', () => {
  const report = classifyForwardMigration(baseRecord({ provenance: { source: 'chat', extra: 'data' } }));
  assert.equal(report.identityPreserved, false);
  assert.ok(report.warnings.some((w) => w.code === 'PROVENANCE_FIELD_REMOVED'));
});

test('classifyForwardMigration report has valid fingerprint strings', () => {
  const report = classifyForwardMigration(baseRecord());
  assert.ok(report.beforeFingerprint.startsWith('lfp:'));
  assert.ok(report.afterFingerprint.startsWith('lfp:'));
});

test('classifyForwardMigration report includes a human-readable reason', () => {
  const clean = classifyForwardMigration(baseRecord());
  assert.ok(clean.reason.length > 0);
  assert.ok(clean.reason.includes('unchanged'));

  const lossy = classifyForwardMigration(baseRecord({}, { modality: 'speculative' }));
  assert.ok(lossy.reason.includes('Lossy'));
});

test('golden vectors: all forward vectors pass validation', () => {
  const forwardVectors = IDENTITY_GOLDEN_VECTORS.filter((v) => v.direction === 'forward-0.1-to-0.2');
  const failures = validateIdentityGoldenVectors(forwardVectors);
  assert.equal(failures.length, 0, `Golden vector failures: ${JSON.stringify(failures, null, 2)}`);
});

test('golden vectors: set covers both identity-preserving and identity-creating cases', () => {
  const preserved = IDENTITY_GOLDEN_VECTORS.filter((v) => v.expectedIdentityPreserved);
  const creating = IDENTITY_GOLDEN_VECTORS.filter((v) => !v.expectedIdentityPreserved);
  assert.ok(preserved.length >= 2, 'Must have at least 2 identity-preserving vectors');
  assert.ok(creating.length >= 2, 'Must have at least 2 identity-creating vectors');
});

test('golden vectors: set covers both forward and backward directions', () => {
  const forward = IDENTITY_GOLDEN_VECTORS.filter((v) => v.direction === 'forward-0.1-to-0.2');
  const backward = IDENTITY_GOLDEN_VECTORS.filter((v) => v.direction === 'backward-0.2-to-0.1');
  assert.ok(forward.length >= 1);
  assert.ok(backward.length >= 1);
});

test('golden vectors: all have unique ids', () => {
  const ids = IDENTITY_GOLDEN_VECTORS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
});
