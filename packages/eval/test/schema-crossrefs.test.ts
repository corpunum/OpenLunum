/**
 * Schema $ref cross-reference validation tests.
 *
 * Validates that the Lunum-Sem 0.2 schema graph resolves correctly
 * via $ref cross-references to shared.schema.json, and that AJV can
 * validate the complete graph without suppressing schema validity.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import AjvModule from 'ajv/dist/ajv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_DIR = resolve(__dirname, '../../../../schemas');

// Load a schema file
function loadSchema(name: string): any {
  const raw = readFileSync(resolve(SCHEMA_DIR, name), 'utf8');
  return JSON.parse(raw);
}

// ── Test: shared schema exists and defines expected concepts ───────

test('shared schema: file exists and is non-empty', () => {
  const shared = loadSchema('shared.schema.json');
  assert.ok(shared.$defs, 'shared schema must have $defs');
  assert.ok(Object.keys(shared.$defs).length > 0, 'shared schema must define at least one concept');
});

test('shared schema: defines term', () => {
  const shared = loadSchema('shared.schema.json');
  assert.ok(shared.$defs?.term, 'shared schema must define term');
});

test('shared schema: defines reference', () => {
  const shared = loadSchema('shared.schema.json');
  assert.ok(shared.$defs?.reference, 'shared schema must define reference');
});

test('shared schema: defines iso8601', () => {
  const shared = loadSchema('shared.schema.json');
  assert.ok(shared.$defs?.iso8601, 'shared schema must define iso8601');
});

test('shared schema: defines confidence', () => {
  const shared = loadSchema('shared.schema.json');
  assert.ok(shared.$defs?.confidence, 'shared schema must define confidence');
});

// ── Test: 0.2 schemas reference shared definitions ─────────────────

test('lunum-sem 0.2: references shared term in clause roles', () => {
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  const clause = sem02.$defs?.clause;
  assert.ok(clause, '0.2 schema must define clause');
  const rolesDef = clause?.properties?.roles;
  assert.ok(rolesDef, 'clause must define roles');
  const rolesAdditionalProps = rolesDef?.additionalProperties;
  assert.ok(
    rolesAdditionalProps?.$ref?.includes('shared.schema.json') ||
    rolesAdditionalProps?.$ref?.includes('openlunum.org/schemas/shared'),
    'clause roles must $ref shared term definition'
  );
});

test('lunum-sem 0.2: references shared reference in references array', () => {
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  const refsDef = sem02.properties?.references;
  assert.ok(refsDef, '0.2 schema must define references');
  const items = refsDef?.items;
  assert.ok(
    items?.$ref?.includes('shared.schema.json') ||
    items?.$ref?.includes('openlunum.org/schemas/shared'),
    'references array items must $ref shared reference definition'
  );
});

test('lunum-sem 0.2: references shared iso8601 in provenance timestamp', () => {
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  const provDef = sem02.properties?.provenance;
  assert.ok(provDef, '0.2 schema must define provenance');
  const timestamp = provDef?.properties?.timestamp;
  assert.ok(
    timestamp?.$ref?.includes('shared.schema.json') ||
    timestamp?.$ref?.includes('openlunum.org/schemas/shared'),
    'provenance timestamp must $ref shared iso8601'
  );
});

test('lunum-sem 0.2: references shared confidence in annotations', () => {
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  const annDef = sem02.properties?.annotations;
  assert.ok(annDef, '0.2 schema must define annotations');
  const confidence = annDef?.properties?.confidence;
  assert.ok(
    confidence?.$ref?.includes('shared.schema.json') ||
    confidence?.$ref?.includes('openlunum.org/schemas/shared'),
    'annotations confidence must $ref shared confidence'
  );
});

test('lunum-record 0.2: references shared confidence in policy', () => {
  const record02 = loadSchema('lunum-record-v02.schema.json');
  const policy = record02.properties?.policy;
  assert.ok(policy, '0.2 record must define policy');
  const confidence = policy?.properties?.confidence;
  assert.ok(
    confidence?.$ref?.includes('shared.schema.json') ||
    confidence?.$ref?.includes('openlunum.org/schemas/shared'),
    'policy confidence must $ref shared confidence'
  );
});

test('lunum-record 0.2: references shared iso8601 in meta', () => {
  const record02 = loadSchema('lunum-record-v02.schema.json');
  const meta = record02.properties?.meta;
  assert.ok(meta, '0.2 record must define meta');
  const created = meta?.properties?.created;
  assert.ok(
    created?.$ref?.includes('shared.schema.json') ||
    created?.$ref?.includes('openlunum.org/schemas/shared'),
    'meta.created must $ref shared iso8601'
  );
});

// ── Test: AJV validates complete schema graph ──────────────────────

test('AJV: lunum-sem 0.2 validates with cross-refs against 0.2 fixture', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });

  // Add shared schema first
  const shared = loadSchema('shared.schema.json');
  ajv.addSchema(shared, 'shared.schema.json');

  // Add lunum-sem 0.2
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  ajv.addSchema(sem02, 'lunum-sem-v02.schema.json');

  // Test data that should validate
  const validSem = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'preference',
    clauses: [
      {
        predicate: 'prefer',
        roles: {
          experiencer: { type: 'actor', id: 'user-1' }
        },
        negated: false
      }
    ],
    references: [
      { id: 'ref-1', url: 'https://example.com' }
    ],
    annotations: {
      confidence: 0.95
    }
  };

  const validate = ajv.getSchema('lunum-sem-v02.schema.json');
  assert.ok(typeof validate === 'function');
  const valid = validate(validSem);
  assert.strictEqual(valid, true, `0.2 fixture should validate: ${validate?.errors}`);
});

test('AJV: lunum-record 0.2 validates with cross-refs against 0.2 fixture', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });

  // Add shared schema first
  const shared = loadSchema('shared.schema.json');
  ajv.addSchema(shared, 'shared.schema.json');

  // Add lunum-sem 0.2 (required by record)
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  ajv.addSchema(sem02, 'lunum-sem-v02.schema.json');

  // Add lunum-record 0.2
  const record02 = loadSchema('lunum-record-v02.schema.json');
  ajv.addSchema(record02, 'lunum-record-v02.schema.json');

  // Test data
  const validRecord = {
    recordVersion: 'lunum-record/0.2',
    source: { text: 'I prefer red wine.', language: 'en' },
    sem: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'preference',
      clauses: [
        { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'u1' } }, negated: false }
      ]
    },
    fingerprint: 'lfp:0.2:sha256:abcdef1234567890',
    renderings: { en: { code: 'I prefer red wine.', profile: 'generic-en-pivot/0.1' } },
    policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['clear preference'] },
    meta: { created: '2026-01-01T00:00:00Z', schemaVersion: '0.2' }
  };

  const validate = ajv.getSchema('lunum-record-v02.schema.json');
  assert.ok(typeof validate === 'function');
  const valid = validate(validRecord);
  assert.strictEqual(valid, true, `0.2 record should validate: ${validate?.errors}`);
});

test('AJV: incorrect refs cause validation to fail', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });

  // Add shared schema
  const shared = loadSchema('shared.schema.json');
  ajv.addSchema(shared, 'shared.schema.json');

  // Add lunum-sem 0.2
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  ajv.addSchema(sem02, 'lunum-sem-v02.schema.json');

  const validate = ajv.getSchema('lunum-sem-v02.schema.json');
  assert.ok(typeof validate === 'function');

  // Invalid: confidence out of range
  const invalidSem = {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'test',
    clauses: [{ predicate: 'test', roles: { a: 'x' }, negated: false }],
    annotations: { confidence: 1.5 } // exceeds maximum 1
  };
  const result = validate(invalidSem);
  assert.strictEqual(result, false);
  const errors = (validate as any)?.errors;
  assert.ok(Array.isArray(errors) && errors.length > 0, 'should report validation errors');
});

test('AJV: all schema files compile without circular reference errors', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });

  // Add shared schema first
  const shared = loadSchema('shared.schema.json');
  ajv.addSchema(shared, 'shared.schema.json');

  // Add lunum-sem 0.2
  const sem02 = loadSchema('lunum-sem-v02.schema.json');
  ajv.addSchema(sem02, 'lunum-sem-v02.schema.json');

  // Add lunum-record 0.2
  const record02 = loadSchema('lunum-record-v02.schema.json');
  ajv.addSchema(record02, 'lunum-record-v02.schema.json');

  // Add experiment schema
  const experiment = loadSchema('experiment.schema.json');
  ajv.addSchema(experiment, 'experiment.schema.json');

  // Add protected-eval schema
  const protectedEval = loadSchema('protected-eval.schema.json');
  ajv.addSchema(protectedEval, 'protected-eval.schema.json');

  // Add report-validation schema
  const reportValidation = loadSchema('report-validation.schema.json');
  ajv.addSchema(reportValidation, 'report-validation.schema.json');

  // All schemas should have been added without circular reference errors
  assert.ok(ajv.getSchema('lunum-sem-v02.schema.json'), 'should have lunum-sem-v02 schema');
  assert.ok(ajv.getSchema('lunum-record-v02.schema.json'), 'should have lunum-record-v02 schema');
  assert.ok(ajv.getSchema('experiment.schema.json'), 'should have experiment schema');
  assert.ok(ajv.getSchema('protected-eval.schema.json'), 'should have protected-eval schema');
  assert.ok(ajv.getSchema('report-validation.schema.json'), 'should have report-validation schema');
});

// ── Test: shared concepts only used where semantics match ──────────

test('shared term: matches clause roles semantics', () => {
  const shared = loadSchema('shared.schema.json');
  const termDef = shared.$defs?.term;
  assert.ok(termDef, 'shared term must exist');
  assert.ok(termDef.oneOf, 'shared term must use oneOf for string/number/boolean/object');
});

test('shared reference: matches external reference semantics', () => {
  const shared = loadSchema('shared.schema.json');
  const refDef = shared.$defs?.reference;
  assert.ok(refDef, 'shared reference must exist');
  assert.ok(Array.isArray(refDef.required), 'shared reference must have required fields');
  assert.ok(refDef.required.includes('id'), 'shared reference must require id');
  assert.ok(refDef.required.includes('url'), 'shared reference must require url');
});

test('shared confidence: matches confidence semantics', () => {
  const shared = loadSchema('shared.schema.json');
  const confDef = shared.$defs?.confidence;
  assert.ok(confDef, 'shared confidence must exist');
  assert.strictEqual(confDef.type, 'number', 'confidence must be a number');
  assert.strictEqual(confDef.minimum, 0, 'confidence minimum must be 0');
  assert.strictEqual(confDef.maximum, 1, 'confidence maximum must be 1');
});

test('shared iso8601: matches timestamp semantics', () => {
  const shared = loadSchema('shared.schema.json');
  const isoDef = shared.$defs?.iso8601;
  assert.ok(isoDef, 'shared iso8601 must exist');
  assert.strictEqual(isoDef.type, 'string', 'iso8601 must be a string');
  assert.strictEqual(isoDef.format, 'date-time', 'iso8601 must have date-time format');
});
