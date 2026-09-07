import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHardInvariants } from '../src/semantic-invariants.js';
import { NearSemanticFingerprintGenerator } from '../src/near-semantic-fingerprints.js';
import { validateSem } from '../src/canonicalize.js';
import { createRecord } from '../src/derive.js';
import type { LunumSem } from '../src/types.js';

interface CriticalDifference {
  id: string;
  dimension: string;
  sourceTextA: string;
  sourceTextB: string;
  semA: LunumSem;
  semB: LunumSem;
  expectedInvariant?: string;
}

async function findWorkspaceRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  for (;;) {
    try {
      await access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`workspace root not found above ${start}`);
      current = parent;
    }
  }
}

const workspaceRoot = await findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const datasetPath = path.join(workspaceRoot, 'datasets/adversarial/critical-semantic-differences-v1.jsonl');
const items: CriticalDifference[] = (await readFile(datasetPath, 'utf8'))
  .split(/\r?\n/u)
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as CriticalDifference);

test('critical semantic difference corpus is broad, unique, and schema-valid', () => {
  assert.ok(items.length >= 14);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.equal(validateSem(item.semA).ok, true, `${item.id}: Sem A must validate`);
    assert.equal(validateSem(item.semB).ok, true, `${item.id}: Sem B must validate`);
    assert.notEqual(item.sourceTextA, item.sourceTextB, `${item.id}: source texts must differ`);
  }
});

test('critical semantic differences are rejected by the gold-Sem matcher', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  for (const item of items) {
    const result = generator.compareSem(item.semA, item.semB);
    assert.equal(result.similar, false, `${item.id} must not be a near-match (score=${result.similarity})`);
    assert.equal(result.hardCompatible, false, `${item.id} must fail closed before scoring`);
    if (item.expectedInvariant) {
      const invariantCodes = result.hardMismatchReasons?.join('\n') ?? '';
      assert.match(invariantCodes, new RegExp(item.expectedInvariant.replace('-', '[ -]'), 'u'), `${item.id}: expected ${item.expectedInvariant}`);
    }
  }
});

test('role and predicate hard gates catch the mutations a weakened scorer would accept', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const targeted = items.filter((item) => ['source-vs-destination', 'subject-vs-object'].includes(item.id));
  assert.ok(targeted.length >= 2);
  for (const item of targeted) {
    const result = generator.compareSem(item.semA, item.semB);
    // This is the mutation oracle: the scorer must reject the mutation before
    // any similarity threshold can make it look equivalent.
    assert.equal(result.hardCompatible, false, `${item.id}: hard gate must be the rejection reason`);
    assert.equal(result.similar, false, `${item.id}: removing the hard gate would create a false positive`);
  }
});

test('predicate identity is a hard gate even when the surrounding roles are unchanged', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  for (const item of items.filter((candidate) => candidate.dimension === 'predicate')) {
    const result = generator.compareSem(item.semA, item.semB);
    assert.equal(result.hardCompatible, false, `${item.id}: predicate mutation must be hard-incompatible`);
    assert.equal(result.similar, false, `${item.id}: predicate mutation must be rejected`);
  }
});

test('schema-valid critical mutations remain untrusted when caller confidence is forged', () => {
  for (const item of items) {
    const record = createRecord({
      sem: item.semB,
      sourceText: item.sourceTextA,
      category: 'preference',
      risk: 'low',
      confidence: 1,
    });
    const trust = record.meta.semanticTrust as { status: string; promoted: boolean };
    assert.equal(trust.status, 'candidate', `${item.id}: forged confidence must not promote a mutation`);
    assert.equal(trust.promoted, false, `${item.id}: mutation must remain ineligible for durable semantics`);
    assert.equal(record.policy.eligible, false, `${item.id}: candidate mutation must not be eligible`);
  }
});

test('role identity invariant explicitly catches actor and argument reassignment', () => {
  for (const item of items.filter((candidate) => candidate.dimension === 'role-identity' && candidate.id !== 'alice-vs-bob')) {
    const result = checkHardInvariants(item.semA, item.semB);
    assert.equal(result.hardMismatch, true, `${item.id} must fire a role invariant`);
    assert.ok(result.invariants.some((invariant) => invariant.code === 'role-identity'), `${item.id} must identify role reassignment`);
  }
});
