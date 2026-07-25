import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parsePrompt } from '../src/prompts.js';
import { PREDICATE_SET, ROLE_SET, IDENTIFIER_SET, MODALITY_VALUES, MODALITY_VALUE_SET, vocabularyBlock } from '../src/predicate-vocabulary.js';
import { findWorkspaceRoot, loadDataset } from '../src/io.js';

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
  modality?: string;
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
    project_state: extractExample(prompt.system, 'Project State'),
    permission: extractExample(prompt.system, 'Permission')
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

/**
 * Regression coverage for #341: the parse prompt must document a modality
 * controlled vocabulary and demonstrate a schema-valid `modality` value in
 * at least one worked example.
 *
 * #332/#335's false-positive review found that neither audited model
 * reliably emitted the canonical `permission` modality value, because
 * vocabularyBlock() never documented modality values and no worked example
 * in parsePrompt showed a `modality` field. The mutation-false-positive
 * gold corpus (datasets/adversarial/mutation-false-positive-v1.jsonl,
 * `modality-*` items) uses `modality: 'permission'` on a permissive
 * "you may enable X" clause; these tests assert the fix stays in place.
 */

const EXPECTED_MODALITY_TYPES = [
  'fact',
  'opinion',
  'belief',
  'possibility',
  'necessity',
  'obligation',
  'permission',
  'ability',
  'intention',
  'certainty'
];

test('MODALITY_VALUES contains "permission" and matches the ModalityType set exactly', () => {
  // ModalityType is defined in packages/core/src/typed-structures.ts. This
  // list is hard-coded here (see the comment in predicate-vocabulary.ts for
  // why) and must be kept byte-for-byte in sync with that enum.
  assert.ok(MODALITY_VALUE_SET.has('permission'), 'MODALITY_VALUE_SET should include "permission"');
  assert.deepStrictEqual(
    [...MODALITY_VALUES].sort(),
    [...EXPECTED_MODALITY_TYPES].sort(),
    'MODALITY_VALUES must exactly match the ModalityType union in packages/core/src/typed-structures.ts'
  );
});

test('vocabularyBlock() renders a Modality values line covering every MODALITY_VALUES entry', () => {
  const block = vocabularyBlock();
  assert.match(block, /Modality values:/, 'vocabularyBlock() should render a "Modality values:" line');
  for (const value of MODALITY_VALUES) {
    assert.ok(block.includes(value), `vocabularyBlock() should mention modality value "${value}"`);
  }
});

test('parsePrompt includes at least one worked example with a schema-valid modality value', () => {
  const examples = buildExamples();
  const allClauses: ExampleClause[] = Object.values(examples).flatMap(ex => ex.clauses);
  const modalityClauses = allClauses.filter(clause => typeof clause.modality === 'string');

  assert.ok(modalityClauses.length > 0, 'at least one worked example clause should carry a modality field');
  for (const clause of modalityClauses) {
    assert.ok(
      MODALITY_VALUE_SET.has(clause.modality!),
      `worked example modality "${clause.modality}" must be a schema-valid ModalityType value`
    );
  }
});

test('examplePermission demonstrates the canonical "permission" modality on a scenario distinct from the core dataset', () => {
  // #341 follow-up: the modality demo must NOT live on exampleConditional,
  // because that scenario (enable power_saving when battery below 20%) is
  // structurally identical to the core dataset's battery-en/el/es/id items
  // in datasets/dev/multilingual-core-v1.jsonl, whose gold has no modality
  // field. Models copy example vocabulary verbatim (the #253/#337 finding),
  // so showing modality: 'permission' on that exact scenario risked
  // regressing #339's 4/4 exact-match result on the core battery items.
  // The dedicated "share the report with the team" example below carries
  // the modality demonstration instead, on a scenario with no core-dataset
  // collision.
  const examples = buildExamples();
  const clause = examples.permission!.clauses[0]!;

  assert.strictEqual(clause.modality, 'permission', 'examplePermission clause should demonstrate modality: "permission"');
});

