import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt } from '../src/prompts.js';
import { PREDICATE_SET, ROLE_SET, IDENTIFIER_SET } from '../src/predicate-vocabulary.js';

/**
 * Regression coverage for #337: parsePrompt's worked examples must never
 * contradict the controlled vocabulary for their own `kind`.
 *
 * #253's parse baseline audit (56.25% / 25.00% exact) traced almost every
 * failure to worked examples in parsePrompt using the wrong predicate/role
 * for a `kind` whose gold pattern uses a different, canonical term that
 * *is* present in predicate-vocabulary.ts. Models copied the misleading
 * example instead of the controlled vocabulary because the example is a
 * concrete, structurally-anchored illustration while the vocabulary block
 * is just a flat word list.
 *
 * This test extracts each worked example's JSON from parsePrompt's system
 * message and asserts that when a synonym pair exists (one term in the
 * controlled vocabulary, one not), the example uses the vocabulary term.
 */

interface ExampleClauseCondition {
  predicate: string;
  roles: Record<string, { type: string; id: string }>;
}

interface ExampleClause {
  predicate: string;
  roles: Record<string, { type: string; id: string }>;
  conditions?: ExampleClauseCondition[];
}

interface ExampleSem {
  kind: string;
  clauses: ExampleClause[];
}

function extractExample(system: string, label: string): ExampleSem {
  const lines = system.split('\n');
  const line = lines.find(l => l.startsWith(`${label}: `));
  assert.ok(line, `expected a "${label}: " line in parsePrompt system message`);
  const json = line!.slice(`${label}: `.length);
  return JSON.parse(json) as ExampleSem;
}

function buildExamples(): Record<string, ExampleSem> {
  const item = {
    id: 'test',
    sourceLanguage: 'en',
    sourceText: 'irrelevant for this test',
    goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] }
  } as any;

  const prompt = parsePrompt(item);

  return {
    preference: extractExample(prompt.system, 'Preference'),
    conditional_instruction: extractExample(prompt.system, 'Conditional Instruction'),
    safety_constraint: extractExample(prompt.system, 'Safety Constraint'),
    project_state: extractExample(prompt.system, 'Project State')
  };
}

test('exampleProjectState uses the controlled "deadline" predicate, not "scheduled"', () => {
  const examples = buildExamples();
  const clause = examples.project_state!.clauses[0]!;

  assert.strictEqual(clause.predicate, 'deadline', 'project_state example predicate should be "deadline"');
  assert.notStrictEqual(clause.predicate, 'scheduled', 'project_state example must not regress to the uncontrolled synonym "scheduled"');
  assert.ok(PREDICATE_SET.has(clause.predicate), 'project_state example predicate must be in PREDICATE_SET');
});

test('exampleConditional\'s condition uses the controlled "below" predicate, not "exceeds"', () => {
  const examples = buildExamples();
  const clause = examples.conditional_instruction!.clauses[0]!;
  const condition = clause.conditions?.[0];

  assert.ok(condition, 'conditional_instruction example should have a condition clause');
  assert.strictEqual(condition!.predicate, 'below', 'conditional_instruction condition predicate should be "below"');
  assert.notStrictEqual(condition!.predicate, 'exceeds', 'conditional_instruction condition must not regress to the uncontrolled synonym "exceeds"');
  assert.ok(PREDICATE_SET.has(condition!.predicate), 'conditional_instruction condition predicate must be in PREDICATE_SET');
});

test('exampleSafety\'s condition uses "confirmed"/"user", not "approved"/"administrator"', () => {
  const examples = buildExamples();
  const clause = examples.safety_constraint!.clauses[0]!;
  const condition = clause.conditions?.[0];

  assert.ok(condition, 'safety_constraint example should have a condition clause');
  assert.strictEqual(condition!.predicate, 'confirmed', 'safety_constraint condition predicate should be "confirmed"');
  assert.notStrictEqual(condition!.predicate, 'approved', 'safety_constraint condition must not regress to the uncontrolled synonym "approved"');
  assert.ok(PREDICATE_SET.has(condition!.predicate), 'safety_constraint condition predicate must be in PREDICATE_SET');

  const conditionAgent = condition!.roles.agent;
  assert.ok(conditionAgent, 'safety_constraint condition should have an agent role');
  assert.strictEqual(conditionAgent.id, 'user', 'safety_constraint condition agent id should be "user"');
  assert.notStrictEqual(conditionAgent.id, 'administrator', 'safety_constraint condition agent must not regress to the uncontrolled synonym "administrator"');
  assert.ok(IDENTIFIER_SET.has(conditionAgent.id), 'safety_constraint condition agent id must be in IDENTIFIER_SET');
});

test('below and confirmed are present in the controlled predicate vocabulary', () => {
  // #337 root cause: these two canonical terms were entirely absent from
  // PREDICATES, so there was no controlled-vocabulary anchor to override
  // the misleading worked examples in the first place.
  assert.ok(PREDICATE_SET.has('below'), 'PREDICATE_SET should include "below"');
  assert.ok(PREDICATE_SET.has('confirmed'), 'PREDICATE_SET should include "confirmed"');
});

test('every worked example predicate/role/identifier that overlaps the controlled vocabulary is drawn from it', () => {
  // Walk every clause and condition in every worked example. For any
  // predicate/role/identifier that has a controlled-vocabulary counterpart
  // for that same slot, the example must use the canonical term rather
  // than an uncontrolled synonym. This is a general sweep in addition to
  // the specific hard-coded assertions above, so a future regression on a
  // *new* worked example (not just these three) would also be caught.
  const KNOWN_SYNONYM_MAP: Record<string, string> = {
    scheduled: 'deadline',
    exceeds: 'below',
    approved: 'confirmed',
    administrator: 'user'
  };

  const examples = buildExamples();
  const allClauses: ExampleClause[] = Object.values(examples).flatMap(ex => ex.clauses);

  for (const clause of allClauses) {
    for (const [synonym, canonical] of Object.entries(KNOWN_SYNONYM_MAP)) {
      if (PREDICATE_SET.has(canonical) || ROLE_SET.has(canonical) || IDENTIFIER_SET.has(canonical)) {
        assert.notStrictEqual(clause.predicate, synonym, `clause predicate should not use uncontrolled synonym "${synonym}" when "${canonical}" is canonical`);
        for (const role of Object.values(clause.roles)) {
          assert.notStrictEqual(role.id, synonym, `clause role id should not use uncontrolled synonym "${synonym}" when "${canonical}" is canonical`);
        }
        for (const condition of clause.conditions ?? []) {
          assert.notStrictEqual(condition.predicate, synonym, `condition predicate should not use uncontrolled synonym "${synonym}" when "${canonical}" is canonical`);
          for (const role of Object.values(condition.roles)) {
            assert.notStrictEqual(role.id, synonym, `condition role id should not use uncontrolled synonym "${synonym}" when "${canonical}" is canonical`);
          }
        }
      }
    }
  }
});
