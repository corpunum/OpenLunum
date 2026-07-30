import test from 'node:test';
import assert from 'node:assert/strict';
import type { LunumSem } from '@corpunum/lunum';
import {
  evaluateRetentionGates,
  scoreExactPreservation,
  scoreFeaturePreservation,
  scoreLiteralPreservation,
  scoreRolePreservation,
  scoreNegationPreservation,
  scoreModalityPreservation,
  getRetentionGateNames,
  getGateThreshold,
  type RetentionGateName
} from '../src/retention-gates.js';

// ── Test fixtures ──────────────────────────────────────────────

function makeSem(overrides: Partial<LunumSem> = {}): LunumSem {
  return {
    schema: 'openlunum-sem/0.1',
    world: 'default',
    kind: 'assertion',
    clauses: [
      {
        predicate: 'eat',
        negated: false,
        roles: {
          agent: 'John',
          patient: 'apple'
        }
      }
    ],
    ...overrides
  };
}

// ── Exact preservation tests ───────────────────────────────────

test('exact preservation — byte-identical Sem scores 1.0', () => {
  const gold = makeSem();
  const roundTrip = makeSem();

  const score = scoreExactPreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('exact preservation — different clause scores 0.0', () => {
  const gold = makeSem();
  const roundTrip = makeSem({
    clauses: [
      {
        predicate: 'drink',
        negated: false,
        roles: { agent: 'John', patient: 'water' }
      }
    ]
  });

  const score = scoreExactPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.0);
});

test('exact preservation — missing role scores 0.0', () => {
  const gold = makeSem();
  const roundTrip = makeSem({
    clauses: [
      {
        predicate: 'eat',
        negated: false,
        roles: { agent: 'John' }
      }
    ]
  });

  const score = scoreExactPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.0);
});

// ── Feature preservation tests ─────────────────────────────────

test('feature preservation — identical features score 1.0', () => {
  const gold = makeSem();
  const roundTrip = makeSem();

  const score = scoreFeaturePreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('feature preservation — missing predicate scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'A', patient: 'B' } },
      { predicate: 'drink', negated: false, roles: { agent: 'A', patient: 'C' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'A', patient: 'B' } }
    ]
  });

  const score = scoreFeaturePreservation(gold, roundTrip);
  assert(score < 1.0);
  assert(score > 0);
});

test('feature preservation — empty semantics score 1.0', () => {
  const gold = makeSem({ clauses: [] });
  const roundTrip = makeSem({ clauses: [] });

  const score = scoreFeaturePreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

// ── Literal preservation tests ─────────────────────────────────

test('literal preservation — all literals found score 1.0', () => {
  const score = scoreLiteralPreservation(
    ['apple', 'John'],
    'John eats an apple',
    'He ate it'
  );
  assert.strictEqual(score, 1.0);
});

test('literal preservation — partial literals score < 1.0', () => {
  const score = scoreLiteralPreservation(
    ['apple', 'banana'],
    'He ate an apple',
    'He drank water'
  );
  assert.strictEqual(score, 0.5);
});

test('literal preservation — no literals score 1.0', () => {
  const score = scoreLiteralPreservation(
    [],
    'He ate food',
    'He drank water'
  );
  assert.strictEqual(score, 1.0);
});

test('literal preservation — case-insensitive matching', () => {
  const score = scoreLiteralPreservation(
    ['Apple', 'JOHN'],
    'apple and john',
    'Ate the food'
  );
  assert.strictEqual(score, 1.0);
});

// ── Role preservation tests ────────────────────────────────────

test('role preservation — identical roles score 1.0', () => {
  const gold = makeSem();
  const roundTrip = makeSem();

  const score = scoreRolePreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('role preservation — missing role scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple', instrument: 'fork' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreRolePreservation(gold, roundTrip);
  assert.strictEqual(score, 2 / 3); // 2 of 3 roles match
});

test('role preservation — empty clauses score 1.0', () => {
  const gold = makeSem({ clauses: [] });
  const roundTrip = makeSem({ clauses: [] });

  const score = scoreRolePreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('role preservation — fewer round-trip clauses scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', negated: false, roles: { agent: 'Mary', patient: 'water' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreRolePreservation(gold, roundTrip);
  // 2 roles matched + 2 roles lost = 2/4 = 0.5
  assert.strictEqual(score, 0.5);
});

// ── Negation preservation tests ────────────────────────────────

test('negation preservation — identical negations score 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: true, roles: { agent: 'John', patient: 'apple' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: true, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreNegationPreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('negation preservation — lost negation scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: true, roles: { agent: 'John', patient: 'apple' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreNegationPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.0);
});

test('negation preservation — mixed negations score correctly', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: true, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', negated: true, roles: { agent: 'Mary', patient: 'water' } },
      { predicate: 'sleep', negated: false, roles: { agent: 'Bob' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: true, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', negated: false, roles: { agent: 'Mary', patient: 'water' } },
      { predicate: 'sleep', negated: false, roles: { agent: 'Bob' } }
    ]
  });

  const score = scoreNegationPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.5); // 1 of 2 negations preserved
});

test('negation preservation — empty clauses score 1.0', () => {
  const gold = makeSem({ clauses: [] });
  const roundTrip = makeSem({ clauses: [] });

  const score = scoreNegationPreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

// ── Modality preservation tests ────────────────────────────────

test('modality preservation — identical modalities score 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'must', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'must', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreModalityPreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

test('modality preservation — lost modality scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'should', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreModalityPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.0);
});

test('modality preservation — changed modality scores < 1.0', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'must', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'should', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const score = scoreModalityPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.0);
});

test('modality preservation — mixed modalities score correctly', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'must', negated: false, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', modality: 'should', negated: false, roles: { agent: 'Mary', patient: 'water' } },
      { predicate: 'sleep', negated: false, roles: { agent: 'Bob' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', modality: 'must', negated: false, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', modality: 'may', negated: false, roles: { agent: 'Mary', patient: 'water' } },
      { predicate: 'sleep', negated: false, roles: { agent: 'Bob' } }
    ]
  });

  const score = scoreModalityPreservation(gold, roundTrip);
  assert.strictEqual(score, 0.5); // 1 of 2 modalities preserved
});

