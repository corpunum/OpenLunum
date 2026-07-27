import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeSem, stableStringify } from '../src/canonicalize.js';
import { SEM_SCHEMA } from '../src/constants.js';
import type { LunumClause, LunumSem, LunumTerm } from '../src/types.js';

// ---------------------------------------------------------------------------
// R4.2 — property/fuzz tests for canonicalizeSem
//
// This file generates many random-but-valid LunumSem structures (seeded PRNG
// for reproducibility) and checks structural properties of canonicalization.
// It is a fail-closed *observation* suite: where current behavior diverges
// from a naive "everything should be order/representation independent"
// expectation, the test asserts the ACTUAL behavior and the divergence is
// called out in a comment, not silently patched over. Nothing in this file
// touches canonicalize.ts / fingerprint.ts.
// ---------------------------------------------------------------------------

const ITERATIONS = 250;

// Deterministic PRNG (mulberry32) so failures are reproducible without
// depending on a property-testing library (none is present in the repo).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed: number) {
  const next = mulberry32(seed);
  return {
    float: () => next(),
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    bool: (p = 0.5) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
    shuffle: <T,>(arr: T[]): T[] => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    }
  };
}

type Rng = ReturnType<typeof makeRng>;

const UNICODE_WORDS = [
  'user', 'χρήστης', 'usuario', 'ユーザー', 'пользователь', 'مستخدم', '用户',
  'café', 'naïve', 'Zürich', '🙂emoji', 'straße', 'İstanbul', 'coöperate'
];
const PREDICATES = ['prefer', 'enable', 'disable', 'require', 'deny', 'confirm', 'delete', 'below', 'above', 'notify'];
const ROLE_NAMES = ['agent', 'experiencer', 'theme', 'object', 'target', 'source', 'value', 'reason', 'location', 'recipient'];
const TERM_TYPES = ['actor', 'concept', 'quantity', 'metric', 'feature', 'event'];
const MODALITIES = ['obligation', 'permission', 'certainty', 'possibility', null];

function randomTermValue(rng: Rng): unknown {
  const kind = rng.int(0, 4);
  switch (kind) {
    case 0: return rng.pick(UNICODE_WORDS);
    case 1: return rng.int(-1000, 1000);
    case 2: return Math.round(rng.float() * 100000) / 100;
    case 3: return rng.bool();
    default: return null;
  }
}

function randomTerm(rng: Rng, depth: number): LunumTerm {
  // Occasionally produce a plain primitive term (roles allow LunumTerm = Primitive | object | array).
  if (rng.bool(0.15)) return randomTermValue(rng) as LunumTerm;
  if (depth > 0 && rng.bool(0.1)) {
    // Array-valued role: length + order must be preserved by canonicalization.
    const length = rng.int(2, 4);
    return Array.from({ length }, () => randomTerm(rng, depth - 1));
  }
  const term: Record<string, unknown> = {
    type: rng.pick(TERM_TYPES),
    id: `${rng.pick(UNICODE_WORDS)}_${rng.int(0, 999)}`
  };
  if (rng.bool(0.3)) term.value = randomTermValue(rng);
  if (rng.bool(0.2)) term.language = rng.pick(['en', 'el', 'es', 'ja']);
  return term as LunumTerm;
}

function randomRoles(rng: Rng, depth: number): Record<string, LunumTerm> {
  const roleCount = rng.int(1, 5);
  const names = rng.shuffle(ROLE_NAMES).slice(0, roleCount);
  const roles: Record<string, LunumTerm> = {};
  for (const name of names) roles[name] = randomTerm(rng, depth);
  return roles;
}

function randomClause(rng: Rng, depth: number): LunumClause {
  const clause: LunumClause = {
    predicate: rng.pick(PREDICATES),
    roles: randomRoles(rng, depth)
  };
  if (rng.bool(0.5)) clause.negated = rng.bool();
  if (rng.bool(0.4)) clause.modality = rng.pick(MODALITIES);
  if (rng.bool(0.3)) clause.time = randomTerm(rng, depth);
  if (depth > 0 && rng.bool(0.3)) {
    clause.conditions = Array.from({ length: rng.int(1, 2) }, () => randomClause(rng, depth - 1));
  }
  if (depth > 0 && rng.bool(0.2)) {
    clause.consequences = Array.from({ length: rng.int(1, 2) }, () => randomClause(rng, depth - 1));
  }
  return clause;
}

