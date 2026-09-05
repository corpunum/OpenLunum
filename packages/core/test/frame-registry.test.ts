import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_SEMANTIC_FRAMES,
  validateClauseFrame,
  validateSemFrames
} from '../src/frame-registry.js';
import type { LunumSem } from '../src/types.js';

test('canonical semantic frames define core predicate roles', () => {
  assert.ok(CANONICAL_SEMANTIC_FRAMES.prefer);
  assert.ok(CANONICAL_SEMANTIC_FRAMES.send);
  assert.ok(CANONICAL_SEMANTIC_FRAMES.receive);
  assert.ok(CANONICAL_SEMANTIC_FRAMES.believe);
  assert.ok(CANONICAL_SEMANTIC_FRAMES.publish);
  assert.ok(CANONICAL_SEMANTIC_FRAMES.retry);
});

test('prefer frame requires experiencer and accepts a resolved theme', () => {
  const validClause = {
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'concise_answers' }
    }
  };
  assert.deepEqual(validateClauseFrame(validClause), []);

  const invalidClause = {
    predicate: 'prefer',
    roles: {
      agent: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'concise_answers' }
    }
  };
  const issues = validateClauseFrame(invalidClause);
  assert.ok(issues.some((issue) => issue.code === 'missing_required_role'));
  assert.match(issues.map((issue) => issue.message).join('; '), /experiencer/u);
});

test('validateSemFrames traverses nested conditions and consequences', () => {
  const sem: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'feature', id: 'power_saving' } },
      conditions: [{
        predicate: 'below',
        roles: { subject: { type: 'metric', id: 'battery_level' }, value: { type: 'quantity', value: 20, unit: 'percent' } }
      }]
    }]
  };
  const result = validateSemFrames(sem);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test('validateClauseFrame rejects disallowed term types for typed roles', () => {
  const clause = {
    predicate: 'believe',
    roles: {
      experiencer: { type: 'quantity', value: 42 }, // Experiencer cannot be quantity!
      theme: { type: 'concept', id: 'online' }
    }
  };
  const issues = validateClauseFrame(clause);
  assert.ok(issues.some(i => i.code === 'disallowed_term_type'));
});

test('validateClauseFrame rejects mutually exclusive send destinations', () => {
  const issues = validateClauseFrame({
    predicate: 'send',
    roles: {
      agent: { type: 'actor', id: 'a' },
      object: { type: 'entity', id: 'm' },
      recipient: { type: 'actor', id: 'r' },
      destination: { type: 'entity', id: 'd' }
    }
  });
  assert.ok(issues.some(i => i.code === 'role_conflict'));
});

test('validateClauseFrame rejects unresolved delete targets', () => {
  const issues = validateClauseFrame({ predicate: 'delete', roles: {} });
  assert.ok(issues.some(i => i.code === 'missing_required_role'));
});

test('frames reject globally registered but undeclared roles and unframed predicates', () => {
  const extra = validateClauseFrame({ predicate: 'prefer', roles: {
    experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'digest' }, manner: { type: 'concept', id: 'csv' }
  }});
  assert.ok(extra.some((issue) => issue.code === 'unexpected_role'));
  const unframed = validateClauseFrame({ predicate: 'share', roles: { agent: { type: 'actor', id: 'user' } } });
  assert.ok(unframed.some((issue) => issue.code === 'unframed_predicate'));
});
