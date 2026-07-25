import test from 'node:test';
import assert from 'node:assert/strict';
import type { LunumSem } from '@corpunum/lunum';
import {
  checkProtectedLiteralPlacement,
  collectLiteralPlacements,
  protectedLiteralPlacementCoverage
} from '../src/protected-literal-placement.js';

// Mirrors datasets/dev/multilingual-core-v1.jsonl:battery-en. The literal
// "20" is expected at roles.value.value, nested one level under conditions,
// carrying unit: percent.
const batteryGoldSem: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'conditional_instruction',
  clauses: [{
    predicate: 'enable',
    roles: {
      agent: { type: 'actor', id: 'system' },
      theme: { type: 'feature', id: 'power_saving' }
    },
    negated: false,
    conditions: [{
      predicate: 'below',
      roles: {
        subject: { type: 'metric', id: 'battery_level' },
        value: { type: 'quantity', value: 20, unit: 'percent' }
      },
      negated: false
    }]
  }]
};

// Mirrors datasets/dev/multilingual-core-v1.jsonl:deadline-en. The literal
// "2026-09-30" is expected at roles.time.value, at the root clause.
const deadlineGoldSem: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'project_state',
  clauses: [{
    predicate: 'deadline',
    roles: {
      subject: { type: 'project', id: 'project' },
      time: { type: 'date', value: '2026-09-30' }
    },
    negated: false
  }]
};

test('correct literal in correct role passes', () => {
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, batteryGoldSem, ['20']);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, 'placed');
  assert.equal(checks[0]!.satisfied, true);
  assert.equal(protectedLiteralPlacementCoverage(checks), 1);
});

test('predicate wording differences do not break placement (only role path matters)', () => {
  const candidate: LunumSem = {
    ...batteryGoldSem,
    clauses: [{
      ...batteryGoldSem.clauses[0]!,
      conditions: [{
        predicate: 'is_below', // synonym for "below" - should not affect placement
        roles: {
          subject: { type: 'metric', id: 'battery_level' },
          value: { type: 'quantity', value: 20, unit: 'percent' }
        },
        negated: false
      }]
    }]
  };
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, candidate, ['20']);
  assert.equal(checks[0]!.status, 'placed');
});

test('"120" does NOT satisfy protected literal "20" (substring false positive)', () => {
  const candidate: LunumSem = {
    ...batteryGoldSem,
    clauses: [{
      ...batteryGoldSem.clauses[0]!,
      conditions: [{
        predicate: 'below',
        roles: {
          subject: { type: 'metric', id: 'battery_level' },
          value: { type: 'quantity', value: 120, unit: 'percent' }
        },
        negated: false
      }]
    }]
  };
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, candidate, ['20']);
  assert.equal(checks[0]!.status, 'missing');
  assert.equal(checks[0]!.satisfied, false);
  assert.equal(protectedLiteralPlacementCoverage(checks), 0);
});

test('"200" does NOT satisfy protected literal "20" (substring false positive)', () => {
  const candidate: LunumSem = {
    ...batteryGoldSem,
    clauses: [{
      ...batteryGoldSem.clauses[0]!,
      conditions: [{
        predicate: 'below',
        roles: {
          subject: { type: 'metric', id: 'battery_level' },
          value: { type: 'quantity', value: 200, unit: 'percent' }
        },
        negated: false
      }]
    }]
  };
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, candidate, ['20']);
  assert.equal(checks[0]!.status, 'missing');
  assert.equal(checks[0]!.satisfied, false);
});

test('correct literal placed in the WRONG semantic role fails', () => {
  // "20" is present, but as the battery_level subject id rather than the
  // condition's quantity value - the value that should carry unit: percent.
  const candidate: LunumSem = {
    ...batteryGoldSem,
    clauses: [{
      ...batteryGoldSem.clauses[0]!,
      conditions: [{
        predicate: 'below',
        roles: {
          subject: { type: 'metric', id: '20' },
          value: { type: 'quantity', value: 55, unit: 'percent' }
        },
        negated: false
      }]
    }]
  };
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, candidate, ['20']);
  assert.equal(checks[0]!.status, 'wrong-role');
  assert.equal(checks[0]!.satisfied, false);
  assert.ok(checks[0]!.candidatePaths.length > 0);
  assert.ok(!checks[0]!.expectedPaths.some((path) => checks[0]!.candidatePaths.includes(path)));
});

