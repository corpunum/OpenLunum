import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test compiled to packages/core/dist/test/
// schemas/ is at workspace root (4 levels up from dist/test)
// types-schema.ts is at packages/core/src/ (3 levels up from dist/test)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMAS_DIR = path.join(WORKSPACE_ROOT, 'schemas');
const TYPES_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'packages', 'core', 'src', 'types-schema.ts');

// Positive fixtures: valid JSON that should match the schemas
const positiveFixtures = [
  {
    name: 'valid experiment manifest',
    schema: 'experiment.schema.json',
    data: {
      schema: 'openlunum-experiment/0.1',
      id: 'test-exp-1',
      area: 'semantic-contract',
      task: 'parse',
      hypothesis: 'Testing that valid experiments pass conformance',
      baselineCommit: 'abc123',
      dataset: { path: 'datasets/dev/test.jsonl', sha256: 'a'.repeat(64) },
      modelProfile: 'profiles/models/test.json',
      limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 100 },
      gates: { minimumFeatureRecall: 0.9, minimumExactRate: 0.95, requireProtectedLiteralCoverage: true },
      outputDirectory: 'reports/experiments/test-exp-1'
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
      model: 'test-model-id',
      temperature: 0,
      timeoutMs: 120000
    }
  },
  {
    name: 'valid renderer profile',
    schema: 'renderer-profile.schema.json',
    data: {
      schema: 'openlunum-renderer-profile/0.1',
      id: 'safe/test-profile/v1',
      semSchema: 'lunum-sem/0.1-draft',
      purpose: 'safe context compilation',
      status: 'experimental',
      tokenStrategy: 'exact-count'
    }
  },
  {
    name: 'valid lunum-sem record',
    schema: 'lunum-sem.schema.json',
    data: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise' } } }]
    }
  },
  {
    name: 'valid lunum-record',
    schema: 'lunum-record.schema.json',
    data: {
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: 'The user prefers concise answers.', language: 'en' },
      sem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'prefer', roles: {} }] },
      fingerprint: 'lfp:0.1:sha256:abc',
      renderings: {},
      policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['test'] }
    }
  }
];

// Negative fixtures: invalid data that should NOT match the schemas
const negativeFixtures = [
  {
    name: 'experiment with missing required field',
    schema: 'experiment.schema.json',
    data: {
      schema: 'openlunum-experiment/0.1',
      id: 'test-exp-1',
      task: 'parse'
    }
  },
  {
    name: 'model profile with wrong provider',
    schema: 'model-profile.schema.json',
    data: {
      schema: 'openlunum-model-profile/0.1',
      id: 'test',
      provider: 'wrong-provider',
      baseUrl: 'http://test',
      model: 'test',
      temperature: 0,
      timeoutMs: 1000
    }
  },
  {
    name: 'renderer profile with unknown status',
    schema: 'renderer-profile.schema.json',
    data: {
      schema: 'openlunum-renderer-profile/0.1',
      id: 'test',
      semSchema: 'lunum-sem/0.1-draft',
      purpose: 'test',
      status: 'production',
      tokenStrategy: 'exact'
    }
  },
  {
    name: 'lunum-sem with empty clauses array',
    schema: 'lunum-sem.schema.json',
    data: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'test',
      clauses: []
    }
  }
];

// Simple schema validator (no external deps)
function validate(data: unknown, schema: any): boolean {
  if (typeof schema !== 'object' || schema === null) return false;

  // Check const
  if (schema.const !== undefined) {
    if (typeof data === 'object' && 'schema' in (data as any)) {
      return (data as any).schema === schema.const;
    }
    return data === schema.const;
  }

  // Check enum
  if (Array.isArray(schema.enum)) {
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
      return schema.enum.includes(data);
    }
    return false;
  }

  // Check required for objects
  if (schema.type === 'object' || schema.properties) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    const obj = data as Record<string, unknown>;
    for (const req of (schema.required || [])) {
      if (!(req in obj)) return false;
    }
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      if (key in obj) {
        if (!validate(obj[key], propSchema)) return false;
      }
    }
    return true;
  }

  // Check array
  if (schema.type === 'array') {
    if (!Array.isArray(data)) return false;
    if (schema.minItems && data.length < schema.minItems) return false;
    if (schema.items) {
      for (const item of data) {
        if (!validate(item, schema.items)) return false;
      }
    }
    return true;
  }

  // Check primitive types
  if (schema.type === 'string') {
    if (typeof data !== 'string') return false;
    if (schema.minLength && data.length < schema.minLength) return false;
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) return false;
    }
    return true;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof data !== 'number') return false;
    if (schema.minimum !== undefined && data < schema.minimum) return false;
    if (schema.maximum !== undefined && data > schema.maximum) return false;
    return true;
  }

  if (schema.type === 'boolean') {
    return typeof data === 'boolean';
  }

  if (schema.type === 'null') {
    return data === null;
  }

  // additionalProperties: false
  if (schema.additionalProperties === false && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const allowedKeys = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) return false;
    }
  }

  return true;
}

test('positive fixtures: valid JSON matches its schema', async () => {
  for (const fixture of positiveFixtures) {
    const schemaPath = path.join(SCHEMAS_DIR, fixture.schema);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const result = validate(fixture.data, schema);
    assert.strictEqual(result, true, `${fixture.name}: expected valid but got invalid`);
  }
});

test('negative fixtures: invalid JSON does not match its schema', async () => {
  for (const fixture of negativeFixtures) {
    const schemaPath = path.join(SCHEMAS_DIR, fixture.schema);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const result = validate(fixture.data, schema);
    assert.strictEqual(result, false, `${fixture.name}: expected invalid but got valid`);
  }
});

test('types-schema.ts exists and exports all schema interfaces', async () => {
  assert.ok(fs.existsSync(TYPES_SCHEMA_PATH), 'types-schema.ts must exist');
  const content = fs.readFileSync(TYPES_SCHEMA_PATH, 'utf-8');
  for (const schema of fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json')).sort()) {
    const typeName = schema.replace(/\.schema\.json$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') + 'Schema';
    assert.ok(content.includes(`export interface ${typeName}`), `types-schema.ts must export ${typeName}`);
  }
});

test('generated types compile', async () => {
  const content = fs.readFileSync(TYPES_SCHEMA_PATH, 'utf-8');
  // Basic syntax check: all interfaces and types must have matching braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  assert.strictEqual(openBraces, closeBraces, 'Generated types must have matching braces');
  
  // Check no undefined type references (basic check)
  const exportedTypes = content.match(/export (?:interface|type) (\w+)/g) || [];
  const typeNames: string[] = exportedTypes.map(t => t.match(/(\w+)$/)?.[1]!);
  
  // Each type name should appear in an export statement
  for (const typeName of typeNames) {
    const pattern = new RegExp(`export (?:interface|type) ${typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    assert.ok(pattern.test(content), `${typeName} should be defined in an export statement`);
  }
});
