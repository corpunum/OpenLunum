import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { fingerprintSem } from '../src/fingerprint.js';
import { canonicalizeSem } from '../src/canonicalize.js';
import {
  parseFingerprint,
  isCurrentVersion,
  detectRecordFpVersion,
  detectSemVersion,
  migrateFingerprint,
  migrateRecord,
  migrateRecords,
  buildGoldenVector,
  validateGoldenVector,
  dryRunMigration,
  isCurrentSchema,
  migrateForward01to02,
  migrateBackward02to01,
  migrateRecordsForward,
  migrateRecordsBackward,
  roundTripMigration,
  validateSemSchema,
  validateRecord,
  rollbackToSource,
  rollbackBatch
} from '../src/fingerprint-migration.js';
import type { LunumRecord } from '../src/types.js';

// ---------------------------------------------------------------------------
// Original tests from claimed branch (kept for regression)
// ---------------------------------------------------------------------------

test('fingerprintSem generates consistent fingerprints for same semantic content', () => {
  const sem1 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const sem2 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const fingerprint1 = fingerprintSem(sem1);
  const fingerprint2 = fingerprintSem(sem2);

  // Same semantic content should produce same fingerprint
  assert.strictEqual(fingerprint1, fingerprint2);
});

test('fingerprintSem versioning consistency', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const fingerprint = fingerprintSem(sem);
  
  // Should start with version prefix
  assert.ok(fingerprint.startsWith('lfp:0.1:'));
});

// ---------------------------------------------------------------------------
// parseFingerprint
// ---------------------------------------------------------------------------

test('parseFingerprint returns components for valid lfp fingerprint', () => {
  const fp = 'lfp:0.1:sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const result = parseFingerprint(fp);
  assert.ok(result);
  assert.strictEqual(result!.prefix, 'lfp');
  assert.strictEqual(result!.version, '0.1');
  assert.strictEqual(result!.algorithm, 'sha256');
  assert.strictEqual(result!.digest, 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
});

test('parseFingerprint returns components for valid lsf fingerprint', () => {
  const fp = 'lsf:0.1:sha256:1234567890abcdef1234567890abcdef1234567890abcdef';
  const result = parseFingerprint(fp);
  assert.ok(result);
  assert.strictEqual(result!.prefix, 'lsf');
  assert.strictEqual(result!.version, '0.1');
});

test('parseFingerprint returns null for malformed fingerprint', () => {
  assert.ok(parseFingerprint('invalid') === null);
  assert.ok(parseFingerprint('lfp:abc:sha256:abc') === null);
  assert.ok(parseFingerprint('') === null);
});

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

test('detectRecordFpVersion extracts version from record fingerprint', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  assert.strictEqual(detectRecordFpVersion(record), '0.1');
});

test('detectRecordFpVersion returns null for empty fingerprint', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: '',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  assert.strictEqual(detectRecordFpVersion(record), null);
});

test('detectSemVersion returns schema string', () => {
  const sem = { schema: 'lunum-sem/0.2-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] };
  assert.strictEqual(detectSemVersion(sem), 'lunum-sem/0.2-draft');
});

test('isCurrentVersion returns true for current version fingerprint', () => {
  assert.strictEqual(isCurrentVersion('lfp:0.1:sha256:abcdef1234567890'), true);
});

test('isCurrentVersion returns false for non-current version', () => {
  assert.strictEqual(isCurrentVersion('lfp:0.2:sha256:abcdef1234567890'), false);
});

test('isCurrentSchema returns true for current schema', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] };
  assert.strictEqual(isCurrentSchema(sem), true);
});

// ---------------------------------------------------------------------------
// migrateFingerprint
// ---------------------------------------------------------------------------

test('migrateFingerprint produces deterministic output for same input', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [{ predicate: 'test', roles: { subject: 'test' } }]
  };
  const fp1 = migrateFingerprint(sem);
  const fp2 = migrateFingerprint(sem);
  assert.strictEqual(fp1, fp2);
  assert.ok(fp1.startsWith('lfp:0.1:sha256:'));
});

