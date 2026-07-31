import { test } from 'node:test';
import assert from 'node:assert';
import {
  FP_CONTRACT_VERSION,
  FP_CONTRACT_ALGORITHM,
  FP_DEFAULT_DIGEST_LENGTH,
  FP_SURFACE_DEFAULT_DIGEST_LENGTH,
  FP_MIN_DIGEST_LENGTH,
  FP_MAX_DIGEST_LENGTH,
  FP_CONTRACT_ENTRY,
  FP_VERSION_REGISTRY,
  FP_GOLDEN_VECTORS,
  COMPUTED_GOLDEN_VECTORS,
  contractFingerprintSem,
  contractSurfaceFingerprint,
  computeFingerprint,
  isFingerprintVersionSupported,
  getFingerprintVersionState,
  isFingerprintVersionStable,
  checkFingerprintContract,
  verifyGoldenVectors,
  getFingerprintFrozenSchemas,
  isFingerprintSchemaFrozen,
  getFingerprintMigrationPath,
  type FingerprintVersionEntry,
  type FingerprintContractStatus,
  type GoldenFingerprintVector
} from '../src/fingerprint-contract.js';
import { parseFingerprint, migrateFingerprint } from '../src/fingerprint-migration.js';

// ── Constants ──────────────────────────────────────────────────────

test('FP_CONTRACT_VERSION is "1.0"', () => {
  assert.strictEqual(FP_CONTRACT_VERSION, '1.0');
});

test('FP_CONTRACT_ALGORITHM is "sha256"', () => {
  assert.strictEqual(FP_CONTRACT_ALGORITHM, 'sha256');
});

test('FP_MIN_DIGEST_LENGTH is 16', () => {
  assert.strictEqual(FP_MIN_DIGEST_LENGTH, 16);
});

test('FP_MAX_DIGEST_LENGTH is 64', () => {
  assert.strictEqual(FP_MAX_DIGEST_LENGTH, 64);
});

test('FP_DEFAULT_DIGEST_LENGTH is 32', () => {
  assert.strictEqual(FP_DEFAULT_DIGEST_LENGTH, 32);
});

test('FP_SURFACE_DEFAULT_DIGEST_LENGTH is 24', () => {
  assert.strictEqual(FP_SURFACE_DEFAULT_DIGEST_LENGTH, 24);
});

// ── Version Registry ───────────────────────────────────────────────

test('FP_VERSION_REGISTRY contains version "0.1"', () => {
  assert.ok('0.1' in FP_VERSION_REGISTRY);
});

test('FP_VERSION_REGISTRY contains version "1.0"', () => {
  assert.ok('1.0' in FP_VERSION_REGISTRY);
});

test('0.1 version is obsolete', () => {
  const entry = FP_VERSION_REGISTRY['0.1'];
  assert.strictEqual(entry!.lifecycleState, 'obsolete');
});

test('1.0 version is frozen', () => {
  const entry = FP_VERSION_REGISTRY['1.0'];
  assert.strictEqual(entry!.lifecycleState, 'frozen');
  assert.strictEqual(entry!.isCurrent, true);
});

test('FP_CONTRACT_ENTRY matches registry 1.0', () => {
  assert.deepStrictEqual(FP_VERSION_REGISTRY['1.0'], FP_CONTRACT_ENTRY);
});

// ── Golden Vectors ─────────────────────────────────────────────────

test('Golden vectors have non-empty expected fingerprints', () => {
  for (const v of FP_GOLDEN_VECTORS) {
    assert.ok(v.id.length > 0, `Golden vector id is non-empty`);
    assert.ok(v.description.length > 0, `Golden vector description is non-empty`);
    assert.strictEqual(v.expectedVersion, FP_CONTRACT_VERSION);
  }
});

test('Computed golden vectors have stable fingerprints', () => {
  assert.ok(COMPUTED_GOLDEN_VECTORS.length > 0);
  for (const v of COMPUTED_GOLDEN_VECTORS) {
    assert.ok(v.expectedFingerprint.length > 0);
    assert.ok(v.expectedDigest.length > 0);
    assert.strictEqual(v.expectedVersion, FP_CONTRACT_VERSION);
    const parsed = parseFingerprint(v.expectedFingerprint);
    assert.ok(parsed);
    assert.strictEqual(parsed!.version, FP_CONTRACT_VERSION);
    assert.strictEqual(parsed!.algorithm, 'sha256');
  }
});

test('time-null and time-omitted golden vectors produce identical fingerprints', () => {
  const nullVec = FP_GOLDEN_VECTORS.find((v) => v.id === 'time-null-identity')!;
  const omittedVec = FP_GOLDEN_VECTORS.find((v) => v.id === 'time-omitted-identity')!;
  const nullFp = contractFingerprintSem(nullVec.input);
  const omittedFp = contractFingerprintSem(omittedVec.input);
  assert.strictEqual(nullFp, omittedFp);
});

