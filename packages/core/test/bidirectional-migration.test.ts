import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ── Simple JSON Schema validator ─────────────────────────────────

function validate(data: unknown, schema: any, errors: string[] = [], prefix: string = ''): boolean {
  if (typeof schema !== 'object' || schema === null) return true;
  if (schema.const !== undefined && data !== schema.const) {
    errors.push(`${prefix}: const mismatch`);
    return false;
  }
  if (Array.isArray(schema.enum) && !Array.isArray(data)) {
    if (!schema.enum.includes(data as any)) {
      errors.push(`${prefix}: not in enum`);
      return false;
    }
  }
  if (schema.required && typeof data === 'object' && data !== null) {
    for (const req of schema.required) {
      if (!(req in data)) errors.push(`${prefix}: missing ${req}`);
    }
  }
  if (schema.properties && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in obj)) continue;
      if (!validate(obj[key], propSchema as any, errors, `${prefix}.${key}`)) {}
    }
  }
  if (schema.additionalProperties === false && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) errors.push(`${prefix}: unexpected ${key}`);
    }
  }
  if (typeof data === 'string' && schema.pattern && !new RegExp(schema.pattern).test(data)) {
    errors.push(`${prefix}: pattern`);
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${prefix}: minimum`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${prefix}: maximum`);
  }
  if (Array.isArray(data) && schema.items) {
    if (schema.minItems && data.length < schema.minItems) errors.push(`${prefix}: minItems`);
    for (let i = 0; i < data.length; i++) validate(data[i], schema.items, errors, `${prefix}[${i}]`);
  }
  return errors.length === 0;
}

// ── 0.1 test fixtures ───────────────────────────────────────────

const sem01Fixture = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [
    {
      predicate: 'prefer',
      roles: { experiencer: { type: 'actor', id: 'user-1' } },
      negated: false,
      modality: 'uncertain',  // Non-enum value that should be locked
      time: { day: 15, month: 6, year: 2026 }  // Object time that should be stringified
    }
  ],
  references: [{ id: 'ref-1', url: 'https://example.com' }],
  provenance: { source: 'manual', author: 'test', extraField: 'should be removed' },
  annotations: { confidence: 0.95, tags: ['test'], extraAnnotation: 'should be removed' }
};

// ── Import migration functions ──────────────────────────────────

import { migrateSem01to02, migrateSem02to01, roundTripMigration } from '../src/fingerprint-migration.js';
import type { MigrationWarning } from '../src/fingerprint-migration.js';

// ── Tests ────────────────────────────────────────────────────────

test('forward migration: 0.1 → 0.2 Sem produces valid 0.2 schema', () => {
  const result = migrateSem01to02(sem01Fixture as any);
  
  // Check schema version
  assert.strictEqual((result.sem as any).schema, 'lunum-sem/0.2');
  
  // Check modality was locked
  assert.strictEqual((result.sem.clauses[0] as any).modality, 'certainty');
  
  // Check time was stringified
  assert.ok(typeof (result.sem.clauses[0] as any).time === 'string');
  assert.ok(JSON.parse((result.sem.clauses[0] as any).time).year === 2026);
  
  // Check provenance was locked
  const prov = (result.sem as any).provenance;
  assert.ok(!('extraField' in prov));
  assert.strictEqual(prov.source, 'manual');
  assert.strictEqual(prov.author, 'test');
  
  // Check annotations were locked
  const ann = (result.sem as any).annotations;
  assert.ok(!('extraAnnotation' in ann));
  assert.strictEqual(ann.confidence, 0.95);
  assert.deepStrictEqual(ann.tags, ['test']);
  
  // Check warnings were emitted
  assert.ok(result.warnings.length > 0, 'Should emit warnings for locked fields');
  const warningCodes = result.warnings.map((w: MigrationWarning) => w.code);
  assert.ok(warningCodes.includes('MODALITY_LOCKED'));
  assert.ok(warningCodes.includes('TIME_STRINGIFIED'));
  assert.ok(warningCodes.includes('PROVENANCE_FIELD_REMOVED'));
  assert.ok(warningCodes.includes('ANNOTATION_FIELD_REMOVED'));
});

test('forward migration: record has 0.2 version and fingerprint', () => {
  const result = migrateSem01to02(sem01Fixture as any);
  
  assert.strictEqual((result.record as any).recordVersion, 'lunum-record/0.2');
  assert.ok((result.record as any).fingerprint.startsWith('lfp:0.2:'));
  assert.ok((result.record as any).meta?.schemaVersion === '0.2');
});

test('forward migration: 0.2 result validates against 0.2 schema', () => {
  const result = migrateSem01to02(sem01Fixture as any);
  
  const sem02Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const errors: string[] = [];
  const pass = validate(result.sem, sem02Schema, errors);
  assert.strictEqual(pass, true, `0.2 migration should validate: ${errors.join('; ')}`);
});

test('backward migration: 0.2 → 0.1 Sem produces valid 0.1 schema', () => {
  // First migrate forward, then backward
  const forward = migrateSem01to02(sem01Fixture as any);
  const result = migrateSem02to01(forward.sem);
  
  // Check schema version
  assert.strictEqual((result.sem as any).schema, 'lunum-sem/0.1-draft');
  
  // Check record version
  assert.strictEqual((result.record as any).recordVersion, 'lunum-record/0.1-draft');
  
  // Check fingerprint version
  assert.ok((result.record as any).fingerprint.startsWith('lfp:0.1:'));
  
  // Check meta has 0.1-draft schemaVersion
  assert.strictEqual((result.record as any).meta?.schemaVersion, '0.1-draft');
  
  // Check warnings were emitted
  assert.ok(result.warnings.length > 0, 'Should emit warnings for lossy downgrade');
  const warningCodes = result.warnings.map((w: MigrationWarning) => w.code);
  assert.ok(warningCodes.includes('PROVENANCE_UNRESTRICTED'));
  assert.ok(warningCodes.includes('ANNOTATIONS_UNRESTRICTED'));
});