test('migrateFingerprint produces different output for different input', () => {
  const sem1 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [{ predicate: 'a', roles: { subject: 'a' } }]
  };
  const sem2 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [{ predicate: 'b', roles: { subject: 'b' } }]
  };
  assert.notStrictEqual(migrateFingerprint(sem1), migrateFingerprint(sem2));
});

// ---------------------------------------------------------------------------
// migrateRecord
// ---------------------------------------------------------------------------

test('migrateRecord updates fingerprint to current version', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const migrated = migrateRecord(record);
  assert.strictEqual(migrated.fingerprint, migrateFingerprint(record.sem));
  assert.strictEqual(migrated.recordVersion, record.recordVersion);
  assert.strictEqual(migrated.source, record.source);
});

// ---------------------------------------------------------------------------
// migrateRecords
// ---------------------------------------------------------------------------

test('migrateRecords migrates all records in array', () => {
  const records: LunumRecord[] = [
    {
      recordVersion: '0.1-draft',
      source: { text: 'a', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'a', clauses: [{ predicate: 'a', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:aaa',
      renderings: {},
      policy: { eligible: true, category: 'a', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    },
    {
      recordVersion: '0.1-draft',
      source: { text: 'b', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'b', clauses: [{ predicate: 'b', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:bbb',
      renderings: {},
      policy: { eligible: true, category: 'b', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    }
  ];
  const migrated = migrateRecords(records);
  assert.strictEqual(migrated.length, 2);
  const m0 = migrated[0]!;
  const r0 = records[0]!;
  const m1 = migrated[1]!;
  const r1 = records[1]!;
  assert.strictEqual(m0.fingerprint, migrateFingerprint(r0.sem));
  assert.strictEqual(m1.fingerprint, migrateFingerprint(r1.sem));
});

// ---------------------------------------------------------------------------
// Golden vectors
// ---------------------------------------------------------------------------

test('buildGoldenVector creates golden entries', () => {
  const inputs = [
    { id: 'golden-1', sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] } }
  ];
  const golden = buildGoldenVector(inputs);
  assert.strictEqual(golden.length, 1);
  const g0 = golden[0]!;
  assert.strictEqual(g0.id, 'golden-1');
  assert.strictEqual(g0.version, '0.1');
  assert.ok(g0.expectedFp.startsWith('lfp:0.1:sha256:'));
});

test('validateGoldenVector returns empty array when all pass', () => {
  const golden = buildGoldenVector([
    { id: 'g1', sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] } }
  ]);
  const inputs = [
    { id: 'g1', sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] } }
  ];
  const failures = validateGoldenVector(golden, inputs);
  assert.strictEqual(failures.length, 0);
});

test('validateGoldenVector returns failures when fingerprint mismatch', () => {
  const golden = buildGoldenVector([
    { id: 'g1', sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] } }
  ]);
  const inputs = [
    { id: 'g1', sem: { schema: 'lunum-sem/0.1-draft', world: 'different', kind: 'test', clauses: [{ predicate: 'q', roles: {} }] } }
  ];
  const failures = validateGoldenVector(golden, inputs);
  assert.strictEqual(failures.length, 1);
  const f0 = failures[0]!;
  assert.strictEqual(f0.id, 'g1');
});

// ---------------------------------------------------------------------------
// dryRunMigration
// ---------------------------------------------------------------------------

test('dryRunMigration reports correct counts for uniform dataset', () => {
  const records: LunumRecord[] = Array.from({ length: 10 }, (_, i) => ({
    recordVersion: '0.1-draft',
    source: { text: `text-${i}`, language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: `w-${i}`, kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  }));
  const summary = dryRunMigration(records);
  assert.strictEqual(summary.total, 10);
  assert.strictEqual(summary.alreadyCurrent, 10);
  assert.strictEqual(summary.migrated, 0);
  assert.strictEqual(summary.failures.length, 0);
});

test('dryRunMigration reports correct counts for mixed dataset', () => {
  const records: LunumRecord[] = [
    {
      recordVersion: '0.1-draft',
      source: { text: 'a', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    },
    {
      recordVersion: '0.1-draft',
      source: { text: 'b', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'k', clauses: [{ predicate: 'q', roles: {} }] },
      fingerprint: 'lfp:0.2:sha256:abcdef1234567890',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    }
  ];
  const summary = dryRunMigration(records);
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.alreadyCurrent, 1);
  assert.strictEqual(summary.migrated, 1);
});

// ---------------------------------------------------------------------------
// Bidirectional migration tests (0.1 ↔ 0.2)
// ---------------------------------------------------------------------------

test('validateSemSchema returns true for valid schema', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [] };
  assert.strictEqual(validateSemSchema(sem), true);
});

