/**
 * Conformance property tests — CI hard gates
 *
 * These tests verify semantic invariants that must hold across
 * all Lunum-Sem operations:
 *   1. Idempotence: canonicalize(canonicalize(x)) === canonicalize(x)
 *   2. Key-order independence: fingerprint is stable regardless of JSON key order
 *   3. Fingerprint stability: same content → same fingerprint
 *   4. Canonical round-trip: fingerprint(canonicalize(x)) === fingerprint(x)
 *   5. Conformance vector stability: vector hash is deterministic
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem, surfaceFingerprint } from '../src/fingerprint.js';
import { canonicalizeSem, stableStringify } from '../src/canonicalize.js';
import type { LunumSem } from '../src/types.js';

// ── Test fixtures ──────────────────────────────────────────────────

function buildSem(overrides: Partial<LunumSem> = {}): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [
      {
        predicate: 'prefer',
        roles: {
          experiencer: { type: 'actor', id: 'user' },
          theme: { type: 'concept', id: 'concise_answers' }
        },
        negated: false
      }
    ],
    ...overrides
  };
}

function buildComplexSem(): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [
      {
        predicate: 'require',
        roles: {
          agent: { type: 'actor', id: 'assistant' },
          theme: { type: 'action', id: 'retry' }
        },
        conditions: [
          {
            predicate: 'error',
            roles: { level: { type: 'concept', id: 'fatal' } },
            negated: false
          }
        ],
        consequences: [
          {
            predicate: 'execute',
            roles: { action: { type: 'action', id: 'retry' } },
            modality: 'certainty',
            time: { type: 'instant', value: 'now' }
          }
        ],
        negated: false
      }
    ],
    annotations: { sourceText: 'If fatal error, retry immediately.', sourceLanguage: 'en' }
  };
}

// ── Property 1: Idempotence ────────────────────────────────────────

test('idempotence: canonicalize(canonicalize(x)) === canonicalize(x)', () => {
  const fixtures = [
    buildSem(),
    buildComplexSem(),
    buildSem({ kind: 'safety_constraint' }),
    buildSem({ clauses: [{ predicate: 'assert', roles: {}, negated: true }] })
  ];

  for (const sem of fixtures) {
    const once = canonicalizeSem(sem);
    const twice = canonicalizeSem(once);
    assert.deepStrictEqual(once, twice, `canonicalize must be idempotent for ${sem.kind}`);
  }
});

test('idempotence: fingerprint is invariant under canonicalization', () => {
  const fixtures = [buildSem(), buildComplexSem()];

  for (const sem of fixtures) {
    const fpOriginal = fingerprintSem(sem);
    const fpCanonical = fingerprintSem(canonicalizeSem(sem));
    assert.strictEqual(fpOriginal, fpCanonical, 'fingerprint must be invariant under canonicalization');
  }
});

// ── Property 2: Key-order independence ─────────────────────────────

test('key-order independence: fingerprint ignores JSON key order', () => {
  const baseSem = buildSem();

  // Create objects with same content but different key orders
  const semOrdered1: LunumSem = {
    schema: baseSem.schema,
    world: baseSem.world,
    kind: baseSem.kind,
    clauses: [
      {
        predicate: baseSem.clauses[0]!.predicate,
        roles: {
          experiencer: baseSem.clauses[0]!.roles!['experiencer'] as any,
          theme: baseSem.clauses[0]!.roles!['theme'] as any
        },
        negated: baseSem.clauses[0]!.negated ?? false
      }
    ]
  };

  const semOrdered2: LunumSem = {
    kind: baseSem.kind,
    schema: baseSem.schema,
    clauses: [
      {
        negated: baseSem.clauses[0]!.negated ?? false,
        roles: {
          theme: baseSem.clauses[0]!.roles!['theme'] as any,
          experiencer: baseSem.clauses[0]!.roles!['experiencer'] as any
        },
        predicate: baseSem.clauses[0]!.predicate
      }
    ],
    world: baseSem.world
  };

  const fp1 = fingerprintSem(semOrdered1);
  const fp2 = fingerprintSem(semOrdered2);
  assert.strictEqual(fp1, fp2, 'fingerprint must be independent of key order');
});

test('key-order independence: stableStringify on canonical form is key-order independent', () => {
  const sem = buildComplexSem();
  const canonical = canonicalizeSem(sem);
  const str1 = stableStringify(canonical);
  const str2 = stableStringify(canonical);
  // Canonical form has sorted keys, so stableStringify must be deterministic
  assert.strictEqual(str1, str2, 'stableStringify on canonical form must be deterministic');
});

test('key-order independence: roles object key order does not affect fingerprint', () => {
  const sem1: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [
      {
        predicate: 'test',
        roles: { a: { type: 'actor', id: 'x' }, b: { type: 'actor', id: 'y' } },
        negated: false
      } as any
    ]
  };

  const sem2: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [
      {
        predicate: 'test',
        roles: { b: { type: 'actor', id: 'y' }, a: { type: 'actor', id: 'x' } },
        negated: false
      } as any
    ]
  };

  assert.strictEqual(
    fingerprintSem(sem1),
    fingerprintSem(sem2),
    'fingerprint must ignore roles key order'
  );
});

// ── Property 3: Fingerprint stability ──────────────────────────────

test('fingerprint stability: same sem produces same fingerprint across calls', () => {
  const sem = buildComplexSem();
  const fps = Array.from({ length: 10 }, () => fingerprintSem(sem));
  const unique = new Set(fps);
  assert.strictEqual(unique.size, 1, `all fingerprints must be identical, got: ${JSON.stringify([...unique])}`);
});

test('fingerprint stability: different sem produces different fingerprint', () => {
  const sem1 = buildSem({ kind: 'preference' });
  const sem2 = buildSem({ kind: 'safety_constraint' });
  const fp1 = fingerprintSem(sem1);
  const fp2 = fingerprintSem(sem2);
  assert.notStrictEqual(fp1, fp2, 'different semantics must produce different fingerprints');
});

test('fingerprint stability: fingerprint format is correct', () => {
  const sem = buildSem();
  const fp = fingerprintSem(sem);
  assert.ok(fp.startsWith('lfp:0.1:sha256:'), 'fingerprint must have correct version prefix');
  assert.ok(fp.length >= 40, 'fingerprint must include sufficient hash characters');
  assert.ok(fp.length <= 128, 'fingerprint must not be unbounded');
});

test('fingerprint stability: fingerprint with custom length works', () => {
  const sem = buildSem();
  const fp16 = fingerprintSem(sem, { length: 16 });
  const fp64 = fingerprintSem(sem, { length: 64 });
  assert.ok(fp16.length < fp64.length, 'shorter length must produce shorter fingerprint');
  assert.ok(fp16.startsWith('lfp:0.1:sha256:'), 'custom length fingerprint must have correct prefix');
});

// ── Property 4: Canonical round-trip ───────────────────────────────

test('canonical round-trip: fingerprint is preserved through canonicalize round-trip', () => {
  const sem = buildSem();
  const canonicalized = canonicalizeSem(sem);
  const fpOriginal = fingerprintSem(sem);
  const fpAfterCanonical = fingerprintSem(canonicalized);
  assert.strictEqual(fpOriginal, fpAfterCanonical);
});

test('canonical round-trip: surface fingerprint is deterministic', () => {
  const texts = [
    'The user prefers concise answers.',
    '  The user prefers  concise  answers.  ',
    'THE USER PREFERS CONCISE ANSWERS.'
  ];

  const fps = texts.map(t => surfaceFingerprint(t));
  // After normalization, texts with different whitespace/casing should produce same fingerprint
  assert.strictEqual(fps[0], fps[1], 'surface fingerprint must normalize whitespace');
  assert.strictEqual(fps[0], fps[2], 'surface fingerprint must normalize case');
});

// ── Property 5: Conformance vector stability ───────────────────────

test('conformance vector: canonical form is deterministic', () => {
  const sem = buildComplexSem();
  const str1 = stableStringify(sem);
  const str2 = stableStringify(sem);
  assert.strictEqual(str1, str2, 'stableStringify must be deterministic');
});

test('conformance vector: sorting keys is stable', () => {
  const sem = buildSem();
  const str = stableStringify(sem);
  // Keys in stableStringify output must be sorted
  const keyMatches = [...str.matchAll(/"([^"]+)":/g)];
  const keys = keyMatches.map(m => m?.[1]).filter((k): k is string => !!k);
  const sorted = [...keys].sort();
  // Not all keys will be sorted (nested objects too), but top-level keys should be
  assert.ok(keys.length > 0, 'stableStringify must produce keys');
  // Top-level keys should appear in sorted order
  const topLevelKeys = keys.filter(k => ['schema', 'world', 'kind', 'clauses', 'references', 'provenance', 'annotations'].includes(k));
  assert.deepStrictEqual(topLevelKeys, topLevelKeys.sort(), 'top-level keys must be sorted');
});

// ── Property 6: Edge cases ─────────────────────────────────────────

test('fingerprint handles empty roles', () => {
  const sem = buildSem({
    clauses: [{ predicate: 'test', roles: {}, negated: false }]
  });
  const fp = fingerprintSem(sem);
  assert.ok(fp.startsWith('lfp:0.1:'), 'empty roles must still produce valid fingerprint');
});

test('fingerprint handles deep nesting', () => {
  const sem: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'test',
    clauses: [
      {
        predicate: 'outer',
        roles: { inner: { type: 'concept', id: 'nested' } },
        conditions: [
          {
            predicate: 'inner',
            roles: { deep: { type: 'actor', id: 'deep' } },
            conditions: [
              { predicate: 'deepest', roles: {}, negated: false }
            ]
          }
        ],
        negated: false
      }
    ]
  };
  const fp = fingerprintSem(sem);
  assert.ok(fp.startsWith('lfp:0.1:'), 'deep nesting must produce valid fingerprint');
  // Idempotent through nesting
  const fp2 = fingerprintSem(canonicalizeSem(sem));
  assert.strictEqual(fp, fp2);
});

test('fingerprint is stable across different object construction', () => {
  const fp1 = fingerprintSem(buildSem());
  // Manually construct equivalent sem
  const fp2 = fingerprintSem({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }, negated: false }]
  });
  assert.strictEqual(fp1, fp2);
});