test('Surface whitespace normalization: same fingerprint for different whitespace', () => {
  const simpleVec = FP_GOLDEN_VECTORS.find((v) => v.id === 'surface-simple')!;
  const wsVec = FP_GOLDEN_VECTORS.find((v) => v.id === 'surface-whitespace')!;
  const simpleFp = contractSurfaceFingerprint(simpleVec.input);
  const wsFp = contractSurfaceFingerprint(wsVec.input);
  assert.strictEqual(simpleFp, wsFp);
});

test('Golden vectors pass golden verification', () => {
  const result = verifyGoldenVectors();
  assert.strictEqual(result.allPassed, true);
  assert.strictEqual(result.failed.length, 0);
});

// ── Fingerprint Functions ──────────────────────────────────────────

test('contractFingerprintSem returns correct format', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const fp = contractFingerprintSem(sem);
  assert.ok(fp.startsWith('lfp:1.0:sha256:'));
});

test('contractFingerprintSem is deterministic', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const fp1 = contractFingerprintSem(sem);
  const fp2 = contractFingerprintSem(sem);
  assert.strictEqual(fp1, fp2);
});

test('contractSurfaceFingerprint returns correct format', () => {
  const fp = contractSurfaceFingerprint('the meeting occurs');
  assert.ok(fp.startsWith('lsf:1.0:sha256:'));
});

test('computeFingerprint routes string input to surface fingerprint', () => {
  const fp = computeFingerprint('hello world');
  assert.ok(fp.startsWith('lsf:1.0:sha256:'));
});

test('computeFingerprint routes object input to semantic fingerprint', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const fp = computeFingerprint(sem);
  assert.ok(fp.startsWith('lfp:1.0:sha256:'));
});

test('custom digest length is applied', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const fp16 = contractFingerprintSem(sem, { length: 16 });
  const fp32 = contractFingerprintSem(sem, { length: 32 });
  const fp64 = contractFingerprintSem(sem, { length: 64 });
  const parts16 = fp16.split(':');
  const parts32 = fp32.split(':');
  const parts64 = fp64.split(':');
  assert.strictEqual(parts16[3]!.length, 16);
  assert.strictEqual(parts32[3]!.length, 32);
  assert.strictEqual(parts64[3]!.length, 64);
  assert.strictEqual(fp16, fp32.slice(0, fp16.length));
  assert.strictEqual(fp16, fp64.slice(0, fp16.length));
});

test('digest length bounded to min 16 and max 64', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const fp10 = contractFingerprintSem(sem, { length: 10 });
  const fp100 = contractFingerprintSem(sem, { length: 100 });
  assert.strictEqual(fp10.split(':')[3]!.length, 16);
  assert.strictEqual(fp100.split(':')[3]!.length, 64);
});

// ── Version Helpers ────────────────────────────────────────────────

test('isFingerprintVersionSupported returns true for known versions', () => {
  assert.strictEqual(isFingerprintVersionSupported('1.0'), true);
  assert.strictEqual(isFingerprintVersionSupported('0.1'), true);
});

test('isFingerprintVersionSupported returns false for unknown versions', () => {
  assert.strictEqual(isFingerprintVersionSupported('2.0'), false);
  assert.strictEqual(isFingerprintVersionSupported('0.3'), false);
});

test('getFingerprintVersionState returns correct state', () => {
  assert.strictEqual(getFingerprintVersionState('1.0'), 'frozen');
  assert.strictEqual(getFingerprintVersionState('0.1'), 'obsolete');
  assert.strictEqual(getFingerprintVersionState('2.0'), null);
});

test('isFingerprintVersionStable returns true for frozen versions', () => {
  assert.strictEqual(isFingerprintVersionStable('1.0'), true);
});

test('isFingerprintVersionStable returns false for obsolete versions', () => {
  assert.strictEqual(isFingerprintVersionStable('0.1'), false);
});

test('isFingerprintVersionStable returns false for unknown versions', () => {
  assert.strictEqual(isFingerprintVersionStable('2.0'), false);
});

// ── Contract Compliance ────────────────────────────────────────────

test('checkFingerprintContract validates correct fingerprint', () => {
  const fp = 'lfp:1.0:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.formatValid, true);
  assert.strictEqual(result.versionSupported, true);
  assert.strictEqual(result.digestLengthValid, true);
  assert.strictEqual(result.lifecycleState, 'frozen');
  assert.strictEqual(result.isStable, true);
});

test('checkFingerprintContract rejects malformed fingerprint', () => {
  const result = checkFingerprintContract('not-a-fingerprint');
  assert.strictEqual(result.formatValid, false);
  assert.strictEqual(result.versionSupported, false);
  assert.strictEqual(result.digestLengthValid, false);
  assert.strictEqual(result.lifecycleState, null);
  assert.strictEqual(result.isStable, false);
});

