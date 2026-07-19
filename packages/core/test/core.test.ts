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

// ── Semantic-contract type tests (v02 migration) ────────────────────

import {
  type LunumSemSchema01,
  type LunumSemSchema02,
  type LunumRecordSchema01,
  type LunumRecordSchema02,
  type v01Clause,
  type v02Clause,
} from '../src/types-schema.js';
import { SEM_SCHEMA, RECORD_SCHEMA, FP_VERSION } from '../src/constants.js';

test('0.1 semantic schema type accepts standard record', () => {
  const schema: LunumSemSchema01 = {
    schema: SEM_SCHEMA,
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'Prefer', roles: { experiencer: { id: 'user', type: 'actor' }, theme: { id: 'feature', type: 'concept' } } }]
  };
  assert.equal(schema.schema, SEM_SCHEMA);
  assert.ok(Array.isArray(schema.clauses));
  assert.equal(schema.clauses.length, 1);
});

test('0.2 semantic schema type accepts standard record', () => {
  const schema: LunumSemSchema02 = {
    schema: SEM_SCHEMA_02,
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'Prefer', roles: { experiencer: { id: 'user', type: 'actor' }, theme: { id: 'feature', type: 'concept' } } }]
  };
  assert.equal(schema.schema, SEM_SCHEMA_02);
  assert.ok(Array.isArray(schema.clauses));
});

test('0.1 record schema type with nested structure', () => {
  const record: LunumRecordSchema01 = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Test record source' },
    sem: {
      schema: SEM_SCHEMA,
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'Prefer', roles: { experiencer: { id: 'user', type: 'actor' } } }]
    },
    fingerprint: `lfp:${FP_VERSION}:sha256:abc123`,
    renderings: { 'generic-en-pivot/0.1': { code: 'R prefer user' } },
    policy: { eligible: true, risk: 'low', confidence: 0.95 }
  };
  assert.equal(record.source.text, 'Test record source');
  assert.equal(record.sem.schema, SEM_SCHEMA);
  assert.match(record.fingerprint, /^lfp:0\.1:sha256:/);
});

test('0.2 record schema type with nested structure', () => {
  const record: LunumRecordSchema02 = {
    recordVersion: 'lunum-record/0.2',
    source: { text: 'Test record source', language: 'en', role: 'user' },
    sem: {
      schema: SEM_SCHEMA_02,
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'Prefer', roles: { experiencer: { id: 'user', type: 'actor' } } }],
      provenance: { source: 'test', author: 'agent', timestamp: '2026-01-01T00:00:00Z' }
    },
    fingerprint: `lfp:${FP_VERSION_02}:sha256:def456`,
    renderings: {},
    policy: { eligible: true, risk: 'low', confidence: 0.95 }
  };
  assert.equal(record.recordVersion, 'lunum-record/0.2');
  assert.equal(record.sem.schema, SEM_SCHEMA_02);
  assert.match(record.fingerprint, /^lfp:0\.2:sha256:/);
});

test('v01Clause type supports negation and modality', () => {
  const clause: v01Clause = {
    predicate: 'should',
    roles: { agent: { id: 'system', type: 'actor' } },
    negated: false,
    modality: null,
    conditions: [{ predicate: 'when', roles: { subject: { id: 'condition', type: 'concept' } } }]
  };
  assert.equal(clause.negated, false);
  assert.ok(Array.isArray(clause.conditions));
});

test('v02Clause type supports modality enum values', () => {
  const clause: v02Clause = {
    predicate: 'require',
    roles: { agent: { id: 'system', type: 'actor' } },
    modality: 'obligation',
    conditions: [{ predicate: 'when', roles: { subject: { id: 'condition', type: 'concept' } } }],
    consequences: [{ predicate: 'then', roles: { theme: { id: 'result', type: 'concept' } } }]
  };
  assert.equal(clause.modality, 'obligation');
  assert.ok(Array.isArray(clause.conditions));
  assert.ok(Array.isArray(clause.consequences));
});

test('FROZEN_SCHEMAS matches 0.2 schema constant values', () => {
  assert.ok(FROZEN_SCHEMAS.has(SEM_SCHEMA_02));
  assert.ok(FROZEN_SCHEMAS.has(RECORD_SCHEMA_02));
  assert.equal(FROZEN_SCHEMAS.size, 2);
});

test('0.1 and 0.2 schema versions are distinct', () => {
  assert.notEqual(SEM_SCHEMA, SEM_SCHEMA_02);
  assert.notEqual(RECORD_SCHEMA, RECORD_SCHEMA_02);
  assert.notEqual(FP_VERSION, FP_VERSION_02);
  assert.ok(!SEM_SCHEMA.includes('0.2'));
  assert.ok(SEM_SCHEMA_02.includes('0.2'));
});

test('clause types preserve predicate and roles structure', () => {
  const v01: v01Clause = { predicate: 'test', roles: { agent: { type: 'actor', id: 'a' } } };
  const v02: v02Clause = { predicate: 'test', roles: { agent: { type: 'actor', id: 'a' } } };
  assert.equal(v01.predicate, 'test');
  assert.equal(v02.predicate, 'test');
  assert.equal(typeof v01.roles, 'object');
  assert.equal(typeof v02.roles, 'object');
});