test('literal moved out of conditions into the root clause role fails (wrong nesting depth)', () => {
  const candidate: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      roles: {
        agent: { type: 'actor', id: 'system' },
        theme: { type: 'feature', id: 'power_saving' },
        value: { type: 'quantity', value: 20, unit: 'percent' } // wrong: not nested under conditions
      },
      negated: false
    }]
  };
  const checks = checkProtectedLiteralPlacement(batteryGoldSem, candidate, ['20']);
  assert.equal(checks[0]!.status, 'wrong-role');
});

test('date literal in the correct time role passes', () => {
  const checks = checkProtectedLiteralPlacement(deadlineGoldSem, deadlineGoldSem, ['2026-09-30']);
  assert.equal(checks[0]!.status, 'placed');
});

test('date literal placed as a plain id instead of the time role fails', () => {
  const candidate: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'project_state',
    clauses: [{
      predicate: 'deadline',
      roles: {
        subject: { type: 'project', id: '2026-09-30' }
      },
      negated: false
    }]
  };
  const checks = checkProtectedLiteralPlacement(deadlineGoldSem, candidate, ['2026-09-30']);
  assert.equal(checks[0]!.status, 'wrong-role');
});

test('literal entirely absent from candidate is reported missing', () => {
  const candidate: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'project_state',
    clauses: [{ predicate: 'deadline', roles: { subject: { type: 'project', id: 'project' } }, negated: false }]
  };
  const checks = checkProtectedLiteralPlacement(deadlineGoldSem, candidate, ['2026-09-30']);
  assert.equal(checks[0]!.status, 'missing');
});

test('items with no protected literals trivially pass with coverage 1', () => {
  const checks = checkProtectedLiteralPlacement(deadlineGoldSem, deadlineGoldSem, []);
  assert.equal(checks.length, 0);
  assert.equal(protectedLiteralPlacementCoverage(checks), 1);
});

test('a declared literal absent from goldSem itself is flagged as a data issue, not a false pass', () => {
  const checks = checkProtectedLiteralPlacement(deadlineGoldSem, deadlineGoldSem, ['not-in-gold']);
  assert.equal(checks[0]!.status, 'literal-not-in-gold');
  assert.equal(checks[0]!.satisfied, false);
});

test('collectLiteralPlacements finds the quantity value under nested conditions', () => {
  const placements = collectLiteralPlacements(batteryGoldSem);
  const match = placements.find((placement) => placement.value === '20');
  assert.ok(match);
  assert.equal(match!.path, 'root>conditions>roles.value.value');
});

test('collectLiteralPlacements finds the date value at the root time role', () => {
  const placements = collectLiteralPlacements(deadlineGoldSem);
  const match = placements.find((placement) => placement.value === '2026-09-30');
  assert.ok(match);
  assert.equal(match!.path, 'root>roles.time.value');
});

test('mixed coverage: one placed, one wrong-role averages to 0.5', () => {
  // Combined gold: a battery-style condition (literal "20") plus a
  // deadline-style time role (literal "2026-09-30") on the same clause.
  const combinedGoldSem: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      roles: {
        agent: { type: 'actor', id: 'system' },
        theme: { type: 'feature', id: 'power_saving' },
        time: { type: 'date', value: '2026-09-30' }
      },
      negated: false,
      conditions: [{
        predicate: 'below',
        roles: {
          subject: { type: 'metric', id: 'battery_level' },
          value: { type: 'quantity', value: 20, unit: 'percent' }
        },
        negated: false
      }]
    }]
  };
  const candidate: LunumSem = {
    ...combinedGoldSem,
    clauses: [{
      ...combinedGoldSem.clauses[0]!,
      // date literal moved to the wrong role (id instead of time.value)
      roles: {
        agent: { type: 'actor', id: 'system' },
        theme: { type: 'feature', id: 'power_saving' },
        subject: { type: 'project', id: '2026-09-30' }
      },
      conditions: [{
        predicate: 'below',
        roles: {
          subject: { type: 'metric', id: 'battery_level' },
          value: { type: 'quantity', value: 20, unit: 'percent' } // correct role for "20"
        },
        negated: false
      }]
    }]
  };
  const checks = checkProtectedLiteralPlacement(combinedGoldSem, candidate, ['20', '2026-09-30']);
  assert.equal(checks.find((c) => c.literal === '20')!.status, 'placed');
  assert.equal(checks.find((c) => c.literal === '2026-09-30')!.status, 'wrong-role');
  assert.equal(protectedLiteralPlacementCoverage(checks), 0.5);
});