function randomSem(rng: Rng): LunumSem {
  const clauseCount = rng.int(1, 4);
  const depth = rng.int(0, 3);
  return {
    schema: SEM_SCHEMA,
    world: rng.pick(['real', 'fiction', 'tool', 'dream', 'belief', 'metaphor']),
    kind: rng.pick(['preference', 'instruction', 'safety_constraint', 'conditional_instruction']),
    clauses: Array.from({ length: clauseCount }, () => randomClause(rng, depth))
  };
}

function corpus(seed: number, count: number): LunumSem[] {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => randomSem(rng));
}

// ---------------------------------------------------------------------------
// Property 1 — canonicalization is idempotent
// ---------------------------------------------------------------------------

test(`property: canonicalization is idempotent over ${ITERATIONS} random sems`, () => {
  const sems = corpus(1, ITERATIONS);
  for (const sem of sems) {
    const once = stableStringify(canonicalizeSem(sem));
    const twice = stableStringify(canonicalizeSem(canonicalizeSem(sem)));
    assert.equal(twice, once, `idempotency failed for sem: ${stableStringify(sem)}`);
  }
});

// ---------------------------------------------------------------------------
// Property 2 — role-key ordering independence
// ---------------------------------------------------------------------------

test(`property: role-key insertion order does not affect canonical output over ${ITERATIONS} random sems`, () => {
  const rng = makeRng(2);
  for (let i = 0; i < ITERATIONS; i++) {
    const sem = randomSem(rng);
    const shuffled: LunumSem = {
      ...sem,
      clauses: sem.clauses.map((clause) => {
        const entries = rng.shuffle(Object.entries(clause.roles));
        const roles: Record<string, LunumTerm> = {};
        for (const [key, value] of entries) roles[key] = value;
        return { ...clause, roles };
      })
    };
    assert.equal(
      stableStringify(canonicalizeSem(shuffled)),
      stableStringify(canonicalizeSem(sem)),
      `role reordering changed canonical output for sem: ${stableStringify(sem)}`
    );
  }
});

// ---------------------------------------------------------------------------
// Property 3 — Unicode normalization
//
// FINDING: canonicalize.ts DOES normalize Unicode. normalizeText()/
// normalizeIdentifier() both call String.prototype.normalize('NFKC') before
// comparison, so text that differs only by normalization form (NFC vs NFD)
// canonicalizes identically. This property test asserts that actual,
// observed behavior (verified against dist output before writing this test).
// ---------------------------------------------------------------------------

test('property: text differing only by Unicode normalization form (NFC vs NFD) canonicalizes identically', () => {
  // "café" as precomposed (NFC) vs decomposed (NFD, e + combining acute U+0301).
  const nfc = 'café';
  const nfd = 'café';
  assert.notEqual(nfc, nfd, 'sanity: the two source strings must differ at the code-unit level');
  assert.equal(nfc.normalize('NFC'), nfd.normalize('NFC'), 'sanity: both normalize to the same NFC form');

  const base: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'x', value: '' } } }]
  };
  const semA: LunumSem = { ...base, clauses: [{ ...base.clauses[0]!, roles: { theme: { type: 'concept', id: 'x', value: nfc } } }] };
  const semB: LunumSem = { ...base, clauses: [{ ...base.clauses[0]!, roles: { theme: { type: 'concept', id: 'x', value: nfd } } }] };

  assert.equal(
    stableStringify(canonicalizeSem(semA)),
    stableStringify(canonicalizeSem(semB)),
    'FINDING CONFIRMED: NFC/NFD text should canonicalize identically because normalizeText() applies .normalize(\'NFKC\')'
  );

  // Property held across many random unicode-bearing sems (id fields go through normalizeIdentifier, also NFKC).
  const rng = makeRng(3);
  for (let i = 0; i < ITERATIONS; i++) {
    const word = rng.pick(UNICODE_WORDS);
    const sem: LunumSem = {
      schema: SEM_SCHEMA, world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: word, value: word } } }]
    };
    const nfdSem: LunumSem = {
      ...sem,
      clauses: [{ ...sem.clauses[0]!, roles: { theme: { type: 'concept', id: word.normalize('NFD'), value: word.normalize('NFD') } } }]
    };
    assert.equal(
      stableStringify(canonicalizeSem(sem)),
      stableStringify(canonicalizeSem(nfdSem)),
      `NFC/NFD divergence for word "${word}"`
    );
  }
});

