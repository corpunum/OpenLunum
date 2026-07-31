import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gatedCompareSem,
  isGateBlocked,
  getBlockingReasons,
  DEFAULT_HARD_GATE_POLICY,
  type HardGatePolicy,
  type GatedComparison
} from '../src/hard-gates.js';
import type { LunumSem } from '../src/types.js';

function makeSem(overrides: Partial<LunumSem> = {}, clauseOverrides: Record<string, unknown> = {}): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      roles: {
        agent: { type: 'person', id: 'alice' },
        patient: { type: 'person', id: 'bob' }
      },
      ...clauseOverrides
    }],
    ...overrides
  };
}

test('gatedCompareSem: identical sems produce match verdict', () => {
  const sem = makeSem();
  const result = gatedCompareSem(sem, sem);
  assert.equal(result.verdict, 'match');
  assert.equal(result.gateBlocked, false);
  assert.equal(result.blockingInvariants.length, 0);
  assert.equal(result.gateReport.gatesFailed, 0);
});

test('gatedCompareSem: negation flip blocks match', () => {
  const expected = makeSem({}, { negated: false });
  const actual = makeSem({}, { negated: true });
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.verdict, 'mismatch');
  assert.equal(result.gateBlocked, true);
  assert.ok(result.blockingInvariants.length > 0);
  assert.ok(result.gateReport.failedGateCodes.includes('negation-flip'));
});

test('gatedCompareSem: role identity swap blocks match', () => {
  const expected = makeSem();
  const actual: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      roles: {
        agent: { type: 'person', id: 'bob' },
        patient: { type: 'person', id: 'alice' }
      }
    }]
  };
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.verdict, 'mismatch');
  assert.equal(result.gateBlocked, true);
});

test('gatedCompareSem: obligation-permission swap blocks match', () => {
  const expected = makeSem({}, { modality: 'obligation' });
  const actual = makeSem({}, { modality: 'permission' });
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.verdict, 'mismatch');
  assert.equal(result.gateBlocked, true);
  assert.ok(result.gateReport.failedGateCodes.includes('obligation-permission'));
});

test('gatedCompareSem: different predicates produce mismatch without gate blocking', () => {
  const expected = makeSem();
  const actual: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'inform',
      roles: {
        agent: { type: 'person', id: 'alice' },
        patient: { type: 'person', id: 'bob' }
      }
    }]
  };
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.gateBlocked, false);
  assert.notEqual(result.verdict, 'match');
});

test('gatedCompareSem: gate report has correct counts', () => {
  const expected = makeSem({}, { negated: false });
  const actual = makeSem({}, { negated: true });
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.gateReport.enforced, true);
  assert.equal(result.gateReport.totalGatesChecked, DEFAULT_HARD_GATE_POLICY.enforcedInvariantCodes.length);
  assert.ok(result.gateReport.gatesFailed >= 1);
  assert.equal(result.gateReport.gatesPassed + result.gateReport.gatesFailed, result.gateReport.totalGatesChecked);
});

test('gatedCompareSem: custom policy can exclude specific invariant codes', () => {
  const expected = makeSem({}, { negated: false });
  const actual = makeSem({}, { negated: true });

  const lenientPolicy: HardGatePolicy = {
    featureRecallThreshold: 0.95,
    featurePrecisionThreshold: 0.95,
    enforcedInvariantCodes: ['role-identity', 'condition-change']
  };

  const result = gatedCompareSem(expected, actual, lenientPolicy);
  assert.equal(result.gateBlocked, false);
  assert.equal(result.blockingInvariants.length, 0);
});

test('isGateBlocked utility returns correct boolean', () => {
  const sem = makeSem();
  const clean = gatedCompareSem(sem, sem);
  assert.equal(isGateBlocked(clean), false);

  const blocked = gatedCompareSem(makeSem({}, { negated: false }), makeSem({}, { negated: true }));
  assert.equal(isGateBlocked(blocked), true);
});

test('getBlockingReasons returns human-readable strings', () => {
  const result = gatedCompareSem(makeSem({}, { negated: false }), makeSem({}, { negated: true }));
  const reasons = getBlockingReasons(result);
  assert.ok(reasons.length > 0);
  assert.ok(reasons[0]!.includes('negation-flip'));
});

test('gatedCompareSem: exact canonical match returns match verdict', () => {
  const a = makeSem();
  const b = makeSem();
  const result = gatedCompareSem(a, b);
  assert.equal(result.verdict, 'match');
  assert.equal(result.exactCanonical, true);
});

test('gatedCompareSem: partial overlap returns partial verdict', () => {
  const expected = makeSem();
  const actual: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      roles: {
        agent: { type: 'person', id: 'alice' }
      }
    }]
  };
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.gateBlocked, false);
  assert.ok(result.verdict === 'partial' || result.verdict === 'match');
});

test('gatedCompareSem: all invariant codes are enforced by default', () => {
  assert.deepEqual(
    DEFAULT_HARD_GATE_POLICY.enforcedInvariantCodes.sort(),
    ['condition-change', 'negation-flip', 'obligation-permission', 'protected-literal', 'role-identity']
  );
});

test('gatedCompareSem: multiple invariant violations are all reported', () => {
  const expected: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      negated: false,
      modality: 'obligation',
      roles: {
        agent: { type: 'person', id: 'alice' },
        patient: { type: 'person', id: 'bob' }
      }
    }]
  };
  const actual: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      negated: true,
      modality: 'permission',
      roles: {
        agent: { type: 'person', id: 'bob' },
        patient: { type: 'person', id: 'alice' }
      }
    }]
  };
  const result = gatedCompareSem(expected, actual);
  assert.equal(result.verdict, 'mismatch');
  assert.equal(result.gateBlocked, true);
  assert.ok(result.gateReport.gatesFailed >= 2);
});
