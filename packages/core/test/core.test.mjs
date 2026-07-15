import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeSem, fingerprintSem, renderSem, deriveLunumSidecar, surfaceTelegraph, compileContext } from '../src/index.mjs';

const sem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
  clauses: [{ predicate: 'Prefer', roles: { theme: { type: 'concept', id: 'Concise Answers' }, experiencer: { type: 'actor', id: 'User' } } }]
};

test('canonical semantics produce deterministic fingerprints', () => {
  const a = fingerprintSem(sem);
  const b = fingerprintSem({ ...sem, clauses: [{ ...sem.clauses[0], roles: { experiencer: { id: 'user', type: 'actor' }, theme: { id: 'concise answers', type: 'concept' } } }] });
  assert.equal(a, b);
  assert.match(a, /^lfp:0\.1:sha256:/);
});

test('reference renderer follows world and preferred role order', () => {
  assert.equal(renderSem(sem).code, 'R prefer user concise_answers');
});

test('surface telegraph preserves non-Latin text instead of deleting it', () => {
  const code = surfaceTelegraph('Ο χρήστης προτιμά σύντομες απαντήσεις.');
  assert.match(code, /χρήστης/u);
  assert.match(code, /σύντομες/u);
});

test('surface heuristic is honestly marked non-semantic and ineligible', () => {
  const sidecar = deriveLunumSidecar({ role: 'user', content: 'The user prefers concise answers.' });
  assert.equal(sidecar.lunumMeta.semantic, false);
  assert.equal(sidecar.lunumMeta.eligible, false);
  assert.match(sidecar.lunumFp, /^lsf:/);
});

test('mixed context falls back when record is ineligible', () => {
  const result = compileContext([
    { role:'system', content:'Do not delete files without confirmation.', lunumCode:'T not delete files without confirmation', lunumMeta:{eligible:false} },
    { role:'user', content:'The user prefers concise answers.', lunumCode:'R prefer user concise_answers', lunumMeta:{eligible:true} }
  ], { mode:'mixed' });
  assert.equal(result.mixedMessages[0].content, 'Do not delete files without confirmation.');
  assert.equal(result.mixedMessages[1].content, 'R prefer user concise_answers');
});

test('canonicalizer keeps source annotations separate from semantics', () => {
  const canonical = canonicalizeSem({ ...sem, annotations: { note: '  Keep exact evidence  ' } });
  assert.equal(canonical.annotations.note, 'Keep exact evidence');
});
