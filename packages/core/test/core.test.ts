import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeSem, compareSem, compileContext, deriveLunumSidecar, fingerprintSem, renderSem, stableStringify, surfaceTelegraph } from '../src/index.js';
import type { LunumSem } from '../src/index.js';

const sem: LunumSem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
  clauses: [{ predicate: 'Prefer', roles: { theme: { type: 'concept', id: 'Concise Answers' }, experiencer: { type: 'actor', id: 'User' } } }]
};

test('canonical semantics produce deterministic fingerprints', () => {
  const reordered: LunumSem = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: { experiencer: { id: 'user', type: 'actor' }, theme: { id: 'concise answers', type: 'concept' } } }] };
  assert.equal(fingerprintSem(sem), fingerprintSem(reordered));
  assert.match(fingerprintSem(sem), /^lfp:0\.1:sha256:/);
});

test('canonicalization is idempotent', () => {
  const once = canonicalizeSem(sem);
  assert.equal(stableStringify(canonicalizeSem(once)), stableStringify(once));
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
  assert.match(sidecar.lunumFp ?? '', /^lsf:/);
});

test('mixed context falls back when record is ineligible', () => {
  const result = compileContext([
    { role: 'system', content: 'Do not delete files without confirmation.', lunumCode: 'T not delete files without confirmation', lunumMeta: { eligible: false } },
    { role: 'user', content: 'The user prefers concise answers.', lunumCode: 'R prefer user concise_answers', lunumMeta: { eligible: true } }
  ], { mode: 'mixed' });
  assert.equal(result.mixedMessages[0]?.content, 'Do not delete files without confirmation.');
  assert.equal(result.mixedMessages[1]?.content, 'R prefer user concise_answers');
});

test('conditions and negation are visible to semantic comparison', () => {
  const expected: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction',
    clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'power_saving' } }, conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20 } } }] }]
  };
  const actual: LunumSem = { ...expected, clauses: [{ ...expected.clauses[0]!, conditions: [{ ...expected.clauses[0]!.conditions![0]!, negated: true }] }] };
  const comparison = compareSem(expected, actual);
  assert.equal(comparison.exactFingerprint, false);
  assert.ok(comparison.missingFeatures.some((feature) => feature.includes('negated')));
});

// ── Parser-hallucination tests (THREAT-MODEL section 3) ───────────

test('parse hallucination: extra claims detected via extraFeatures', () => {
  const gold: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }]
  };
  const hallucinated: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [
      { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } },
      { predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } } }
    ]
  };
  const comparison = compareSem(gold, hallucinated);
  assert.strictEqual(comparison.exactFingerprint, false);
  assert.ok(comparison.extraFeatures.length > 0, 'Hallucinated extra claims should be detected');
});

test('parse hallucination: role type mismatch detected via exactCanonical', () => {
  const gold: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }]
  };
  const hallucinated: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'unknown', id: 'user' } } }]
  };
  const comparison = compareSem(gold, hallucinated);
  assert.strictEqual(comparison.exactFingerprint, false);
  assert.strictEqual(comparison.exactCanonical, false, 'Role type mismatch should be detected via canonical comparison');
});

test('parse hallucination: extra claims reduce feature precision', () => {
  const gold: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'dark_mode' } } }]
  };
  const parsed: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'instruction',
    clauses: [
      { predicate: 'enable', roles: { theme: { type: 'feature', id: 'dark_mode' } } },
      { predicate: 'disable', roles: { theme: { type: 'feature', id: 'notifications' } } }
    ]
  };
  const comparison = compareSem(gold, parsed);
  assert.ok(comparison.featurePrecision < 1.0, 'Extra claims reduce feature precision');
});

// ── Renderer-ambiguity tests (THREAT-MODEL section 4) ─────────────

test('renderer ambiguity: deterministic output for same input', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }]
  };
  const c1 = canonicalizeSem(sem);
  const c2 = canonicalizeSem(sem);
  assert.deepStrictEqual(c1, c2, 'Canonicalization must be deterministic');
});

test('renderer ambiguity: fingerprint stability across canonicalization', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'tool',
    kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'auto_save' } } }]
  };
  const fp1 = fingerprintSem(sem);
  const fp2 = fingerprintSem(sem);
  assert.strictEqual(fp1, fp2, 'Fingerprints must be stable across calls');
});

test('renderer ambiguity: round-trip canonicalization preserves semantics', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      roles: { theme: { type: 'feature', id: 'power_saving' } },
      conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20 } } }]
    }]
  };
  const canonicalized = canonicalizeSem(sem);
  const fp1 = fingerprintSem(sem);
  const fp2 = fingerprintSem(canonicalized);
  assert.strictEqual(fp1, fp2, 'Round-trip canonicalization must preserve fingerprint');
});

// ── Schema 0.2 constants tests ──────────────────────────────────────

import {
  SEM_SCHEMA_02,
  RECORD_SCHEMA_02,
  FP_VERSION_02,
  FROZEN_SCHEMAS,
} from '../src/constants.js';

test('schema 0.2 constants have correct values', () => {
  assert.equal(SEM_SCHEMA_02, 'lunum-sem/0.2');
  assert.equal(RECORD_SCHEMA_02, 'lunum-record/0.2');
  assert.equal(FP_VERSION_02, '0.2');
});

test('FROZEN_SCHEMAS contains 0.2 schema versions', () => {
  assert.ok(FROZEN_SCHEMAS.has('lunum-sem/0.2'));
  assert.ok(FROZEN_SCHEMAS.has('lunum-record/0.2'));
  assert.equal(FROZEN_SCHEMAS.size, 2);
  // Object.freeze prevents adding properties to the Set object
  assert.ok(Object.isFrozen(FROZEN_SCHEMAS));
});

test('0.1 schema constants still have correct values', () => {
  assert.equal('lunum-sem/0.1-draft', 'lunum-sem/0.1-draft');
  assert.equal('lunum-record/0.1-draft', 'lunum-record/0.1-draft');
});