test('validateSemSchema returns false for empty schema', () => {
  const sem = { schema: '', world: 'test', kind: 'test', clauses: [] };
  assert.strictEqual(validateSemSchema(sem), false);
});

test('validateRecord returns true for valid record', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [] },
    fingerprint: 'lfp:0.1:sha256:abcdef',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  assert.strictEqual(validateRecord(record), true);
});

test('validateRecord returns false for missing recordVersion', () => {
  const record: LunumRecord = {
    recordVersion: '',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [] },
    fingerprint: 'lfp:0.1:sha256:abcdef',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  assert.strictEqual(validateRecord(record), false);
});

test('migrateForward01to02 upgrades schema and recordVersion', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateForward01to02(record);
  assert.strictEqual(result.record.recordVersion, 'lunum-record/0.2');
  assert.strictEqual(result.sem.schema, 'lunum-sem/0.2');
  assert.ok(result.record.fingerprint.startsWith('lfp:0.2:'));
  assert.strictEqual(result.sourceValid, true);
  assert.strictEqual(result.destValid, true);
});

test('migrateForward01to02 locks modality to enum', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {}, modality: 'unknown_value' }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateForward01to02(record);
  const clause = result.sem.clauses[0]!;
  assert.strictEqual(clause.modality, 'certainty');
  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.warnings[0]!.code, 'MODALITY_LOCKED');
});

test('migrateForward01to02 warns on extra provenance fields', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt', author: 'a', timestamp: 't', license: 'L', extraField: 'x' } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateForward01to02(record);
  const warnings = result.warnings.filter(w => w.field.startsWith('provenance.'));
  assert.ok(warnings.length > 0);
  assert.strictEqual(result.sem.provenance!.extraField, undefined);
});

test('migrateForward01to02 warns on extra annotation fields', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], annotations: { confidence: 0.5, extra: 'x' } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateForward01to02(record);
  const warnings = result.warnings.filter(w => w.field.startsWith('annotations.'));
  assert.ok(warnings.length > 0);
  assert.strictEqual(result.sem.annotations!.extra, undefined);
});

test('migrateBackward02to01 downgrades schema and recordVersion', () => {
  const record: LunumRecord = {
    recordVersion: 'lunum-record/0.2',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.2', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.2:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateBackward02to01(record);
  assert.strictEqual(result.record.recordVersion, 'lunum-record/0.1-draft');
  assert.strictEqual(result.sem.schema, 'lunum-sem/0.1-draft');
  assert.ok(result.record.fingerprint.startsWith('lfp:0.1:'));
  assert.strictEqual(result.sourceValid, true);
  assert.strictEqual(result.destValid, true);
});

test('migrateBackward02to01 emits warnings for unrestricted schemas', () => {
  const record: LunumRecord = {
    recordVersion: 'lunum-record/0.2',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.2', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt' }, annotations: { confidence: 0.5 } },
    fingerprint: 'lfp:0.2:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = migrateBackward02to01(record);
  assert.ok(result.warnings.some(w => w.code === 'PROVENANCE_UNRESTRICTED'));
  assert.ok(result.warnings.some(w => w.code === 'ANNOTATIONS_UNRESTRICTED'));
});

test('migrateRecordsForward preserves input order', () => {
  const records: LunumRecord[] = [
    { recordVersion: '0.1-draft', source: { text: 'a', language: null, role: null, ref: null }, sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'k', clauses: [{ predicate: 'a', roles: {} }] }, fingerprint: 'lfp:0.1:sha256:aaa', renderings: {}, policy: { eligible: true, category: 'a', risk: 'low', confidence: 1, reasons: [] }, meta: {} },
    { recordVersion: '0.1-draft', source: { text: 'b', language: null, role: null, ref: null }, sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'k', clauses: [{ predicate: 'b', roles: {} }] }, fingerprint: 'lfp:0.1:sha256:bbb', renderings: {}, policy: { eligible: true, category: 'b', risk: 'low', confidence: 1, reasons: [] }, meta: {} }
  ];
  const result = migrateRecordsForward(records);
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(result.orderPreserved, true);
  assert.strictEqual(result.results[0]!.record.recordVersion, 'lunum-record/0.2');
  assert.strictEqual(result.results[1]!.record.recordVersion, 'lunum-record/0.2');
});

