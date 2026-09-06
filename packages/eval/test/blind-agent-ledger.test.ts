import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBlindAgentLedger } from '../src/blind-agent-ledger.js';
import type { BlindSourceItem } from '../src/blind-agent-ledger.js';

const source: BlindSourceItem[] = [{ handle: 'opaque-a', sourceText: 'Publish the report.', sourceLanguage: 'en', kind: 'memory' }];
const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [{ predicate: 'publish', roles: { agent: { type: 'actor', id: 'owner' }, theme: { type: 'document', id: 'report' } }, negated: false }] };

test('blind ledger requires exact source coverage and identity-safe candidates', () => {
  const result = validateBlindAgentLedger(source, [{ handle: 'opaque-a', result: { candidateSem: sem } }]);
  assert.equal(result.valid, true);
  assert.equal(result.identityAvailable, 1);
  assert.equal(result.abstentions, 0);
});

test('blind ledger rejects missing, duplicate, and evaluator-private fields recursively', () => {
  const result = validateBlindAgentLedger(source, [
    { handle: 'opaque-a', result: { candidateSem: null, provenance: { nested: { goldLfp: 'secret' } } } },
    { handle: 'opaque-a', result: { candidateSem: null } },
    { handle: 'unknown', result: { candidateSem: null } },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('goldLfp')));
  assert.ok(result.errors.some((error) => error.includes('duplicate candidate handle')));
  assert.ok(result.errors.some((error) => error.includes('not in source manifest')));
});

test('blind ledger rejects unframed candidates instead of inflating identity coverage', () => {
  const unframed = { ...sem, clauses: [{ ...sem.clauses[0]!, predicate: 'share' }] } as never;
  const result = validateBlindAgentLedger(source, [{ handle: 'opaque-a', result: { candidateSem: unframed } }]);
  assert.equal(result.valid, false);
  assert.equal(result.identityAvailable, 0);
  assert.ok(result.errors.some((error) => error.includes('no exact semantic identity')));
});