test('backward migration: 0.1 result validates against 0.1 schema', () => {
  const forward = migrateSem01to02(sem01Fixture as any);
  const result = migrateSem02to01(forward.sem);
  
  const sem01Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json'), 'utf-8'));
  const errors: string[] = [];
  const pass = validate(result.sem, sem01Schema, errors);
  assert.strictEqual(pass, true, `0.1 migration should validate: ${errors.join('; ')}`);
});

test('round-trip migration: 0.1 → 0.2 → 0.1 produces valid record', () => {
  const { forward, backward } = roundTripMigration(sem01Fixture as any);
  
  // Forward should produce 0.2
  assert.strictEqual((forward.sem as any).schema, 'lunum-sem/0.2');
  assert.strictEqual((forward.record as any).recordVersion, 'lunum-record/0.2');
  
  // Backward should produce 0.1
  assert.strictEqual((backward.sem as any).schema, 'lunum-sem/0.1-draft');
  assert.strictEqual((backward.record as any).recordVersion, 'lunum-record/0.1-draft');
  
  // Both should validate against their respective schemas
  const sem02Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const sem01Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json'), 'utf-8'));
  
  const forwardErrors: string[] = [];
  assert.strictEqual(validate(forward.sem, sem02Schema, forwardErrors), true);
  
  const backwardErrors: string[] = [];
  assert.strictEqual(validate(backward.sem, sem01Schema, backwardErrors), true);
});

test('round-trip migration: warns about data loss', () => {
  const { forward, backward } = roundTripMigration(sem01Fixture as any);
  
  // Forward should warn about locked fields
  assert.ok(forward.warnings.length > 0);
  
  // Backward should warn about unrestricted shapes
  assert.ok(backward.warnings.length > 0);
  const backwardCodes = backward.warnings.map((w: MigrationWarning) => w.code);
  assert.ok(backwardCodes.includes('PROVENANCE_UNRESTRICTED'));
  assert.ok(backwardCodes.includes('ANNOTATIONS_UNRESTRICTED'));
});

test('modality locked to certainty for unknown values', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {}, modality: 'unknown_modality' }]
  };
  
  const result = migrateSem01to02(input as any);
  assert.strictEqual((result.sem.clauses[0] as any).modality, 'certainty');
  
  const warning = result.warnings.find((w: MigrationWarning) => w.code === 'MODALITY_LOCKED');
  assert.ok(warning);
  assert.ok(warning.message.includes('unknown_modality'));
});

test('modality preserved if already in 0.2 enum', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {}, modality: 'possibility' }]
  };
  
  const result = migrateSem01to02(input as any);
  assert.strictEqual((result.sem.clauses[0] as any).modality, 'possibility');
  
  const warning = result.warnings.find((w: MigrationWarning) => w.code === 'MODALITY_LOCKED');
  assert.strictEqual(warning, undefined);
});

test('provenance strips unknown fields with warning', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {} }],
    provenance: { source: 'test', customField: 'value', anotherCustom: 123 }
  };
  
  const result = migrateSem01to02(input as any);
  const prov = (result.sem as any).provenance;
  assert.strictEqual(prov.source, 'test');
  assert.strictEqual(('customField' in prov), false);
  assert.strictEqual(('anotherCustom' in prov), false);
  
  const warnings = result.warnings.filter((w: MigrationWarning) => w.code === 'PROVENANCE_FIELD_REMOVED');
  assert.strictEqual(warnings.length, 2);
});

test('annotations strips unknown fields with warning', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {} }],
    annotations: { confidence: 0.9, customTag: 'value' }
  };
  
  const result = migrateSem01to02(input as any);
  const ann = (result.sem as any).annotations;
  assert.strictEqual(ann.confidence, 0.9);
  assert.strictEqual(('customTag' in ann), false);
  
  const warnings = result.warnings.filter((w: MigrationWarning) => w.code === 'ANNOTATION_FIELD_REMOVED');
  assert.strictEqual(warnings.length, 1);
});

test('time object is stringified during forward migration', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {}, time: { year: 2025, month: 1 } }]
  };
  
  const result = migrateSem01to02(input as any);
  const timeStr = (result.sem.clauses[0] as any).time;
  assert.ok(typeof timeStr === 'string');
  const parsed = JSON.parse(timeStr);
  assert.strictEqual(parsed.year, 2025);
  assert.strictEqual(parsed.month, 1);
});

test('time string is preserved if already ISO 8601', () => {
  const input = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {}, time: '2025-01-01T00:00:00Z' }]
  };
  
  const result = migrateSem01to02(input as any);
  // String time should be preserved as-is (not stringified again)
  const timeVal = (result.sem.clauses[0] as any).time;
  assert.strictEqual(timeVal, '2025-01-01T00:00:00Z');
});

test('backward migration preserves enum modality values', () => {
  const input = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: {}, modality: 'necessity' }]
  };
  
  const result = migrateSem02to01(input);
  // In 0.1, modality can be any string, so enum values are valid
  assert.strictEqual((result.sem.clauses[0] as any).modality, 'necessity');
});
