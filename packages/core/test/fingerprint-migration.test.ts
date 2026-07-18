import { test } from 'node:test';
import assert from 'node:assert';
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
  forwardMigrate,
  backwardMigrate,
  bidirectionalMigration
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
// Bidirectional migration (Issue #11 → WORK_QUEUE v4)
// ---------------------------------------------------------------------------

function makeRecord(id: string, fpVersion: string): LunumRecord {
  // Use only valid hex chars: '0'-'9' and 'a'-'f'
  const hexId = id.replace(/[^a-f0-9]/g, 'a').padStart(64, 'a').slice(0, 64);
  return {
    recordVersion: `${fpVersion}-draft`,
    source: { text: `text-${id}`, language: null, role: null, ref: null },
    sem: { schema: 'lunum-sem/0.1-draft', world: id, kind: 'k', clauses: [{ predicate: 'p', roles: {} }] },
    fingerprint: `lfp:${fpVersion}:sha256:${hexId}`,
    renderings: {},
    policy: { eligible: true, category: id, risk: 'low', confidence: 1, reasons: [] },
    meta: {}
  };
}

test('forwardMigrate: v0.1 → v0.2 migrates all v0.1 records', () => {
  const records = [makeRecord('a', '0.1'), makeRecord('b', '0.1')];
  const result = forwardMigrate(records);
  assert.strictEqual(result.migrated, 2);
  assert.strictEqual(result.alreadyV02, 0);
  assert.strictEqual(result.records.length, 2);
  for (const rec of result.records) {
    assert.ok(rec.fingerprint?.startsWith('lfp:0.2:'), `All records should be v0.2, got: ${rec.fingerprint}`);
  }
  assert.strictEqual(result.warnings.length, 0);
});

test('forwardMigrate: v0.2 records unchanged', () => {
  const v02Record = makeRecord('x', '0.2');
  const originalFp = v02Record.fingerprint;
  const result = forwardMigrate([v02Record]);
  assert.strictEqual(result.alreadyV02, 1);
  assert.strictEqual(result.migrated, 0);
  assert.strictEqual(result.records[0]!.fingerprint, originalFp);
});

test('forwardMigrate: mixed v0.1/v0.2 preserves v0.2, migrates v0.1', () => {
  const records = [makeRecord('a', '0.1'), makeRecord('b', '0.2'), makeRecord('c', '0.1')];
  const result = forwardMigrate(records);
  assert.strictEqual(result.migrated, 2);
  assert.strictEqual(result.alreadyV02, 1);
  // Check that migrated records are v0.2
  const v02Rec = result.records.find(r => r.fingerprint?.startsWith('lfp:0.2:'));
  assert.ok(v02Rec, 'Should have at least one v0.2 record');
});

test('backwardMigrate: v0.2 → v0.1 migrates all v0.2 records', () => {
  const records = [makeRecord('a', '0.2'), makeRecord('b', '0.2')];
  const result = backwardMigrate(records);
  assert.strictEqual(result.migrated, 2);
  assert.strictEqual(result.alreadyV01, 0);
  assert.strictEqual(result.records.length, 2);
  for (const rec of result.records) {
    assert.ok(rec.fingerprint?.startsWith('lfp:0.1:'), `All records should be v0.1, got: ${rec.fingerprint}`);
  }
  assert.ok(result.warnings.length > 0, 'Backward migration should emit warnings');
  for (const w of result.warnings) {
    assert.strictEqual(w.type, 'fingerprint-regenerated');
  }
});

test('backwardMigrate: v0.1 records unchanged', () => {
  const v01Record = makeRecord('y', '0.1');
  const originalFp = v01Record.fingerprint;
  const result = backwardMigrate([v01Record]);
  assert.strictEqual(result.alreadyV01, 1);
  assert.strictEqual(result.migrated, 0);
  assert.strictEqual(result.records[0]!.fingerprint, originalFp);
  assert.strictEqual(result.warnings.length, 0);
});

test('bidirectionalMigration: v0.1 → v0.2 → v0.1 cycle preserves record count', () => {
  const records = [makeRecord('a', '0.1'), makeRecord('b', '0.1'), makeRecord('c', '0.1')];
  const result = bidirectionalMigration(records);
  assert.strictEqual(result.forward.migrated, 3);
  assert.strictEqual(result.backward.migrated, 3);
  assert.strictEqual(result.backward.records.length, 3);
  // All should be back to v0.1 after the cycle
  for (const rec of result.backward.records) {
    assert.ok(rec.fingerprint?.startsWith('lfp:0.1:'), 'After backward pass, all should be v0.1');
  }
  assert.ok(result.netWarnings.length > 0, 'Should have warnings from backward migration');
});

test('bidirectionalMigration: forward then backward is idempotent on data integrity', () => {
  const records = [makeRecord('a', '0.1'), makeRecord('b', '0.1')];
  const result = bidirectionalMigration(records);
  // After forward, all should be v0.2
  for (const rec of result.forward.records) {
    assert.ok(rec.fingerprint?.startsWith('lfp:0.2:')); // Forward migrated
  }
  // After backward, all should be v0.1
  for (const rec of result.backward.records) {
    assert.ok(rec.fingerprint?.startsWith('lfp:0.1:')); // Backward migrated
  }
  // Semantic content should be preserved through both migrations
  assert.strictEqual(result.backward.records[0]!.sem.world, 'a');
  assert.strictEqual(result.backward.records[1]!.sem.world, 'b');
});