test('exampleConditional no longer carries a modality field (must stay a plain-imperative match for the core battery items)', () => {
  const examples = buildExamples();
  const clause = examples.conditional_instruction!.clauses[0]!;

  assert.strictEqual(clause.modality, undefined, 'exampleConditional must not carry modality — it mirrors the core dataset\'s no-modality battery-* gold');
});

/**
 * Regression coverage for #345: examplePermission's "confirmed" condition
 * demonstrated a `subject` role, but the delete-* gold in
 * datasets/dev/multilingual-core-v1.jsonl uses `confirmed` with an `agent`
 * role (`agent: { type: 'actor', id: 'user' }`). Since `confirmed` is a
 * shared controlled predicate, the mismatched example taught models to
 * emit the wrong role structure when they reused it — #344's measurement
 * showed qwen3.6-35b copy the `subject` role verbatim onto delete-el,
 * dropping parse recall. This is the same example-vs-gold contradiction
 * class #337 was built to eliminate, just on the `confirmed` predicate's
 * *role key* rather than its predicate name.
 */

test('examplePermission\'s "confirmed" condition uses the "agent" role, not "subject"', () => {
  const examples = buildExamples();
  const clause = examples.permission!.clauses[0]!;
  const condition = clause.conditions?.[0];

  assert.ok(condition, 'permission example should have a condition clause');
  assert.strictEqual(condition!.predicate, 'confirmed', 'examplePermission condition predicate should be "confirmed"');
  assert.ok(condition!.roles.agent, 'examplePermission\'s confirmed condition should have an "agent" role');
  assert.ok(!('subject' in condition!.roles), 'examplePermission\'s confirmed condition must not regress to a "subject" role');
  assert.ok(ROLE_SET.has('agent'), '"agent" must be in the controlled ROLE_SET');
});

test('every worked example\'s use of a gold-shared controlled predicate uses the same role key the gold dataset uses for it', async () => {
  // General sweep: for any condition predicate in a worked example that
  // also appears as a condition predicate in the delete/safety gold items
  // (multilingual-core-v1.jsonl), the example must use the same role key(s)
  // the gold uses. This generalizes the specific "confirmed"/"agent"
  // assertion above so a future worked example reusing "confirmed" (or any
  // other shared condition predicate) can't silently reintroduce a
  // contradicting role structure.
  const workspaceRoot = await findWorkspaceRoot();
  const dataset = await loadDataset(path.join(workspaceRoot, 'datasets', 'dev', 'multilingual-core-v1.jsonl'));

  // Build a map of condition predicate -> set of role keys used for it in
  // the gold dataset (e.g. "confirmed" -> {"agent"}).
  const goldConditionRoleKeys = new Map<string, Set<string>>();
  for (const item of dataset) {
    for (const clause of item.goldSem.clauses ?? []) {
      for (const condition of (clause as { conditions?: Array<{ predicate: string; roles: Record<string, unknown> }> }).conditions ?? []) {
        const roleKeys = goldConditionRoleKeys.get(condition.predicate) ?? new Set<string>();
        for (const roleKey of Object.keys(condition.roles)) {
          roleKeys.add(roleKey);
        }
        goldConditionRoleKeys.set(condition.predicate, roleKeys);
      }
    }
  }

  assert.ok(goldConditionRoleKeys.get('confirmed')?.has('agent'), 'sanity check: gold dataset should use "confirmed" with an "agent" role');

  const examples = buildExamples();
  const allClauses: ExampleClause[] = Object.values(examples).flatMap(ex => ex.clauses);

  for (const clause of allClauses) {
    for (const condition of clause.conditions ?? []) {
      const goldRoleKeys = goldConditionRoleKeys.get(condition.predicate);
      if (!goldRoleKeys) continue; // predicate not shared with the gold dataset's conditions; nothing to compare
      for (const roleKey of Object.keys(condition.roles)) {
        assert.ok(
          goldRoleKeys.has(roleKey),
          `worked example condition predicate "${condition.predicate}" uses role key "${roleKey}", but the gold dataset only uses ${JSON.stringify([...goldRoleKeys])} for that predicate`
        );
      }
    }
  }
});
