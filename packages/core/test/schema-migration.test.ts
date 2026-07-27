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
      if (!allowed.has(key)) {
        // Allow keys matching patternProperties if defined
        if (schema.patternProperties && typeof key === 'string') {
          let matched = false;
          for (const pattern of Object.keys(schema.patternProperties)) {
            if (new RegExp(pattern).test(key)) { matched = true; break; }
          }
          if (!matched) errors.push(`${prefix}: unexpected ${key}`);
        } else {
          errors.push(`${prefix}: unexpected ${key}`);
        }
      }
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
      negated: false
    }
  ],
  references: [{ id: 'ref-1', url: 'https://example.com' }],
  provenance: { source: 'manual', author: 'test' },
  annotations: { confidence: 0.95 }
};

// 0.2 versions of the fixtures (for direct 0.2 validation tests)
const sem02Fixture = {
  schema: 'lunum-sem/0.2',
  world: 'real',
  kind: 'preference',
  clauses: [
    {
      predicate: 'prefer',
      roles: { experiencer: { type: 'actor', id: 'user-1' } },
      negated: false,
      modality: 'certainty'
    }
  ],
  references: [{ id: 'ref-1', url: 'https://example.com' }],
  provenance: { source: 'manual', author: 'test', timestamp: '2026-01-01T00:00:00Z' },
  annotations: { confidence: 0.95 }
};

const record01Fixture = {
  recordVersion: 'lunum-record/0.1-draft',
  source: { text: 'I prefer red wine.', language: 'en' },
  sem: {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user-1' } } }]
  },
  fingerprint: 'lfp:0.1:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  renderings: { en: { code: 'I prefer red wine.', profile: 'generic-en-pivot/0.1' } },
  policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['clear preference'] },
  meta: { created: '2026-01-01T00:00:00Z' }
};

const record02Fixture = {
  recordVersion: 'lunum-record/0.2',
  source: { text: 'I prefer red wine.', language: 'en' },
  sem: sem02Fixture,
  fingerprint: 'lfp:0.2:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  renderings: { en: { code: 'I prefer red wine.', profile: 'generic-en-pivot/0.1' } },
  policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['clear preference'] },
  meta: { created: '2026-01-01T00:00:00Z', schemaVersion: '0.2' }
};

// ── Migration helper ────────────────────────────────────────────

/**
 * Migrate a Lunum-Sem 0.1 record to 0.2 by transforming schema references
 * and validating the result against the 0.2 schema.
 */
function migrateSem01to02(sem: unknown): unknown {
  const s = sem as Record<string, unknown>;
  const migrated = { ...s };

  // Update schema version
  if ((s.schema as string) === 'lunum-sem/0.1-draft') {
    (migrated.schema as string) = 'lunum-sem/0.2';
  }

  // Upgrade clauses
  if (Array.isArray(s.clauses)) {
    migrated.clauses = (s.clauses as unknown[]).map((clause: unknown) => {
      const c = clause as Record<string, unknown>;
      const upgraded: Record<string, unknown> = { ...c };

      // Lock modality to enum if present
      if (c.modality !== undefined) {
        const validModalities = [
          'fact', 'opinion', 'belief', 'possibility', 'necessity',
          'obligation', 'permission', 'ability', 'intention', 'certainty', null
        ];
        if (typeof c.modality === 'string' && !validModalities.includes(c.modality as string)) {
          (upgraded.modality as string) = 'certainty';
        }
      }

      // Ensure time is ISO 8601 string if present
      if (c.time !== undefined && typeof c.time !== 'string') {
        (upgraded.time as string) = typeof c.time === 'object' && c.time !== null
          ? JSON.stringify(c.time)
          : String(c.time);
      }

      return upgraded;
    });
  }

  return migrated;
}

// ── Tests ────────────────────────────────────────────────────────

test('0.1 schema fixture validates against 0.1 schema', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const errors: string[] = [];
  assert.strictEqual(validate(sem01Fixture, schema, errors), true, `0.1 fixture should validate: ${errors.join('; ')}`);
});

test('0.2 schema fixture validates against 0.2 schema', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const errors: string[] = [];
  assert.strictEqual(validate(sem02Fixture, schema, errors), true, `0.2 fixture should validate against 0.2: ${errors.join('; ')}`);
});

test('0.1 record fixture validates against 0.1 record schema', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const errors: string[] = [];
  // The 0.1 record fixture has renderings that won't match 0.2 schema's patternProperties,
  // so we validate against the 0.1 schema which allows unrestricted keys
  assert.strictEqual(validate(record01Fixture, schema, errors), true, `0.1 record should validate: ${errors.join('; ')}`);
});

test('0.2 record fixture validates against 0.2 record schema', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const errors: string[] = [];
  assert.strictEqual(validate(record02Fixture, schema, errors), true, `0.2 record should validate: ${errors.join('; ')}`);
});

test('schema migration: 0.1 Sem → 0.2 Sem produces valid 0.2 record', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const migrated = migrateSem01to02(sem01Fixture);
  const errors: string[] = [];
  const pass = validate(migrated, schema, errors);
  assert.strictEqual(pass, true, `Migrated 0.1→0.2 should validate: ${errors.join('; ')}`);
  assert.strictEqual((migrated as Record<string, unknown>).schema, 'lunum-sem/0.2');
});

