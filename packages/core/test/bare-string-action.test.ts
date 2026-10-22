import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateSem } from '../src/agent-builder.js';
import { getExtractionContract, submitCandidate } from '../src/agent-native.js';

// lunum-agent/0.21, A3 step 1 (experiments/coverage-a3-v1, experiments/abstention-shapes-v1).
const build = (roles: Record<string, unknown>, predicate = 'assert') =>
  buildCandidateSem({ world: 'real', kind: 'simple_fact', predicate, roles } as never).sem;

test('a bare string on assert.action becomes a text term, underscores read as spaces', () => {
  const sem = build({ subject: { type: 'text', value: 'Tom' }, action: 'listened_to', object: { type: 'text', value: 'Mary' } });
  assert.deepEqual(sem.clauses[0]!.roles.action, { type: 'text', value: 'listened to' });
  const accepted = submitCandidate({ sourceText: 'Tom listened to Mary.', sourceLanguage: 'en', candidateSem: sem, provenance: { extractorType: 'agent' } });
  assert.ok(accepted.semanticFingerprint, 'the A0 example gets an identity');
});

test('the string form and the text-term form build the same Sem and identity', () => {
  const a = build({ subject: { type: 'text', value: 'Tom' }, action: 'listened to', object: { type: 'text', value: 'Mary' } });
  const b = build({ subject: { type: 'text', value: 'Tom' }, action: { type: 'text', value: 'listened to' }, object: { type: 'text', value: 'Mary' } });
  assert.deepEqual(a, b);
  const fp = (sem: typeof a) => submitCandidate({ sourceText: 'Tom listened to Mary.', sourceLanguage: 'en', candidateSem: sem, provenance: { extractorType: 'agent' } }).semanticFingerprint;
  assert.equal(fp(a), fp(b));
});

test('a string action on a predicate-vocabulary role (prohibit) is still a predicate symbol', () => {
  const sem = build({ agent: { type: 'actor', value: 'admin' }, recipient: { type: 'actor', value: 'guest' }, action: 'delete', theme: { type: 'text', value: 'logs' } }, 'prohibit');
  assert.equal(sem.clauses[0]!.roles.action, 'delete');
});

test('the contract is 0.21 and its assert line says a plain string becomes a text term', () => {
  const contract = getExtractionContract();
  assert.equal(contract.contractVersion, 'lunum-agent/0.22');
  assert.match(JSON.stringify(contract), /action: the verb phrase as written, not only is\/are, as a text term/u);
});