test('checkFingerprintContract rejects empty string', () => {
  const result = checkFingerprintContract('');
  assert.strictEqual(result.formatValid, false);
});

test('checkFingerprintContract detects obsolete version with warning', () => {
  const fp = 'lfp:0.1:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.formatValid, true);
  assert.strictEqual(result.versionSupported, true);
  assert.strictEqual(result.lifecycleState, 'obsolete');
  assert.strictEqual(result.isStable, false);
  assert.ok(result.warning !== undefined && result.warning.includes('obsolete'));
});

test('checkFingerprintContract accepts unknown version (format valid but not in registry)', () => {
  const fp = 'lfp:9.9:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.formatValid, true);
  assert.strictEqual(result.versionSupported, false);
  assert.strictEqual(result.lifecycleState, null);
  assert.strictEqual(result.isStable, false);
});

test('checkFingerprintContract rejects short digest', () => {
  const fp = 'lfp:1.0:sha256:a1b2c3'; // only 6 hex chars
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.digestLengthValid, false);
});

test('checkFingerprintContract accepts max length digest', () => {
  const fp = 'lfp:1.0:sha256:' + 'a'.repeat(64);
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.digestLengthValid, true);
});

test('checkFingerprintContract rejects too-long digest', () => {
  const fp = 'lfp:1.0:sha256:' + 'a'.repeat(65);
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.digestLengthValid, false);
});

test('checkFingerprintContract handles surface fingerprint', () => {
  const fp = 'lsf:1.0:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const result = checkFingerprintContract(fp);
  assert.strictEqual(result.formatValid, true);
  assert.strictEqual(result.versionSupported, true);
  assert.strictEqual(result.lifecycleState, 'frozen');
});

// ── Support Contract Integration ───────────────────────────────────

test('getFingerprintFrozenSchemas returns correct schemas', () => {
  const schemas = getFingerprintFrozenSchemas();
  assert.deepStrictEqual(schemas, ['lunum-sem/0.2', 'lunum-record/0.2']);
});

test('isFingerprintSchemaFrozen returns true for frozen schemas', () => {
  assert.strictEqual(isFingerprintSchemaFrozen('lunum-sem/0.2'), true);
  assert.strictEqual(isFingerprintSchemaFrozen('lunum-record/0.2'), true);
});

test('isFingerprintSchemaFrozen returns false for non-frozen schemas', () => {
  assert.strictEqual(isFingerprintSchemaFrozen('lunum-sem/0.1-draft'), false);
  assert.strictEqual(isFingerprintSchemaFrozen('lunum-record/0.1-draft'), false);
  assert.strictEqual(isFingerprintSchemaFrozen('unknown'), false);
});

// ── Migration Path ─────────────────────────────────────────────────

test('getFingerprintMigrationPath returns no-migration for same version', () => {
  const steps = getFingerprintMigrationPath('1.0', '1.0');
  assert.deepStrictEqual(steps, ['No migration needed']);
});

test('getFingerprintMigrationPath handles unknown versions', () => {
  const steps = getFingerprintMigrationPath('9.9', '8.8');
  assert.deepStrictEqual(steps, []);
});

test('getFingerprintMigrationPath handles 0.1 to 1.0 migration', () => {
  const steps = getFingerprintMigrationPath('0.1', '1.0');
  assert.ok(steps.length > 0);
  assert.ok(steps.some((s) => s.includes('Regenerate') || s.includes('version')));
});

// ── Cross-version compatibility ────────────────────────────────────

test('Migrate fingerprint then verify contract', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const migratedFp = migrateFingerprint(sem);
  const contractStatus = checkFingerprintContract(migratedFp);
  assert.strictEqual(contractStatus.formatValid, true);
  assert.strictEqual(contractStatus.versionSupported, true);
  // migrateFingerprint produces 0.1 which is obsolete
  assert.strictEqual(contractStatus.lifecycleState, 'obsolete');
});

test('Old fingerprint version still parseable', () => {
  const oldFp = 'lfp:0.1:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const parsed = parseFingerprint(oldFp);
  assert.ok(parsed);
  assert.strictEqual(parsed!.version, '0.1');
});

test('Fingerprint version mismatch means different digests for same input', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate: 'exist', roles: { subject: 'thing' } }]
  };
  const currentFp = contractFingerprintSem(sem);
  const oldFp = migrateFingerprint(sem);
  // Old version uses FP_VERSION 0.1, current uses FP_CONTRACT_VERSION 1.0
  assert.ok(currentFp !== oldFp);
  assert.ok(currentFp.startsWith('lfp:1.0:'));
  assert.ok(oldFp.startsWith('lfp:0.1:'));
});