// ---------------------------------------------------------------------------
// Property 4 — numeric representation
//
// FINDING: canonicalizeSem does not do any numeric formatting of its own —
// JSON.stringify(number) is used indirectly via stableStringify, and in
// JavaScript `20 === 20.0 === 2e1` are the exact same IEEE-754 value (there
// is no separate "float" literal type at the JS value level once parsed),
// so this property holds trivially by construction, not because
// canonicalize.ts does explicit numeric normalization. Negative zero (-0)
// also canonicalizes identically to 0 because JSON.stringify(-0) === '0'.
// ---------------------------------------------------------------------------

test('property: numerically-equal values (20, 20.0, 2e1) canonicalize identically', () => {
  const build = (value: number): LunumSem => ({
    schema: SEM_SCHEMA, world: 'real', kind: 'conditional_instruction',
    clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value } } }]
  });
  const out20 = stableStringify(canonicalizeSem(build(20)));
  const out20_0 = stableStringify(canonicalizeSem(build(20.0)));
  const out2e1 = stableStringify(canonicalizeSem(build(2e1)));
  assert.equal(out20, out20_0);
  assert.equal(out20, out2e1);
});

test('property: negative zero canonicalizes the same as positive zero', () => {
  const build = (value: number): LunumSem => ({
    schema: SEM_SCHEMA, world: 'real', kind: 'conditional_instruction',
    clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value } } }]
  });
  assert.equal(stableStringify(canonicalizeSem(build(-0))), stableStringify(canonicalizeSem(build(0))));
});

test('property: large numbers canonicalize deterministically over repeated calls', () => {
  const rng = makeRng(4);
  for (let i = 0; i < ITERATIONS; i++) {
    const value = rng.float() < 0.5 ? rng.int(-1e15, 1e15) : rng.float() * 1e18;
    const sem: LunumSem = {
      schema: SEM_SCHEMA, world: 'real', kind: 'conditional_instruction',
      clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value } } }]
    };
    const once = stableStringify(canonicalizeSem(sem));
    const twice = stableStringify(canonicalizeSem(sem));
    assert.equal(once, twice, `non-deterministic canonicalization for large number ${value}`);
  }
});

// ---------------------------------------------------------------------------
// Property 5 — null/undefined handling for optional fields
//
// Fixed for #369 (resolves #360): null/undefined are treated as "absent"
// consistently across all optional fields:
//   - clause.modality: omitted and explicit null/undefined all drop the
//     field from canonical output.
//   - clause.time: omitted, explicit null, and explicit undefined all drop
//     the field from canonical output — they are now equivalent.
//   - clause.roles[key]: an explicit `undefined` role value is now stripped
//     entirely (same as an absent key), while an explicit `null` role value
//     is still preserved as a distinguishable value (`roleName: null`).
// ---------------------------------------------------------------------------

test('property: omitted modality vs explicit null modality canonicalize identically', () => {
  const withNull: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {}, modality: null }]
  };
  const omitted: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {} }]
  };
  assert.equal(stableStringify(canonicalizeSem(withNull)), stableStringify(canonicalizeSem(omitted)));
});

