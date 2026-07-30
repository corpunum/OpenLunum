import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHardInvariants, checkRoleIdentityInvariant, checkNegationInvariant, checkConditionInvariant, checkProtectedLiteralInvariant } from '../src/semantic-invariants.js';
import { NearSemanticFingerprintGenerator } from '../src/near-semantic-fingerprints.js';
import { compareSem } from '../src/compare.js';
import type { LunumSem } from '../src/types.js';

async function findWorkspaceRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  for (;;) {
    try {
      await access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Could not find pnpm-workspace.yaml above ${start}`);
      current = parent;
    }
  }
}

async function loadJsonl<T>(file: string): Promise<T[]> {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/u).filter((line) => line.trim());
  return lines.map((line) => JSON.parse(line) as T);
}

interface MutationItem { id: string; sourceItemId: string; mutationType: string; goldSem: LunumSem }
interface SourceItem { id: string; goldSem: LunumSem }
interface HeldoutItem { id: string; label: string; semA: LunumSem; semB: LunumSem }

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = await findWorkspaceRoot(here);
const mutationV2 = await loadJsonl<MutationItem>(path.join(workspaceRoot, 'datasets/adversarial/mutation-false-positive-v2.jsonl'));
const mutationV2Sources = await loadJsonl<SourceItem>(path.join(workspaceRoot, 'datasets/dev/synthetic-mutation-sources-v1.jsonl'));
const heldout = await loadJsonl<HeldoutItem>(path.join(workspaceRoot, 'datasets/dev/scorer-eval-heldout-v1.jsonl'));
const mutationV2SourceById = new Map(mutationV2Sources.map((item) => [item.id, item]));

const FORMER_FALSE_POSITIVE_IDS = [
  'role-remind-en', 'role-approve-en', 'role-remind-el', 'role-approve-el',
  'role-remind-es', 'role-approve-es', 'role-remind-id', 'role-approve-id'
];

const TRUE_POSITIVE_HELDOUT_IDS = [
  'share-manner-en', 'translate-lang-id-en', 'share-inner-note-en', 'archive-condition-order-en',
  'summarize-lang-id-es', 'share-manner-el', 'share-inner-note-id', 'archive-casing-en'
];

function baseSem(): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'command',
    clauses: [{
      predicate: 'delete',
      roles: {
        agent: { type: 'actor', id: 'assistant' },
        theme: { type: 'concept', id: 'files' }
      },
      negated: false,
      conditions: [{
        predicate: 'confirmed',
        roles: { agent: { type: 'actor', id: 'user' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
}

test('role-identity invariant: fires on a cross-clause consistent id swap', () => {
  const a = baseSem();
  const b = baseSem();
  (b.clauses[0]!.roles.agent as Record<string, unknown>).id = 'user';
  (b.clauses[0]!.conditions![0]!.roles.agent as Record<string, unknown>).id = 'assistant';
  const firings = checkRoleIdentityInvariant(a, b);
  assert.equal(firings.length, 2);
  assert.ok(firings.every((firing) => firing.code === 'role-identity'));
});

test('role-identity invariant: does NOT fire on a single filler renamed to a new id', () => {
  const a = baseSem();
  const b = baseSem();
  (b.clauses[0]!.roles.theme as Record<string, unknown>).id = 'documents';
  assert.deepEqual(checkRoleIdentityInvariant(a, b), []);
});

test('role-identity invariant: does NOT fire on an inconsistent (non-bijective) id change', () => {
  const a = baseSem();
  const b = baseSem();
  (b.clauses[0]!.roles.agent as Record<string, unknown>).id = 'user';
  (b.clauses[0]!.conditions![0]!.roles.agent as Record<string, unknown>).id = 'someone_else';
  assert.deepEqual(checkRoleIdentityInvariant(a, b), []);
});

test('role-identity invariant: sibling condition reordering is not mistaken for a swap', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'archive',
      roles: { agent: { type: 'actor', id: 'assistant' }, theme: { type: 'concept', id: 'thread' } },
      negated: false,
      conditions: [
        { predicate: 'inactive', roles: { subject: { type: 'concept', id: 'thread' } }, negated: false },
        { predicate: 'pinned', roles: { subject: { type: 'concept', id: 'thread' } }, negated: true }
      ]
    }]
  } as unknown as LunumSem;
  const b = {
    ...a,
    clauses: [{ ...a.clauses[0]!, conditions: [...a.clauses[0]!.conditions!].reverse() }]
  } as unknown as LunumSem;
  const result = checkHardInvariants(a, b);
  assert.deepEqual(result.invariants, []);
  assert.equal(result.hardMismatch, false);
});

test('negation-flip invariant: fires when a matched clause negates differently', () => {
  const a = baseSem();
  const b = baseSem();
  b.clauses[0]!.conditions![0]!.negated = true;
  const firings = checkNegationInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.equal(firings[0]!.code, 'negation-flip');
  assert.match(firings[0]!.detail, /confirmed/u);
});

test('negation-flip invariant: does not fire when negation is unchanged', () => {
  assert.deepEqual(checkNegationInvariant(baseSem(), baseSem()), []);
});

test('condition-change invariant: fires when a condition is added or removed', () => {
  const a = baseSem();
  const b = baseSem();
  b.clauses[0]!.conditions = [];
  const firings = checkConditionInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.equal(firings[0]!.code, 'condition-change');
  assert.match(firings[0]!.detail, /presence differs/u);
});

test('condition-change invariant: fires when the condition predicate changes', () => {
  const a = baseSem();
  const b = baseSem();
  b.clauses[0]!.conditions![0]!.predicate = 'disabled';
  const firings = checkConditionInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.match(firings[0]!.detail, /predicates differ/u);
});

test('protected-literal invariant: fires when a matched clause quantity value differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.limit = { type: 'quantity', value: 500, unit: 'usd' } as never;
  b.clauses[0]!.roles.limit = { type: 'quantity', value: 600, unit: 'usd' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.equal(firings[0]!.code, 'protected-literal');
});

test('protected-literal invariant: fires when a matched clause date value differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.deadline = { type: 'date', value: '2026-08-01' } as never;
  b.clauses[0]!.roles.deadline = { type: 'date', value: '2026-08-02' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
});

test('protected-literal invariant: does not fire when quantity/date values match', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.limit = { type: 'quantity', value: 500, unit: 'usd' } as never;
  b.clauses[0]!.roles.limit = { type: 'quantity', value: 500, unit: 'usd' } as never;
  assert.deepEqual(checkProtectedLiteralInvariant(a, b), []);
});

test('protected-literal invariant: fires when identifier id differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.target = { type: 'identifier', id: 'ticket-1234' } as never;
  b.clauses[0]!.roles.target = { type: 'identifier', id: 'ticket-5678' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.equal(firings[0]!.code, 'protected-literal');
  assert.match(firings[0]!.detail, /identifier/u);
});

test('protected-literal invariant: fires when identifier value differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.ref = { type: 'identifier', value: 'ABC-100' } as never;
  b.clauses[0]!.roles.ref = { type: 'identifier', value: 'ABC-200' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
});

test('protected-literal invariant: does not fire when identifier matches', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.target = { type: 'identifier', id: 'ticket-1234' } as never;
  b.clauses[0]!.roles.target = { type: 'identifier', id: 'ticket-1234' } as never;
  assert.deepEqual(checkProtectedLiteralInvariant(a, b), []);
});

test('protected-literal invariant: fires when range min/max differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.band = { type: 'range', min: 10, max: 50, unit: 'km' } as never;
  b.clauses[0]!.roles.band = { type: 'range', min: 10, max: 100, unit: 'km' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.match(firings[0]!.detail, /range/u);
});

test('protected-literal invariant: fires when range unit differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.band = { type: 'range', min: 0, max: 100, unit: 'km' } as never;
  b.clauses[0]!.roles.band = { type: 'range', min: 0, max: 100, unit: 'mi' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
});

test('protected-literal invariant: does not fire when range matches', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.band = { type: 'range', min: 0, max: 100, unit: 'km' } as never;
  b.clauses[0]!.roles.band = { type: 'range', min: 0, max: 100, unit: 'km' } as never;
  assert.deepEqual(checkProtectedLiteralInvariant(a, b), []);
});

test('protected-literal invariant: fires when url value differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.link = { type: 'url', value: 'https://example.com/a' } as never;
  b.clauses[0]!.roles.link = { type: 'url', value: 'https://example.com/b' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.match(firings[0]!.detail, /url/u);
});

test('protected-literal invariant: fires when path value differs', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.file = { type: 'path', value: '/home/user/doc.pdf' } as never;
  b.clauses[0]!.roles.file = { type: 'path', value: '/home/user/other.pdf' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
  assert.match(firings[0]!.detail, /path/u);
});

test('protected-literal invariant: url via ref field also fires on mismatch', () => {
  const a = baseSem();
  const b = baseSem();
  a.clauses[0]!.roles.link = { type: 'url', ref: 'https://example.com/a' } as never;
  b.clauses[0]!.roles.link = { type: 'url', ref: 'https://example.com/b' } as never;
  const firings = checkProtectedLiteralInvariant(a, b);
  assert.equal(firings.length, 1);
});

test('protected-literal invariant: does not fire for non-protected types like actor', () => {
  const a = baseSem();
  const b = baseSem();
  (a.clauses[0]!.roles.agent as Record<string, unknown>).value = 'old';
  (b.clauses[0]!.roles.agent as Record<string, unknown>).value = 'new';
  assert.deepEqual(checkProtectedLiteralInvariant(a, b), []);
});

test('checkHardInvariants: identical sems fire nothing', () => {
  const result = checkHardInvariants(baseSem(), baseSem());
  assert.deepEqual(result, { hardMismatch: false, invariants: [] });
});

test('compareSem (near-semantic) hard-fails a role swap regardless of its bag-of-features similarity', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const a = baseSem();
  const b = baseSem();
  (b.clauses[0]!.roles.agent as Record<string, unknown>).id = 'user';
  (b.clauses[0]!.conditions![0]!.roles.agent as Record<string, unknown>).id = 'assistant';
  const result = generator.compareSem(a, b);
  assert.equal(result.hardCompatible, false);
  assert.equal(result.hardMismatch, true);
  assert.equal(result.similarity, 0);
  assert.equal(result.similar, false);
  assert.ok(result.hardMismatchReasons?.some((reason) => reason.startsWith('role-identity')));
});

test('compareSem (core, exact/feature-recall) reports the same hard invariant firing', () => {
  const a = baseSem();
  const b = baseSem();
  b.clauses[0]!.conditions![0]!.negated = true;
  const comparison = compareSem(a, b);
  assert.equal(comparison.hardMismatch, true);
  assert.ok(comparison.hardInvariants.some((firing) => firing.code === 'negation-flip'));
});

test('all 8 former false-positive role-swap pairs from the #365 sweep are now hard mismatches', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  assert.equal(mutationV2.length, 80, 'sanity check: mutation-false-positive-v2.jsonl item count');
  for (const id of FORMER_FALSE_POSITIVE_IDS) {
    const item = mutationV2.find((entry) => entry.id === id);
    assert.ok(item, `expected ${id} in mutation-false-positive-v2.jsonl`);
    assert.equal(item!.mutationType, 'role');
    const source = mutationV2SourceById.get(item!.sourceItemId);
    assert.ok(source, `expected source ${item!.sourceItemId} in synthetic-mutation-sources-v1.jsonl`);
    const result = generator.compareSem(source!.goldSem, item!.goldSem);
    assert.equal(result.hardMismatch, true, `${id} must be a hard mismatch`);
    assert.equal(result.similarity, 0, `${id} must score 0 once hard-gated`);
    assert.equal(result.similar, false, `${id} must not be a near-match`);
    assert.ok(result.hardMismatchReasons?.some((reason) => reason.startsWith('role-identity')),
      `${id} must be caught specifically by the role-identity invariant, got: ${result.hardMismatchReasons?.join('; ')}`);
  }
});

test('all 8 true-positive pairs from the #365 sweep remain near-matches at 0.80', () => {
  for (const id of TRUE_POSITIVE_HELDOUT_IDS) {
    const item = heldout.find((entry) => entry.id === id);
    assert.ok(item, `expected ${id} in scorer-eval-heldout-v1.jsonl`);
    assert.equal(item!.label, 'positive');
    const generator = new NearSemanticFingerprintGenerator(0.8);
    const result = generator.compareSem(item!.semA, item!.semB);
    assert.equal(result.hardMismatch, false, `${id} must not be hard-gated: ${result.hardMismatchReasons?.join('; ')}`);
    assert.ok(result.similarity >= 0.8, `${id} must score >= 0.80, got ${result.similarity}`);
    assert.equal(result.similar, true, `${id} must remain a near-match`);
  }
});

test('the full mutation-false-positive-v2 corpus scores below 0.80 (precision holds at the frozen threshold)', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const stillAboveThreshold: string[] = [];
  for (const item of mutationV2) {
    const source = mutationV2SourceById.get(item.sourceItemId);
    if (!source) continue;
    const result = generator.compareSem(source.goldSem, item.goldSem);
    if (result.similarity >= 0.8) stillAboveThreshold.push(item.id);
  }
  assert.deepEqual(stillAboveThreshold, []);
});

// Additional tests for clause-path-aware role-identity invariant
test('role-identity invariant: detects deep-nested role swap in condition-condition', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'delete',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'concept', id: 'files' } },
      negated: false,
      conditions: [{
        predicate: 'confirmed',
        roles: { agent: { type: 'actor', id: 'user' } },
        negated: false,
        conditions: [{
          predicate: 'requested',
          roles: { agent: { type: 'actor', id: 'service' } },
          negated: false
        }]
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'delete',
      roles: { agent: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'files' } },
      negated: false,
      conditions: [{
        predicate: 'confirmed',
        roles: { agent: { type: 'actor', id: 'system' } },
        negated: false,
        conditions: [{
          predicate: 'requested',
          roles: { agent: { type: 'actor', id: 'service' } },
          negated: false
        }]
      }]
    }]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.ok(firings.length > 0, 'should detect role swap in deeply nested conditions');
  assert.ok(firings.every((firing) => firing.code === 'role-identity'));
});

test('role-identity invariant: detects role swap in consequence clause', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'approve',
      roles: { agent: { type: 'actor', id: 'manager' } },
      negated: false,
      consequences: [{
        predicate: 'grant',
        roles: { agent: { type: 'actor', id: 'system' }, recipient: { type: 'actor', id: 'user' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'approve',
      roles: { agent: { type: 'actor', id: 'manager' } },
      negated: false,
      consequences: [{
        predicate: 'grant',
        roles: { agent: { type: 'actor', id: 'user' }, recipient: { type: 'actor', id: 'system' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.ok(firings.length > 0, 'should detect role swap in consequence clauses');
  assert.ok(firings.every((firing) => firing.code === 'role-identity'));
});

test('role-identity invariant: detects role swap across multiple nested paths', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'execute',
      roles: { agent: { type: 'actor', id: 'admin' }, theme: { type: 'concept', id: 'command' } },
      negated: false,
      conditions: [{
        predicate: 'authorized',
        roles: { subject: { type: 'actor', id: 'user' } },
        negated: false
      }],
      consequences: [{
        predicate: 'log',
        roles: { agent: { type: 'actor', id: 'system' }, event: { type: 'concept', id: 'action' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'execute',
      roles: { agent: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'command' } },
      negated: false,
      conditions: [{
        predicate: 'authorized',
        roles: { subject: { type: 'actor', id: 'admin' } },
        negated: false
      }],
      consequences: [{
        predicate: 'log',
        roles: { agent: { type: 'actor', id: 'system' }, event: { type: 'concept', id: 'action' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.ok(firings.length > 0, 'should detect role swap across multiple nested paths');
});

test('role-identity invariant: does NOT fire when roles are preserved in deep nesting', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'archive',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'concept', id: 'data' } },
      negated: false,
      conditions: [{
        predicate: 'verified',
        roles: { subject: { type: 'actor', id: 'user' } },
        negated: false,
        conditions: [{
          predicate: 'confirmed',
          roles: { agent: { type: 'actor', id: 'system' } },
          negated: false
        }]
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'archive',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'concept', id: 'data' } },
      negated: false,
      conditions: [{
        predicate: 'verified',
        roles: { subject: { type: 'actor', id: 'user' } },
        negated: false,
        conditions: [{
          predicate: 'confirmed',
          roles: { agent: { type: 'actor', id: 'system' } },
          negated: false
        }]
      }]
    }]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.deepEqual(firings, [], 'should not fire when roles are preserved across all nesting levels');
});

test('role-identity invariant: handles multiple roles in same document with swap', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [
      {
        predicate: 'review',
        roles: { agent: { type: 'actor', id: 'reviewer' }, theme: { type: 'concept', id: 'proposal' } },
        negated: false
      },
      {
        predicate: 'approve',
        roles: { agent: { type: 'actor', id: 'approver' }, theme: { type: 'concept', id: 'proposal' } },
        negated: false
      }
    ]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [
      {
        predicate: 'review',
        roles: { agent: { type: 'actor', id: 'approver' }, theme: { type: 'concept', id: 'proposal' } },
        negated: false
      },
      {
        predicate: 'approve',
        roles: { agent: { type: 'actor', id: 'reviewer' }, theme: { type: 'concept', id: 'proposal' } },
        negated: false
      }
    ]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.ok(firings.length > 0, 'should detect role swap across multiple clauses');
  assert.ok(firings.every((firing) => firing.code === 'role-identity'));
});

test('role-identity invariant: does NOT fire on independent single role changes', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'create',
      roles: { agent: { type: 'actor', id: 'user_1' }, theme: { type: 'concept', id: 'document' } },
      negated: false
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'create',
      roles: { agent: { type: 'actor', id: 'user_2' }, theme: { type: 'concept', id: 'document' } },
      negated: false
    }]
  } as unknown as LunumSem;
  assert.deepEqual(checkRoleIdentityInvariant(a, b), [], 'should not fire for single isolated role changes');
});

test('role-identity invariant: detects swap between object fillers in different roles', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'notify',
      roles: {
        agent: { type: 'actor', id: 'system' },
        recipient: { type: 'actor', id: 'admin' }
      },
      negated: false,
      conditions: [{
        predicate: 'triggered',
        roles: { event: { type: 'concept', id: 'event_a' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'notify',
      roles: {
        agent: { type: 'actor', id: 'admin' },
        recipient: { type: 'actor', id: 'system' }
      },
      negated: false,
      conditions: [{
        predicate: 'triggered',
        roles: { event: { type: 'concept', id: 'event_a' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const firings = checkRoleIdentityInvariant(a, b);
  assert.ok(firings.length > 0, 'should detect role swap in the same clause between two roles');
});

test('role-identity invariant integration: hard-gates compareSem on deep-nested role swap', () => {
  const a = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'configure',
      roles: { agent: { type: 'actor', id: 'admin' } },
      negated: false,
      conditions: [{
        predicate: 'permission',
        roles: { subject: { type: 'actor', id: 'user' } },
        negated: false
      }],
      consequences: [{
        predicate: 'apply',
        roles: { agent: { type: 'actor', id: 'system' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const b = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement',
    clauses: [{
      predicate: 'configure',
      roles: { agent: { type: 'actor', id: 'user' } },
      negated: false,
      conditions: [{
        predicate: 'permission',
        roles: { subject: { type: 'actor', id: 'admin' } },
        negated: false
      }],
      consequences: [{
        predicate: 'apply',
        roles: { agent: { type: 'actor', id: 'system' } },
        negated: false
      }]
    }]
  } as unknown as LunumSem;
  const comparison = compareSem(a, b);
  assert.equal(comparison.hardMismatch, true, 'should report hard mismatch');
  assert.ok(comparison.hardInvariants.some((inv) => inv.code === 'role-identity'), 'should include role-identity firing');
});
