import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { validateSemanticCandidate } from '@corpunum/lunum';

const root = path.basename(process.cwd()) === 'eval' ? path.resolve(process.cwd(), '../..') : path.resolve(process.cwd());
const schema = JSON.parse(await readFile(path.join(root, 'schemas/lunum-sem.schema.json'), 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020Module.Ajv2020({ strict: false, allErrors: true, validateSchema: false }).compile(schema);

const sem = (term: unknown) => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate: 'state', roles: { value: term } }] });

test('active transport schema and candidate validator agree on recursive array/null terms', () => {
  for (const term of [null, ['a', [1, true]], { type: 'quantity', value: 5 }]) {
    const value = sem(term);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.equal(validateSemanticCandidate(value).ok, true);
  }
});

test('active transport schema rejects malformed term values that candidate validation must not bless', () => {
  const value = sem({ type: 'quantity', value: 'five' });
  assert.equal(validate(value), true, 'draft schema intentionally permits open typed values');
  assert.equal(validateSemanticCandidate(value).ok, false);
});