test('schema migration: 0.1 Record → 0.2 Record produces valid 0.2 record', () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

  const record = record01Fixture as Record<string, unknown>;
  const sem = record.sem as Record<string, unknown>;
  const migratedSem = migrateSem01to02(sem);

  const migratedRecord = {
    ...record,
    recordVersion: 'lunum-record/0.2',
    sem: migratedSem
  };

  const errors: string[] = [];
  const pass = validate(migratedRecord, schema, errors);
  assert.strictEqual(pass, true, `Migrated 0.1→0.2 record should validate: ${errors.join('; ')}`);
  assert.strictEqual((migratedRecord as Record<string, unknown>).recordVersion, 'lunum-record/0.2');
});

test('0.2 schemas reject unknown top-level fields', () => {
  const semSchema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const recordSchema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json'), 'utf-8'));

  const withExtraSem = { ...sem01Fixture, extraField: 'should fail' };
  const semErrors: string[] = [];
  assert.strictEqual(validate(withExtraSem, semSchema, semErrors), false, 'Should reject extra fields in 0.2 sem');

  const withExtraRecord = { ...record01Fixture, extraField: 'should fail' };
  const recordErrors: string[] = [];
  assert.strictEqual(validate(withExtraRecord, recordSchema, recordErrors), false, 'Should reject extra fields in 0.2 record');
});

test('0.1 schemas reject unknown top-level fields', () => {
  const semSchema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json'), 'utf-8'));
  const recordSchema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record.schema.json'), 'utf-8'));

  const withExtraSem = { ...sem01Fixture, extraField: 'should fail' };
  const semErrors: string[] = [];
  assert.strictEqual(validate(withExtraSem, semSchema, semErrors), false, 'Should reject extra fields in 0.1 sem');

  const withExtraRecord = { ...record01Fixture, extraField: 'should fail' };
  const recordErrors: string[] = [];
  assert.strictEqual(validate(withExtraRecord, recordSchema, recordErrors), false, 'Should reject extra fields in 0.1 record');
});

test('both 0.1 and 0.2 schemas have additionalProperties: false', () => {
  const sem01 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json'), 'utf-8'));
  const sem02 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const record01 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record.schema.json'), 'utf-8'));
  const record02 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json'), 'utf-8'));

  assert.strictEqual(sem01.additionalProperties, false);
  assert.strictEqual(sem02.additionalProperties, false);
  assert.strictEqual(record01.additionalProperties, false);
  assert.strictEqual(record02.additionalProperties, false);
});

test('0.2 clause has modality enum covering the full ModalityType vocabulary', () => {
  const semSchema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const modalityDef = semSchema.$defs?.clause?.properties?.modality;
  assert.ok(modalityDef, '0.2 clause must define modality');
  assert.ok(Array.isArray(modalityDef.enum), 'modality must be an enum');
  assert.ok(modalityDef.enum.includes('fact'));
  assert.ok(modalityDef.enum.includes('opinion'));
  assert.ok(modalityDef.enum.includes('belief'));
  assert.ok(modalityDef.enum.includes('possibility'));
  assert.ok(modalityDef.enum.includes('necessity'));
  assert.ok(modalityDef.enum.includes('obligation'));
  assert.ok(modalityDef.enum.includes('permission'));
  assert.ok(modalityDef.enum.includes('ability'));
  assert.ok(modalityDef.enum.includes('intention'));
  assert.ok(modalityDef.enum.includes('certainty'));
  assert.ok(modalityDef.enum.includes(null));
});

test('migration test round-trip: 0.1 fixture → 0.2 → validate', () => {
  const sem02Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const record02Schema = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json'), 'utf-8'));

  // Migrate sem
  const migratedSem = migrateSem01to02(sem01Fixture);
  const semErrors: string[] = [];
  assert.strictEqual(validate(migratedSem, sem02Schema, semErrors), true, `Sem migration should pass: ${semErrors.join('; ')}`);

  // Migrate record
  const record = record01Fixture as Record<string, unknown>;
  const migratedRecord = {
    ...record,
    recordVersion: 'lunum-record/0.2',
    sem: migratedSem
  };
  const recordErrors: string[] = [];
  assert.strictEqual(validate(migratedRecord, record02Schema, recordErrors), true, `Record migration should pass: ${recordErrors.join('; ')}`);
});

test('schema 0.2 has stable $id and const values', () => {
  const sem02 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v02.schema.json'), 'utf-8'));
  const record02 = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'schemas', 'lunum-record-v02.schema.json'), 'utf-8'));

  assert.strictEqual(sem02.$id, 'https://openlunum.org/schemas/lunum-sem/0.2');
  assert.strictEqual(sem02.properties.schema.const, 'lunum-sem/0.2');
  assert.strictEqual(record02.$id, 'https://openlunum.org/schemas/lunum-record/0.2');
  assert.strictEqual(record02.properties.recordVersion.const, 'lunum-record/0.2');
});
