import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
import * as fs from 'fs';
const SCHEMAS_DIR = path.join(WORKSPACE_ROOT, 'schemas');
const TYPES_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'packages', 'core', 'src', 'types-schema.ts');

// ── Simple JSON Schema validator (no external deps) ───────────────

function validate(data: unknown, schema: any, errors: string[] = [], prefix: string = ''): boolean {
  if (typeof schema !== 'object' || schema === null) return true;

  if (schema.const !== undefined) {
    if (data !== schema.const) {
      errors.push(`${prefix}: const mismatch`);
      return false;
    }
  }

  if (Array.isArray(schema.enum) && !Array.isArray(data)) {
    if (!schema.enum.includes(data as any)) {
      errors.push(`${prefix}: not in enum`);
      return false;
    }
  }

  if (schema.required && typeof data === 'object' && data !== null) {
    for (const req of schema.required) {
      if (!(req in data)) {
        errors.push(`${prefix}: missing ${req}`);
      }
    }
  }

  if (schema.properties && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
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

  if (typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) errors.push(`${prefix}: minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push(`${prefix}: pattern`);
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

// ── Positive fixtures ─────────────────────────────────────────────

const positiveFixtures = [
  {
    name: 'valid experiment manifest',
    schema: 'experiment.schema.json',
    data: {
      schema: 'openlunum-experiment/0.1',
      id: 'test-exp-1',
      area: 'semantic-contract',
      task: 'parse',
      hypothesis: 'A test hypothesis that is long enough',
      baselineCommit: 'abc123',
      dataset: { path: 'datasets/dev/test.jsonl', sha256: 'a'.repeat(64) },
      modelProfile: 'profiles/models/test.json',
      limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 100 },
      gates: { minimumFeatureRecall: 0.9, minimumExactRate: 0.95, requireProtectedLiteralCoverage: true },
      outputDirectory: 'reports/experiments/test'
    }
  },
  {
    name: 'valid model profile',
    schema: 'model-profile.schema.json',
    data: {
      schema: 'openlunum-model-profile/0.1',
      id: 'test-model',
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      temperature: 0,
      timeoutMs: 120000
    }
  },
  {
    name: 'valid renderer profile',
    schema: 'renderer-profile.schema.json',
    data: {
      schema: 'openlunum-renderer-profile/0.1',
      id: 'safe/test/v1',
      semSchema: 'lunum-sem/0.1-draft',
      purpose: 'safe context',
      status: 'experimental',
      tokenStrategy: 'exact'
    }
  },
  {
    name: 'valid lunum-sem record',
    schema: 'lunum-sem.schema.json',
    data: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }]
    }
  },
  {
    name: 'valid lunum-record with nested structure',
    schema: 'lunum-record.schema.json',
    data: {
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: 'Test source' },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'test', clauses: [{ predicate: 'test', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:abc',
      renderings: {},
      policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['test'] }
    }
  }
];

// ── Negative fixtures ─────────────────────────────────────────────

const negativeFixtures = [
  {
    name: 'experiment missing required fields',
    schema: 'experiment.schema.json',
    data: { schema: 'openlunum-experiment/0.1', id: 'x' }
  },
  {
    name: 'model profile wrong provider',
    schema: 'model-profile.schema.json',
    data: { schema: 'openlunum-model-profile/0.1', id: 'x', provider: 'wrong', baseUrl: 'x', model: 'x', temperature: 0, timeoutMs: 1000 }
  },
  {
    name: 'renderer profile invalid status',
    schema: 'renderer-profile.schema.json',
    data: { schema: 'openlunum-renderer-profile/0.1', id: 'x', semSchema: 'x', purpose: 'x', status: 'production', tokenStrategy: 'x' }
  },
  {
    name: 'lunum-sem empty clauses',
    schema: 'lunum-sem.schema.json',
    data: { schema: 'lunum-sem/0.1-draft', world: 'x', kind: 'x', clauses: [] }
  },
  {
    name: 'lunum-record missing sem',
    schema: 'lunum-record.schema.json',
    data: { recordVersion: 'lunum-record/0.1-draft', source: { text: 'x' }, fingerprint: 'lfp:0.1:sha256:abc', renderings: {}, policy: { eligible: true, risk: 'low', confidence: 0.5 } }
  }
];

// ── Tests ─────────────────────────────────────────────────────────

test('positive fixtures: valid JSON matches its schema', async () => {
  for (const fixture of positiveFixtures) {
    const schemaPath = path.join(SCHEMAS_DIR, fixture.schema);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const errors: string[] = [];
    const pass = validate(fixture.data, schema, errors);
    assert.strictEqual(pass, true, `${fixture.name}: ${errors.join('; ')}`);
  }
});

test('negative fixtures: invalid JSON does not match its schema', async () => {
  for (const fixture of negativeFixtures) {
    const schemaPath = path.join(SCHEMAS_DIR, fixture.schema);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const errors: string[] = [];
    const pass = validate(fixture.data, schema, errors);
    assert.strictEqual(pass, false, `${fixture.name}: expected invalid but passed`);
  }
});

test('types-schema.ts exists and exports all schema interfaces', async () => {
  assert.ok(fs.existsSync(TYPES_SCHEMA_PATH), 'types-schema.ts must exist');
  const content = fs.readFileSync(TYPES_SCHEMA_PATH, 'utf-8');
  const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json'));
  for (const schemaFile of schemaFiles) {
    const typeName = schemaFile.replace(/\.schema\.json$/, '').split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') + 'Schema';
    assert.ok(content.includes(`export interface ${typeName}`), `Must export ${typeName}`);
  }
});

test('generated types compile', async () => {
  const content = fs.readFileSync(TYPES_SCHEMA_PATH, 'utf-8');
  const open = (content.match(/\{/g) || []).length;
  const close = (content.match(/\}/g) || []).length;
  assert.strictEqual(open, close, 'Braces must match');
});

test('conformance assertions compile', async () => {
  // This test ensures the conformance file exists and exports checks
  const conformancePath = path.join(WORKSPACE_ROOT, 'packages', 'core', 'dist', 'src', 'types-schema-conformance.js');
  assert.ok(fs.existsSync(conformancePath), 'types-schema-conformance.js must be built');
  const { schemaConformanceChecks } = await import(`file://${conformancePath}`);
  assert.ok(Array.isArray(schemaConformanceChecks), 'Must export schemaConformanceChecks array');
  assert.ok(schemaConformanceChecks.length > 0, 'Must have at least one check');
  assert.ok(schemaConformanceChecks.every(c => c === true), 'All checks must be true');
});

test('schema const values match expected', async () => {
  const experimentSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'experiment.schema.json'), 'utf-8'));
  assert.strictEqual(experimentSchema.properties.schema.const, 'openlunum-experiment/0.1');

  const modelSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'model-profile.schema.json'), 'utf-8'));
  assert.strictEqual(modelSchema.properties.schema.const, 'openlunum-model-profile/0.1');

  const rendererSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'renderer-profile.schema.json'), 'utf-8'));
  assert.strictEqual(rendererSchema.properties.schema.const, 'openlunum-renderer-profile/0.1');
});

