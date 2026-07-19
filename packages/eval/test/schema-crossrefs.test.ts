import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv/dist/ajv.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_DIR = resolve(__dirname, '../../../../schemas');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('shared schema file exists', () => {
  const sharedPath = resolve(SCHEMA_DIR, 'shared.schema.json');
  assert.ok(readFileSync(sharedPath, 'utf8').length > 0, 'shared.schema.json must exist and be non-empty');
});

test('shared schema defines term', () => {
  const raw = readFileSync(resolve(SCHEMA_DIR, 'shared.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  assert.ok(schema.$defs?.term, 'shared schema must define term');
});

test('shared schema defines reference', () => {
  const raw = readFileSync(resolve(SCHEMA_DIR, 'shared.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  assert.ok(schema.$defs?.reference, 'shared schema must define reference');
});

test('lunum-sem 0.1 schema compiles in AJV', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });
  const raw = readFileSync(resolve(SCHEMA_DIR, 'lunum-sem.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  delete schema.$schema;
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function', 'schema should compile to a validate function');
});

test('lunum-sem 0.2 schema compiles in AJV', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });
  const raw = readFileSync(resolve(SCHEMA_DIR, 'lunum-sem-v02.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  delete schema.$schema;
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function', 'schema should compile to a validate function');
});

test('experiment schema compiles in AJV', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });
  const raw = readFileSync(resolve(SCHEMA_DIR, 'experiment.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  delete schema.$schema;
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function', 'schema should compile to a validate function');
});

test('protected-eval schema compiles in AJV', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });
  const raw = readFileSync(resolve(SCHEMA_DIR, 'protected-eval.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  delete schema.$schema;
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function', 'schema should compile to a validate function');
});

test('report-validation schema compiles in AJV', () => {
  const ajv = new AjvModule.Ajv({ allErrors: true, strict: false });
  const raw = readFileSync(resolve(SCHEMA_DIR, 'report-validation.schema.json'), 'utf8');
  const schema = JSON.parse(raw);
  delete schema.$schema;
  const validate = ajv.compile(schema);
  assert.ok(typeof validate === 'function', 'schema should compile to a validate function');
});
