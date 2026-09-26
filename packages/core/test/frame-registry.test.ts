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
      }],
      consequences: [{
        predicate: 'send',
        modality: 'obligation',
        roles: {
          agent: { type: 'system', id: 'system' },
          object: { type: 'document', id: 'notification' },
          recipient: { type: 'actor', id: 'operator' }
        }
      }]
    }]
  };
  const result = validateSemFrames(sem);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test('valid coordinated conditional uses framed root and consequence predicates', () => {
  const result = validateSemFrames({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      modality: 'permission',
      roles: { agent: { type: 'system', id: 'system' }, theme: { type: 'feature', id: 'cooling' } },
      conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'temperature' }, value: { type: 'quantity', value: 15, unit: 'celsius' } } }],
      consequences: [{ predicate: 'send', modality: 'permission', roles: {
        agent: { type: 'system', id: 'system' }, object: { type: 'document', id: 'notice' }, recipient: { type: 'actor', id: 'operator' }
      } }]
    }]
  });
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(validateClauseFrame({ predicate: 'require', roles: { agent: { type: 'system', id: 'system' } } }).some((issue) => issue.code === 'unframed_predicate'), true);
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
  const unframed = validateClauseFrame({ predicate: 'observe', roles: { agent: { type: 'actor', id: 'user' } } });
  assert.ok(unframed.some((issue) => issue.code === 'unframed_predicate'));
});

test('frames reject duplicate time channels', () => {
  const issues = validateClauseFrame({ predicate: 'deadline', roles: {
    subject: { type: 'project', id: 'release' }, time: { type: 'date', value: '2027-01-01' }
  }, time: { type: 'date', value: '2027-01-01' } });
  assert.ok(issues.some((issue) => issue.code === 'duplicate_semantic_channel'));
});

test('frames reject a role that restates its own type or the predicate (decisions/0007)', () => {
  const actors = { agent: { type: 'actor', id: 'Dana' }, recipient: { type: 'actor', id: 'Mira' } };
  // Observed live: "Dana allows Mira to access." (object of access unstated).
  const typeEcho = validateClauseFrame({ predicate: 'allow', roles: { ...actors, theme: { type: 'access', value: 'access' } } });
  assert.ok(typeEcho.some((issue) => issue.code === 'placeholder_role' && issue.path.endsWith('roles.theme')));
  const predicateEcho = validateClauseFrame({ predicate: 'allow', roles: { ...actors, theme: 'allow' } });
  assert.ok(predicateEcho.some((issue) => issue.code === 'placeholder_role'));
  // Observed live after the first rule shipped: the extractor dropped the value.
  const typeOnly = validateClauseFrame({ predicate: 'allow', roles: { ...actors, theme: { type: 'access' } } });
  assert.ok(typeOnly.some((issue) => issue.code === 'placeholder_role'));
  const caseInsensitive = validateClauseFrame({ predicate: 'allow', roles: { ...actors, theme: { type: 'access', value: 'Access' } } });
  assert.ok(caseInsensitive.some((issue) => issue.code === 'placeholder_role'));
});

test('placeholder rule leaves named instances and real literals alone', () => {
  const actors = { agent: { type: 'actor', id: 'Dana' }, recipient: { type: 'actor', id: 'Mira' } };
  for (const theme of [
    { type: 'access', id: 'access' },                 // a named instance, even if oddly named
    { type: 'resource', id: 'R-9' },
    { type: 'access', value: 'read-only access to R-9' },
    { type: 'quantity', value: 7, unit: 'times' },
  ]) {
    const issues = validateClauseFrame({ predicate: 'allow', roles: { ...actors, theme } });
    assert.ok(!issues.some((issue) => issue.code === 'placeholder_role'), JSON.stringify(theme));
  }
});