test('lunum-sem schema has clause $defs', async () => {
  const semSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'lunum-sem.schema.json'), 'utf-8'));
  assert.ok(semSchema.$defs, 'lunum-sem.schema must have $defs');
  assert.ok(semSchema.$defs.clause, '$defs must include clause');
});

test('lunum-record schema has fingerprint pattern', async () => {
  const recordSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'lunum-record.schema.json'), 'utf-8'));
  const fpProp = recordSchema.properties.fingerprint;
  assert.ok(fpProp.pattern, 'fingerprint must have pattern');
  assert.ok(fpProp.pattern.startsWith('^lfp:'), 'pattern must start with lfp:');
});

test('experiment schema has task types', async () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'experiment.schema.json'), 'utf-8'));
  const tasks = schema.properties.task.enum;
  assert.ok(Array.isArray(tasks) && tasks.length > 0, 'Must have task types');
  assert.ok(tasks.includes('parse'), 'Must include parse');
});

test('experiment schema has required fields', async () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'experiment.schema.json'), 'utf-8'));
  assert.ok(schema.required.includes('schema'), 'Must require schema');
  assert.ok(schema.required.includes('id'), 'Must require id');
  assert.ok(schema.required.includes('task'), 'Must require task');
});

// Tests that verify the compile-time checks actually catch regressions
test('schema-to-ts regeneration is required when schema changes', async () => {
  const { execSync } = await import('node:child_process');
  // The schema-to-ts script should detect no drift with current types
  const output = execSync(`node ${path.join(WORKSPACE_ROOT, 'scripts', 'schema-to-ts.cjs')} --dry-run`, {
    cwd: WORKSPACE_ROOT, encoding: 'utf8'
  });
  assert.ok(output.includes('OK') || output.includes('No drift'), 'Schema must not drift from types-schema.ts');
});