test('FIXED (#369/#360): omitted clause.time vs explicit clause.time=null canonicalize identically', () => {
  const withNull: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {}, time: null }]
  };
  const omitted: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {} }]
  };
  const withNullOut = stableStringify(canonicalizeSem(withNull));
  const omittedOut = stableStringify(canonicalizeSem(omitted));
  assert.equal(withNullOut, omittedOut, 'clause.time: null must canonicalize identically to an omitted time key');
  assert.doesNotMatch(withNullOut, /"time"/);
  assert.doesNotMatch(omittedOut, /"time"/);
});

test('FIXED (#369/#360): omitted clause.time vs explicit clause.time=undefined canonicalize identically', () => {
  const withUndefined: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {}, time: undefined as unknown as LunumTerm }]
  };
  const omitted: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {} }]
  };
  assert.equal(stableStringify(canonicalizeSem(withUndefined)), stableStringify(canonicalizeSem(omitted)));
});

test('FIXED (#369/#360): omitted role key vs role value explicitly set to undefined canonicalize identically', () => {
  const explicitUndefined: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: { theme: undefined as unknown as LunumTerm } }]
  };
  const omitted: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {} }]
  };
  const explicitOut = stableStringify(canonicalizeSem(explicitUndefined));
  const omittedOut = stableStringify(canonicalizeSem(omitted));
  assert.equal(explicitOut, omittedOut, 'role value undefined must canonicalize identically to an absent role key');
  assert.match(explicitOut, /"roles":\{\}/);
  assert.match(omittedOut, /"roles":\{\}/);
});

test('role value explicitly null remains distinguishable and is preserved (not stripped)', () => {
  const explicitNull: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: { theme: null as unknown as LunumTerm } }]
  };
  const omitted: LunumSem = {
    schema: SEM_SCHEMA, world: 'real', kind: 'instruction',
    clauses: [{ predicate: 'enable', roles: {} }]
  };
  const explicitOut = stableStringify(canonicalizeSem(explicitNull));
  const omittedOut = stableStringify(canonicalizeSem(omitted));
  assert.notEqual(explicitOut, omittedOut, 'an explicit null role value is a real value and must remain distinguishable from an absent role key');
  assert.match(explicitOut, /"roles":\{"theme":null\}/);
  assert.match(omittedOut, /"roles":\{\}/);
});

// ---------------------------------------------------------------------------
// Property 6 — array cardinality (order IS preserved, unlike role keys)
// ---------------------------------------------------------------------------

test(`property: array-valued roles preserve length and order over ${ITERATIONS} random sems`, () => {
  const rng = makeRng(5);
  let sawOrderSensitiveCase = false;
  for (let i = 0; i < ITERATIONS; i++) {
    const length = rng.int(2, 6);
    // Use distinct ids so a positional difference always changes content.
    const items: LunumTerm[] = Array.from({ length }, (_, idx) => ({ type: 'concept', id: `item_${idx}_${rng.int(0, 999)}` }));
    const sem: LunumSem = {
      schema: SEM_SCHEMA, world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { theme: items } }]
    };
    const canonicalTheme = canonicalizeSem(sem).clauses[0]!.roles.theme as unknown[];
    assert.equal(canonicalTheme.length, length, 'array length must be preserved');
    // Order must be preserved element-for-element (ids are distinct, so this is a real check, not luck).
    assert.deepEqual(
      canonicalTheme.map((t) => (t as { id: string }).id),
      items.map((t) => (t as { id: string }).id).map((id) => id.toLocaleLowerCase('und')),
      'array element order must be preserved by canonicalization'
    );

    // Reversing the array must NOT canonicalize the same as the original
    // (unlike top-level role-key order, in-array order is meaningful).
    if (length > 1) {
      const reversedSem: LunumSem = { ...sem, clauses: [{ ...sem.clauses[0]!, roles: { theme: items.slice().reverse() } }] };
      const originalOut = stableStringify(canonicalizeSem(sem));
      const reversedOut = stableStringify(canonicalizeSem(reversedSem));
      assert.notEqual(originalOut, reversedOut, 'array reordering must change canonical output (arrays are order-sensitive, unlike role keys)');
      sawOrderSensitiveCase = true;
    }
  }
  assert.ok(sawOrderSensitiveCase, 'sanity: at least one iteration exercised the order-sensitivity check');
});
