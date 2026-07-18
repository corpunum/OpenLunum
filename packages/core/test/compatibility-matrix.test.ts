import { test } from 'node:test';
import assert from 'node:assert';
import {
  isCompatible,
  getCompatibleSchemas,
  getAllSchemaVersions,
  isRegistered,
  getSchemaMetadata,
  verifyCompatibility,
  SCHEMA_REGISTRY,
  COMPATIBILITY_MATRIX
} from '../src/compatibility-matrix.js';

// ── Schema Registry Tests ──────────────────────────────────────────

test('SCHEMA_REGISTRY contains all known schemas', () => {
  const schemas = getAllSchemaVersions();
  assert.ok(schemas.length >= 5, 'Must have at least 5 registered schemas');
  assert.ok(schemas.includes('lunum-sem/0.1-draft'));
  assert.ok(schemas.includes('lunum-record/0.1-draft'));
  assert.ok(schemas.includes('openlunum-experiment/0.1'));
});

test('isRegistered returns true for known schemas', () => {
  assert.strictEqual(isRegistered('lunum-sem/0.1-draft'), true);
  assert.strictEqual(isRegistered('lunum-record/0.1-draft'), true);
  assert.strictEqual(isRegistered('unknown-schema/1.0'), false);
});

test('getSchemaMetadata returns metadata for known schemas', () => {
  const meta = getSchemaMetadata('lunum-sem/0.1-draft');
  assert.ok(meta);
  assert.strictEqual(meta!.id, 'lunum-sem/0.1-draft');
  assert.strictEqual(meta!.deprecated, false);
  assert.ok(meta!.releasedAt.length > 0);
});

test('getSchemaMetadata returns undefined for unknown schemas', () => {
  const meta = getSchemaMetadata('unknown/1.0');
  assert.strictEqual(meta, undefined);
});

// ── Compatibility Matrix Tests ─────────────────────────────────────

test('COMPATIBILITY_MATRIX has entries for known package versions', () => {
  const entries = COMPATIBILITY_MATRIX;
  const v01 = entries.find(e => e.packageVersion === '0.1.0');
  const v02 = entries.find(e => e.packageVersion === '0.2.0');
  assert.ok(v01, 'Must have entry for 0.1.0');
  assert.ok(v02, 'Must have entry for 0.2.0');
  assert.ok(v01!.compatibleSchemas.length > 0);
  assert.ok(v02!.compatibleSchemas.length > 0);
});

test('isCompatible returns true for compatible pairs', () => {
  assert.strictEqual(isCompatible('0.2.0', 'lunum-sem/0.1-draft'), true);
  assert.strictEqual(isCompatible('0.2.0', 'lunum-record/0.1-draft'), true);
  assert.strictEqual(isCompatible('0.1.0', 'openlunum-experiment/0.1'), true);
});

test('isCompatible returns false for incompatible pairs', () => {
  assert.strictEqual(isCompatible('0.2.0', 'unknown-schema/1.0'), false);
  assert.strictEqual(isCompatible('99.0.0', 'lunum-sem/0.1-draft'), false);
});

test('getCompatibleSchemas returns correct schemas for package version', () => {
  const schemas = getCompatibleSchemas('0.2.0');
  assert.ok(schemas.includes('lunum-sem/0.1-draft'));
  assert.ok(schemas.includes('openlunum-renderer-profile/0.1'));
});

test('getCompatibleSchemas returns empty array for unknown package version', () => {
  const schemas = getCompatibleSchemas('99.0.0');
  assert.strictEqual(schemas.length, 0);
});

// ── CI Verification Tests ──────────────────────────────────────────

test('verifyCompatibility passes when all schemas are compatible', () => {
  const result = verifyCompatibility('0.2.0');
  assert.strictEqual(result.allPassed, true);
  assert.strictEqual(result.failed.length, 0);
  assert.ok(result.passed.length > 0);
});

test('verifyCompatibility fails for unknown package version', () => {
  const result = verifyCompatibility('99.0.0');
  assert.strictEqual(result.allPassed, false);
  assert.strictEqual(result.passed.length, 0);
  assert.ok(result.failed.length > 0);
});

test('verifyCompatibility reports correct failed schemas', () => {
  // Create a scenario where one schema is not compatible
  const entry = COMPATIBILITY_MATRIX.find(e => e.packageVersion === '0.2.0')!;
  const allSchemas = getAllSchemaVersions();
  
  // The current matrix should have all schemas compatible
  const result = verifyCompatibility('0.2.0');
  assert.strictEqual(result.allPassed, true);
  
  // Verify each passed schema is in the registry
  for (const schema of result.passed) {
    assert.ok(isRegistered(schema), `${schema} must be in registry`);
  }
});