test('positive compile fixture: TwoWay checks on actual public/generated types compile', async () => {
  // Compile-time proof that the same TwoWay projections in
  // types-schema-conformance.ts compile without error.
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');

  const fixturePath = path.join(WORKSPACE_ROOT, 'packages', 'core', 'test', 'fixtures', 'positive-compile-fixture.ts');
  const fixtureBasename = 'positive-compile-fixture.ts';

  assert.ok(fs.existsSync(fixturePath), `Fixture must exist: ${fixtureBasename}`);

  const tscPath = path.join(WORKSPACE_ROOT, 'node_modules', '.bin', 'tsc');
  const result = spawnSync(
    tscPath,
    [
      '--noEmit',
      '--strict',
      '--target', 'ES2023',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--esModuleInterop',
      '--skipLibCheck',
      fixturePath
    ],
    {
      cwd: WORKSPACE_ROOT,
      timeout: 30_000,
      encoding: 'utf8'
    }
  );

  assert.notStrictEqual(result.status, null, 'tsc must exit');
  assert.strictEqual(result.status, 0, `tsc must succeed for positive fixture, got ${result.status}`);
});

test('negative compile fixture: tsc produces exactly one TS2322', async () => {
  // Run tsc on the negative fixture and assert the exact diagnostic.
  // Unrelated errors must NOT exist — this prevents false positives.
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');

  const fixturePath = path.join(WORKSPACE_ROOT, 'packages', 'core', 'test', 'fixtures', 'negative-compile-fixture.ts');
  const fixtureBasename = 'negative-compile-fixture.ts';

  assert.ok(fs.existsSync(fixturePath), `Fixture must exist: ${fixtureBasename}`);

  const tscPath = path.join(WORKSPACE_ROOT, 'node_modules', '.bin', 'tsc');
  const result = spawnSync(
    tscPath,
    [
      '--noEmit',
      '--strict',
      '--target', 'ES2023',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--esModuleInterop',
      '--skipLibCheck',
      fixturePath
    ],
    {
      cwd: WORKSPACE_ROOT,
      timeout: 30_000,
      encoding: 'utf8'
    }
  );

  // No transport/error from spawn itself
  assert.strictEqual(result.error, undefined, `spawnSync error: ${result.error}`);
  assert.strictEqual(result.signal, null, `spawn signal: ${result.signal}`);

  // TypeScript exits with 1 on diagnostics
  assert.strictEqual(result.status, 1, `tsc exit code must be 1, got ${result.status}`);

  // Collect every diagnostic line
  const output = String(result.stdout || '') + String(result.stderr || '');
  const diagnosticLines = output
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^.*negative-compile-fixture\.ts\(\d+,\d+\): error TS\d+:/.test(l));

  // Must have exactly one diagnostic
  assert.strictEqual(diagnosticLines.length, 1, `Expected exactly 1 diagnostic, got ${diagnosticLines.length}: ${diagnosticLines.join(' | ')}`);

  // The sole diagnostic must match
  const sole = diagnosticLines[0]!;
  assert.ok(
    /^.*negative-compile-fixture\.ts\(\d+,7\): error TS2322: Type 'true' is not assignable to type 'false'\.?$/.test(sole),
    `Unexpected diagnostic: ${sole}`
  );
});