test('modality preservation — empty clauses score 1.0', () => {
  const gold = makeSem({ clauses: [] });
  const roundTrip = makeSem({ clauses: [] });

  const score = scoreModalityPreservation(gold, roundTrip);
  assert.strictEqual(score, 1.0);
});

// ── Full gate evaluation tests ─────────────────────────────────

test('retention gates — perfect preservation passes all gates', () => {
  const gold = makeSem();
  const roundTrip = makeSem();

  const result = evaluateRetentionGates(
    gold,
    roundTrip,
    'John eats an apple',
    'John eats an apple',
    ['apple']
  );

  assert.strictEqual(result.overallPassed, true);
  assert.strictEqual(result.totalScore, 1.0);
  for (const [gateName, score] of Object.entries(result.gateScores)) {
    assert.strictEqual(score.passed, true, `${gateName} should pass`);
  }
});

test('retention gates — degraded semantics fails some gates', () => {
  const gold = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } },
      { predicate: 'drink', negated: false, roles: { agent: 'Mary', patient: 'water' } }
    ]
  });
  const roundTrip = makeSem({
    clauses: [
      { predicate: 'eat', negated: false, roles: { agent: 'John', patient: 'apple' } }
    ]
  });

  const result = evaluateRetentionGates(
    gold,
    roundTrip,
    'John eats an apple then Mary drinks water',
    'John eats an apple',
    []
  );

  assert.strictEqual(result.gateScores['exact-preservation']!.passed, false);
  assert.strictEqual(result.gateScores['feature-preservation']!.passed, false);
  assert.strictEqual(result.overallPassed, false);
});

test('retention gates — all gates defined and accessible', () => {
  const gateNames = getRetentionGateNames();

  assert.strictEqual(gateNames.length, 6);
  assert.deepStrictEqual(gateNames, [
    'exact-preservation',
    'feature-preservation',
    'literal-preservation',
    'role-preservation',
    'negation-preservation',
    'modality-preservation'
  ]);

  for (const gateName of gateNames) {
    const threshold = getGateThreshold(gateName);
    assert(threshold >= 0 && threshold <= 1, `${gateName} threshold must be 0-1`);
  }
});

test('retention gates — correct thresholds for each gate', () => {
  assert.strictEqual(getGateThreshold('exact-preservation'), 1.0);
  assert.strictEqual(getGateThreshold('feature-preservation'), 0.8);
  assert.strictEqual(getGateThreshold('literal-preservation'), 0.8);
  assert.strictEqual(getGateThreshold('role-preservation'), 0.8);
  assert.strictEqual(getGateThreshold('negation-preservation'), 0.9);
  assert.strictEqual(getGateThreshold('modality-preservation'), 0.9);
});

test('retention gates — unknown gate throws', () => {
  assert.throws(
    () => getGateThreshold('unknown-gate' as RetentionGateName),
    { message: /Unknown retention gate/ }
  );
});
