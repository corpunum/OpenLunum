import { test } from 'node:test';
import assert from 'node:assert';
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
  isCurrentSchema
} from '../src/fingerprint-migration.js';
import type { LunumRecord } from '../src/types.js';

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