test('migrateRecordsBackward preserves input order', () => {
  const records: LunumRecord[] = [
    { recordVersion: 'lunum-record/0.2', source: { text: 'a', language: null, role: null, ref: null }, sem: { schema: 'lunum-sem/0.2', world: 'a', kind: 'k', clauses: [{ predicate: 'a', roles: {} }] }, fingerprint: 'lfp:0.2:sha256:aaa', renderings: {}, policy: { eligible: true, category: 'a', risk: 'low', confidence: 1, reasons: [] }, meta: {} },
    { recordVersion: 'lunum-record/0.2', source: { text: 'b', language: null, role: null, ref: null }, sem: { schema: 'lunum-sem/0.2', world: 'b', kind: 'k', clauses: [{ predicate: 'b', roles: {} }] }, fingerprint: 'lfp:0.2:sha256:bbb', renderings: {}, policy: { eligible: true, category: 'b', risk: 'low', confidence: 1, reasons: [] }, meta: {} }
  ];
  const result = migrateRecordsBackward(records);
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(result.orderPreserved, true);
  assert.strictEqual(result.results[0]!.record.recordVersion, 'lunum-record/0.1-draft');
  assert.strictEqual(result.results[1]!.record.recordVersion, 'lunum-record/0.1-draft');
});

test('roundTripMigration produces valid 0.1 record', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt' }, annotations: { confidence: 0.5 } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.5, reasons: ['test'] },
    meta: {}
  };
  const result = roundTripMigration(record);
  assert.strictEqual(result.forward.sem.schema, 'lunum-sem/0.2');
  assert.strictEqual(result.backward.sem.schema, 'lunum-sem/0.1-draft');
  assert.strictEqual(result.backward.record.recordVersion, 'lunum-record/0.1-draft');
  assert.ok(result.backward.warnings.length > 0);
});

// ---------------------------------------------------------------------------
// Rollback process tests
// ---------------------------------------------------------------------------

test('rollbackToSource returns source text with verified integrity', () => {
  const sourceText = 'The cat sat on the mat.';
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: sourceText, language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'sat', roles: { subject: 'cat', object: 'mat' } }] },
    fingerprint: '',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  // Compute correct fingerprint
  record.fingerprint = migrateFingerprint(record.sem);
  const result = rollbackToSource(record, { verifySourceDigest: false });
  assert.strictEqual(result.sourceText, sourceText);
  assert.strictEqual(result.sourceLanguage, 'en');
  assert.strictEqual(result.integrity, 'verified');
  assert.strictEqual(result.provenance, 'absent');
  assert.strictEqual(result.sourceAuthenticity, 'unverified');
  assert.strictEqual(result.verified, true);
});

test('rollbackToSource detects fingerprint mismatch', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:wrongdigest1234567890abcdef1234567890abcdef1234567890abcdef',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.integrity, 'mismatch');
  assert.strictEqual(result.verified, false);
});

test('rollbackToSource reports absent integrity when no fingerprint', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: '',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.integrity, 'absent');
});

test('rollbackToSource fails on empty source text', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: '', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.sourceText, '');
  assert.strictEqual(result.verified, false);
});

test('rollbackToSource verifies source digest when available', () => {
  const sourceText = 'The quick brown fox jumps.';
  const digest = crypto.createHash('sha256').update(sourceText).digest('hex');
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: sourceText, language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt', timestamp: '2024-01-01', sourceDigest: digest } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.sourceAuthenticity, 'verified');
});

test('rollbackToSource detects source digest mismatch', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt', timestamp: '2024-01-01', sourceDigest: 'wrongdigest1234567890abcdef1234567890abcdef1234567890abcdef1234567890' } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.sourceAuthenticity, 'unverified');
  assert.strictEqual(result.verified, false);
});

