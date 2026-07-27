import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  SEM_SCHEMA_FROZEN,
  SEM_SCHEMA_V1,
  FROZEN_SEM_SCHEMAS,
  FINGERPRINT_VERSION,
  FINGERPRINT_MIGRATION_POLICY,
  CANONICALIZATION_VERSION,
  CANONICALIZATION_POLICY,
  NORMATIVE_EXAMPLES,
  isFrozenSemSchema,
  validateSem,
  SEM_SCHEMA,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem-v1.0.json');

describe('schema freeze', () => {
  it('SEM_SCHEMA_FROZEN equals the current SEM_SCHEMA constant', () => {
    assert.strictEqual(SEM_SCHEMA_FROZEN, SEM_SCHEMA);
    assert.strictEqual(SEM_SCHEMA_FROZEN, 'lunum-sem/0.1-draft');
  });

  it('SEM_SCHEMA_V1 is lunum-sem/1.0', () => {
    assert.strictEqual(SEM_SCHEMA_V1, 'lunum-sem/1.0');
  });

  it('FROZEN_SEM_SCHEMAS includes both 0.1-draft and 1.0', () => {
    assert.ok(FROZEN_SEM_SCHEMAS.includes('lunum-sem/0.1-draft'));
    assert.ok(FROZEN_SEM_SCHEMAS.includes('lunum-sem/1.0'));
    assert.strictEqual(FROZEN_SEM_SCHEMAS.length, 2);
  });

  it('isFrozenSemSchema returns true for frozen schemas', () => {
    assert.strictEqual(isFrozenSemSchema('lunum-sem/0.1-draft'), true);
    assert.strictEqual(isFrozenSemSchema('lunum-sem/1.0'), true);
  });

  it('isFrozenSemSchema returns false for unknown schemas', () => {
    assert.strictEqual(isFrozenSemSchema('lunum-sem/2.0'), false);
    assert.strictEqual(isFrozenSemSchema('unknown'), false);
  });
});

describe('fingerprint freeze', () => {
  it('FINGERPRINT_VERSION is lunum-fp/1.0', () => {
    assert.strictEqual(FINGERPRINT_VERSION, 'lunum-fp/1.0');
  });

  it('fingerprint migration policy is frozen', () => {
    assert.strictEqual(FINGERPRINT_MIGRATION_POLICY.frozen, true);
    assert.strictEqual(FINGERPRINT_MIGRATION_POLICY.version, FINGERPRINT_VERSION);
    assert.ok(FINGERPRINT_MIGRATION_POLICY.migrationRules.length >= 3);
  });
});

describe('canonicalization freeze', () => {
  it('CANONICALIZATION_VERSION is lunum-canon/1.0', () => {
    assert.strictEqual(CANONICALIZATION_VERSION, 'lunum-canon/1.0');
  });

  it('canonicalization policy is frozen with explicit rules', () => {
    assert.strictEqual(CANONICALIZATION_POLICY.frozen, true);
    assert.ok(CANONICALIZATION_POLICY.rules.length >= 5);
  });
});

describe('normative examples', () => {
  it('has at least 8 normative examples', () => {
    assert.ok(NORMATIVE_EXAMPLES.length >= 8);
  });

  it('each example has unique id', () => {
    const ids = NORMATIVE_EXAMPLES.map(e => e.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('each example has id, description, sourceText, and valid sem', () => {
    for (const ex of NORMATIVE_EXAMPLES) {
      assert.ok(ex.id.length > 0);
      assert.ok(ex.description.length > 0);
      assert.ok(ex.sourceText.length > 0);
      assert.ok(ex.sem);
      assert.ok(ex.sem.schema);
      assert.ok(ex.sem.world);
      assert.ok(ex.sem.kind);
      assert.ok(ex.sem.clauses.length > 0);
    }
  });

  it('each example sem validates via validateSem', () => {
    for (const ex of NORMATIVE_EXAMPLES) {
      const result = validateSem(ex.sem);
      assert.ok(result.ok, `example ${ex.id} failed validateSem: ${result.errors.join('; ')}`);
    }
  });

  it('covers key semantic structures: preference, negation, conditional, temporal, multi-role, multi-clause, belief, hypothetical', () => {
    const kinds = new Set(NORMATIVE_EXAMPLES.map(e => e.sem.kind));
    for (const k of ['preference', 'safety_constraint', 'simple_fact', 'belief_state']) {
      assert.ok(kinds.has(k), `missing kind: ${k}`);
    }
    const hasNegated = NORMATIVE_EXAMPLES.some(e => e.sem.clauses.some(c => c.negated === true));
    assert.ok(hasNegated, 'no negated example');
    const hasCondition = NORMATIVE_EXAMPLES.some(e => e.sem.clauses.some(c => Array.isArray(c.conditions)));
    assert.ok(hasCondition, 'no conditional example');
    const hasTime = NORMATIVE_EXAMPLES.some(e => e.sem.clauses.some(c => c.time != null));
    assert.ok(hasTime, 'no temporal example');
    const hasHypothetical = NORMATIVE_EXAMPLES.some(e => e.sem.world === 'hypothetical');
    assert.ok(hasHypothetical, 'no hypothetical example');
  });
});

describe('JSON Schema file', () => {
  it('lunum-sem-v1.0.json exists and is valid JSON', async () => {
    const content = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    assert.strictEqual(schema.$id, 'https://openlunum.org/schemas/lunum-sem/1.0');
    assert.strictEqual(schema.title, 'Lunum-Sem 1.0');
  });

  it('schema requires schema, world, kind, clauses', async () => {
    const content = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    assert.deepStrictEqual(schema.required, ['schema', 'world', 'kind', 'clauses']);
  });

  it('schema accepts both 0.1-draft and 1.0 schema identifiers', async () => {
    const content = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    assert.ok(schema.properties.schema.enum.includes('lunum-sem/0.1-draft'));
    assert.ok(schema.properties.schema.enum.includes('lunum-sem/1.0'));
  });

  it('schema defines clause with predicate, roles, negated, modality, time, conditions, consequences', async () => {
    const content = await readFile(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const clause = schema.$defs.clause;
    assert.ok(clause);
    assert.ok(clause.properties.predicate);
    assert.ok(clause.properties.roles);
    assert.ok(clause.properties.negated);
    assert.ok(clause.properties.modality);
    assert.ok(clause.properties.time);
    assert.ok(clause.properties.conditions);
    assert.ok(clause.properties.consequences);
  });
});