test('allow/prohibit take a registered-predicate action and need theme or action (decisions/0008)', () => {
  const actors = { agent: { type: 'actor', id: 'Lena' }, recipient: { type: 'actor', id: 'Tomas' } };
  for (const predicate of ['allow', 'prohibit']) {
    // "Lena allows Tomas to edit."
    assert.deepEqual(validateClauseFrame({ predicate, roles: { ...actors, action: 'update' } }), []);
    // "Lena allows Tomas to edit page P-3."
    assert.deepEqual(validateClauseFrame({ predicate, roles: { ...actors, action: 'update', theme: { type: 'document', id: 'P-3' } } }), []);
    // Theme-only permissions stay valid, so existing Sem keeps its meaning.
    assert.deepEqual(validateClauseFrame({ predicate, roles: { ...actors, theme: { type: 'resource', id: 'R-9' } } }), []);
    // "Lena allows Tomas." states neither.
    assert.ok(validateClauseFrame({ predicate, roles: actors }).some((issue) => issue.code === 'missing_required_role'));
  }
  for (const action of ['edit', 'Update', { type: 'task', value: 'update' }, 'download']) {
    const issues = validateClauseFrame({ predicate: 'allow', roles: { ...actors, action: action as never } });
    assert.ok(issues.some((issue) => issue.code === 'unregistered_action'), JSON.stringify(action));
  }
  // The predicate itself is still a placeholder, not an action.
  assert.ok(validateClauseFrame({ predicate: 'allow', roles: { ...actors, action: 'allow' } }).some((issue) => issue.code === 'placeholder_role'));
});

test('allow/prohibit with an action need a distinct stated recipient (decisions/0010)', () => {
  for (const predicate of ['allow', 'prohibit']) {
    // "System S-22 is permitted to activate F-22" mis-encoded with the permitted party as permitter.
    const noRecipient = validateClauseFrame({ predicate, roles: { agent: { type: 'system', id: 'S-22' }, theme: { type: 'feature', id: 'F-22' }, action: 'enable' } });
    assert.ok(noRecipient.some((issue) => issue.code === 'dependent_role_missing'));
    const self = validateClauseFrame({ predicate, roles: { agent: { type: 'system', id: 'S-22' }, recipient: { type: 'system', id: 's-22' }, action: 'enable' } });
    assert.ok(self.some((issue) => issue.code === 'identical_roles'));
    assert.deepEqual(validateClauseFrame({ predicate, roles: { agent: { type: 'actor', id: 'Dana' }, recipient: { type: 'actor', id: 'Mira' }, action: 'access' } }), []);
    // Theme-only permissions keep their earlier meaning and need no recipient.
    assert.deepEqual(validateClauseFrame({ predicate, roles: { agent: { type: 'actor', id: 'Dana' }, theme: { type: 'resource', id: 'R-9' } } }), []);
  }
});

test('common predicates are framed and permitter-less permissions use them (decisions/0014)', () => {
  // "Nadia is permitted to read the payroll report."
  assert.deepEqual(validateClauseFrame({ predicate: 'read', modality: 'permission', roles: { agent: { type: 'actor', id: 'Nadia' }, theme: { type: 'document', id: 'payroll-report' } } }), []);
  // "Start the backup job." (imperative, no agent)
  assert.deepEqual(validateClauseFrame({ predicate: 'run', roles: { theme: { type: 'task', id: 'backup-job' } } }), []);
  // "Retry the upload 3 times." (imperative retry)
  assert.deepEqual(validateClauseFrame({ predicate: 'retry', roles: { theme: { type: 'task', id: 'upload' }, count: { type: 'quantity', value: 3, unit: 'times' } } }), []);
  assert.ok(validateClauseFrame({ predicate: 'notify', roles: { agent: { type: 'system', id: 'S-1' } } }).some((issue) => issue.code === 'missing_required_role'));
  assert.ok(validateClauseFrame({ predicate: 'approve', roles: { agent: { type: 'actor', id: 'Tom' } } }).some((issue) => issue.code === 'missing_required_role'));
});