test('rollbackToSource verifies provenance chain with signature', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt', timestamp: '2024-01-01', signature: 'sig123' } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record, { verifySourceDigest: false });
  assert.strictEqual(result.provenance, 'verified');
});

test('rollbackToSource reports partial provenance without auth fields', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: 'en', role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }], provenance: { source: 'txt', timestamp: '2024-01-01' } },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record, { verifySourceDigest: false });
  assert.strictEqual(result.provenance, 'partial');
});

test('rollbackToSource reports absent provenance when no provenance chain', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:abcdef1234567890',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record, { verifySourceDigest: false });
  assert.strictEqual(result.provenance, 'absent');
});

test('rollbackBatch returns per-record results and summary', () => {
  const records: LunumRecord[] = [
    {
      recordVersion: '0.1-draft',
      source: { text: 'first', language: 'en', role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
      fingerprint: '',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    },
    {
      recordVersion: '0.1-draft',
      source: { text: 'second', language: 'en', role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
      fingerprint: '',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    }
  ];
  // Compute correct fingerprints
  records[0]!.fingerprint = migrateFingerprint(records[0]!.sem);
  records[1]!.fingerprint = migrateFingerprint(records[1]!.sem);

  const { results, summary } = rollbackBatch(records, { verifySourceDigest: false });
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0]!.sourceText, 'first');
  assert.strictEqual(results[1]!.sourceText, 'second');
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.verified, 2);
  assert.strictEqual(summary.allVerified, true);
});

test('rollbackBatch handles mixed verification status', () => {
  const records: LunumRecord[] = [
    {
      recordVersion: '0.1-draft',
      source: { text: 'good', language: 'en', role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
      fingerprint: '',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    },
    {
      recordVersion: '0.1-draft',
      source: { text: 'bad', language: 'en', role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:wrongdigest1234567890abcdef1234567890abcdef1234567890abcdef',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    }
  ];
  records[0]!.fingerprint = migrateFingerprint(records[0]!.sem);

  const { results, summary } = rollbackBatch(records, { verifySourceDigest: false });
  assert.strictEqual(results[0]!.verified, true);
  assert.strictEqual(results[1]!.verified, false);
  assert.strictEqual(summary.verified, 1);
  assert.strictEqual(summary.unverified, 1);
  assert.strictEqual(summary.allVerified, false);
});

test('rollbackToSource preserves input order in batch', () => {
  const records: LunumRecord[] = [
    {
      recordVersion: '0.1-draft',
      source: { text: 'a', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'a', kind: 'k', clauses: [{ predicate: 'a', roles: {} }] },
      fingerprint: '',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    },
    {
      recordVersion: '0.1-draft',
      source: { text: 'b', language: null, role: null, ref: null },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'b', kind: 'k', clauses: [{ predicate: 'b', roles: {} }] },
      fingerprint: '',
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
      meta: {}
    }
  ];
  records[0]!.fingerprint = migrateFingerprint(records[0]!.sem);
  records[1]!.fingerprint = migrateFingerprint(records[1]!.sem);

  const { results } = rollbackBatch(records, { verifySourceDigest: false });
  assert.strictEqual(results[0]!.sourceText, 'a');
  assert.strictEqual(results[1]!.sourceText, 'b');
});

test('rollbackToSource includes debug details when mismatches occur', () => {
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: 'lfp:0.1:sha256:wrongdigest',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.ok(result.details);
  assert.ok(result.details!.computedFp);
  assert.strictEqual(result.details!.storedFp, 'lfp:0.1:sha256:wrongdigest');
});

test('rollbackToSource fails closed when evidence is absent', () => {
  // Record with no fingerprint, no provenance, no digest
  const record: LunumRecord = {
    recordVersion: '0.1-draft',
    source: { text: 'test', language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'test', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: '',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
  const result = rollbackToSource(record);
  assert.strictEqual(result.integrity, 'absent');
  assert.strictEqual(result.provenance, 'absent');
  assert.strictEqual(result.sourceAuthenticity, 'unverified');
  // With no fingerprint and no provenance, should be unverified
  assert.strictEqual(result.verified, false);
});
