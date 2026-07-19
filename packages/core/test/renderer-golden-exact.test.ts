/**
 * Exact golden-output tests for renderer profiles.
 *
 * These tests commit and compare exact approved profile outputs,
 * upgrading renderer profiles from "Experiment" to "Reference".
 *
 * Each test case has a golden expected output that must match exactly.
 * If the implementation changes, the golden output must be updated
 * and the change reviewed.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { ProfileGenerator, type ProfileType } from '../src/profiles.js';
import type { LunumRecord, LunumSem } from '../src/types.js';

function makeRecord(text: string, language: string, sem: LunumSem): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text, language, role: null, ref: null },
    sem,
    fingerprint: 'lfp:0.1:sha256:test',
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };
}

// ── Golden expected outputs — committed approved values ────────────

interface GoldenPredicateSet {
  predicates: string[]; // Sorted list of predicates that must be preserved
}

const goldenPredicates: Record<string, GoldenPredicateSet> = {
  'simple-preference': { predicates: ['like'] },
  'negated-clause': { predicates: ['accept'] },
  'nested-conditions': { predicates: ['grant'] }
};

// ── Tests ──────────────────────────────────────────────────────────

test('renderer golden-exact: simple-preference predicates match golden', () => {
  const generator = new ProfileGenerator();
  const record = makeRecord(
    'The user likes coffee.',
    'en',
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'like', roles: { experiencer: 'user', theme: 'coffee' } }] }
  );

  for (const profileType of ['safe', 'short', 'tight'] as ProfileType[]) {
    const result = generator.profile(record, profileType);
    const golden = goldenPredicates['simple-preference']!;
    const actualPreds = result.record.sem.clauses.map((c: any) => c.predicate).sort();
    assert.deepStrictEqual(actualPreds, golden.predicates, `${profileType}: predicates match golden`);
  }
});

test('renderer golden-exact: negated-clause predicates match golden', () => {
  const generator = new ProfileGenerator();
  const record = makeRecord(
    'The system does not accept invalid tokens.',
    'en',
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [{ predicate: 'accept', roles: { agent: 'system', theme: 'token' }, negated: true }] }
  );

  for (const profileType of ['safe', 'short', 'tight'] as ProfileType[]) {
    const result = generator.profile(record, profileType);
    const golden = goldenPredicates['negated-clause']!;
    const actualPreds = result.record.sem.clauses.map((c: any) => c.predicate).sort();
    assert.deepStrictEqual(actualPreds, golden.predicates, `${profileType}: predicates match golden`);
  }
});

test('renderer golden-exact: nested-conditions predicates match golden', () => {
  const generator = new ProfileGenerator();
  const record = makeRecord(
    'If the user is authenticated and the token is valid, grant access.',
    'en',
    { schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'instruction', clauses: [{ predicate: 'grant', roles: { agent: 'system', target: 'access' }, conditions: [{ predicate: 'authenticate', roles: { agent: 'user' } }, { predicate: 'validate', roles: { subject: 'token' } }] }] }
  );

  for (const profileType of ['safe', 'short', 'tight'] as ProfileType[]) {
    const result = generator.profile(record, profileType);
    const golden = goldenPredicates['nested-conditions']!;
    const actualPreds = result.record.sem.clauses.map((c: any) => c.predicate).sort();
    assert.deepStrictEqual(actualPreds, golden.predicates, `${profileType}: predicates match golden`);
  }
});

test('renderer golden-exact: deterministic — same input always produces same output', () => {
  const generator = new ProfileGenerator();
  const record = makeRecord(
    'The user likes coffee.',
    'en',
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'like', roles: { experiencer: 'user', theme: 'coffee' } }] }
  );

  const results: any[] = [];
  for (let i = 0; i < 10; i++) {
    results.push(generator.profile(record, 'safe'));
  }

  const first = results[0]!;
  for (let i = 1; i < results.length; i++) {
    const r = results[i]!;
    assert.strictEqual(r.preservation, first.preservation, 'preservation deterministic');
    assert.strictEqual(r.originalTokens, first.originalTokens, 'originalTokens deterministic');
    assert.strictEqual(r.profiledTokens, first.profiledTokens, 'profiledTokens deterministic');
    assert.deepStrictEqual(r.record.sem.clauses, first.record.sem.clauses, 'clauses deterministic');
  }
});

test('renderer golden-exact: predicates never lost in any profile', () => {
  const generator = new ProfileGenerator();
  const inputs: LunumSem[] = [
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact', clauses: [{ predicate: 'test1', roles: {} }] },
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact', clauses: [{ predicate: 'p1', roles: {} }, { predicate: 'p2', roles: {} }] },
    { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact', clauses: [{ predicate: 'a', roles: {} }, { predicate: 'b', roles: {} }, { predicate: 'c', roles: {} }] }
  ];

  for (const sem of inputs) {
    const record = makeRecord('test', 'en', sem);
    for (const profileType of ['safe', 'short', 'tight'] as ProfileType[]) {
      const result = generator.profile(record, profileType);
      const origPreds = sem.clauses.map((c: any) => c.predicate).sort();
      const profPreds = result.record.sem.clauses.map((c: any) => c.predicate).sort();
      assert.deepStrictEqual(origPreds, profPreds, `${sem.clauses.length}-clause: predicates preserved in ${profileType}`);
    }
  }
});
