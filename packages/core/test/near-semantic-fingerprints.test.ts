import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint
} from '../src/near-semantic-fingerprints.js';
import type { LunumSem } from '../src/types.js';

function createSem(): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{
      predicate: 'prefer',
      roles: {
        experiencer: { type: 'concept', id: 'user' },
        theme: { type: 'concept', id: 'concise_answers' }
      },
      negated: false
    }]
  };
}

test('near-semantic fingerprints are deterministic, opaque, and order independent', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const first = createSem();
  const second = createSem();
  second.clauses[0]!.roles = {
    theme: second.clauses[0]!.roles.theme!,
    experiencer: second.clauses[0]!.roles.experiencer!
  };

  const fingerprint = generator.generate(first);
  assert.match(fingerprint, /^nfp:3:sha256:[a-f0-9]{64}:[a-f0-9]{64}:(?:-|(?:[a-f0-9]{16}\.)*[a-f0-9]{16})$/u);
  assert.equal(generator.generate(second), fingerprint);
  assert.equal(generator.compare(fingerprint, fingerprint).similarity, 1);
  assert.equal(fingerprint.includes('user'), false);
  assert.equal(fingerprint.includes('concise_answers'), false);
});

test('semantic and fingerprint comparison are symmetric for bounded identifier variation', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const first = createSem();
  const second = createSem();
  const experiencer = second.clauses[0]!.roles.experiencer;
  assert.ok(experiencer && typeof experiencer === 'object' && !Array.isArray(experiencer));
  experiencer.id = 'customer';

  const direct = generator.compareSem(first, second);
  const forward = generator.compare(generator.generate(first), generator.generate(second));
  const reverse = generator.compare(generator.generate(second), generator.generate(first));

  assert.equal(forward.similarity, reverse.similarity);
  assert.equal(forward.similarity, direct.similarity);
  assert.ok(forward.similarity >= 0.8);
  assert.equal(forward.similar, true);
  assert.equal(forward.hardCompatible, true);
});

test('near-semantic references ignore surface language but retain grounded referents', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const english = createSem();
  english.references = [{ type: 'pronoun', token: 'she', language: 'en', ref: 'maria' }];
  const greek = createSem();
  greek.references = [{ type: 'implicit_subject', token: 'θα', language: 'el', ref: 'maria' }];
  assert.equal(generator.generate(english), generator.generate(greek));

  const changedReferent = createSem();
  changedReferent.references = [{ type: 'pronoun', token: 'she', language: 'en', ref: 'daniel' }];
  const result = generator.compareSem(english, changedReferent);
  assert.equal(result.similar, false);
  assert.equal(result.hardCompatible, false);
});

test('schema, negation, modality, kind, and extra clauses fail closed', () => {
  const generator = new NearSemanticFingerprintGenerator(0.5);
  const mutations: LunumSem[] = [];

  const differentSchema = createSem();
  differentSchema.schema = 'lunum-sem/0.2';
  mutations.push(differentSchema);

  const negated = createSem();
  negated.clauses[0]!.negated = true;
  mutations.push(negated);

  const modal = createSem();
  modal.clauses[0]!.modality = 'possible';
  mutations.push(modal);

  const differentKind = createSem();
  differentKind.kind = 'command';
  mutations.push(differentKind);

  const extraClause = createSem();
  extraClause.clauses.push({ predicate: 'delete', roles: { object: 'file' }, negated: false });
  mutations.push(extraClause);

  for (const mutation of mutations) {
    const result = generator.compareSem(createSem(), mutation);
    assert.equal(result.similarity, 0);
    assert.equal(result.similar, false);
    assert.equal(result.hardCompatible, false);
    assert.ok((result.hardMismatchReasons?.length ?? 0) > 0);
  }
});

test('primitive literals and references are hard compatibility constraints', () => {
  const generator = new NearSemanticFingerprintGenerator(0.1);
  const first = createSem();
  first.clauses[0]!.roles.deadline = { type: 'date', value: '2026-08-01' };
  const changed = createSem();
  changed.clauses[0]!.roles.deadline = { type: 'date', value: '2026-08-02' };

  const result = generator.compareSem(first, changed);
  assert.equal(result.similar, false);
  assert.equal(result.similarity, 0);
  assert.match(result.hardMismatchReasons?.join('\n') ?? '', /typed literal|reference value/u);
});

test('hard literals preserve primitive types', () => {
  const generator = new NearSemanticFingerprintGenerator(0.1);
  const pairs: Array<[string | number | boolean, string | number | boolean]> = [
    [1, '1'],
    [true, 'true'],
    [false, 'false']
  ];

  for (const [left, right] of pairs) {
    const first = createSem();
    const second = createSem();
    first.clauses[0]!.roles.value = left;
    second.clauses[0]!.roles.value = right;
    const result = generator.compareSem(first, second);
    assert.equal(result.similar, false);
    assert.equal(result.similarity, 0);
    assert.equal(result.hardCompatible, false);
  }
});

test('hard literals preserve multiplicity', () => {
  const generator = new NearSemanticFingerprintGenerator(0.1);
  const first = createSem();
  const second = createSem();
  first.clauses[0]!.roles.items = [1, 1];
  second.clauses[0]!.roles.items = [1];

  const result = generator.compareSem(first, second);
  assert.equal(result.similar, false);
  assert.equal(result.similarity, 0);
  assert.match(result.hardMismatchReasons?.join('\n') ?? '', /multiplicity/u);
});

test('explicit protected literals are also enforced', () => {
  const generator = new NearSemanticFingerprintGenerator(0.1);
  const changed = createSem();
  const theme = changed.clauses[0]!.roles.theme;
  assert.ok(theme && typeof theme === 'object' && !Array.isArray(theme));
  theme.id = 'verbose_answers';

  const result = generator.compareSem(createSem(), changed, {
    protectedLiterals: ['concise_answers']
  });

  assert.equal(result.similar, false);
  assert.equal(result.similarity, 0);
  assert.match(result.hardMismatchReasons?.join('\n') ?? '', /protected literal differs/u);
});

test('legacy, malformed, identical malformed, and checksum-mismatched fingerprints fail closed', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const first = 'nfp:12345678' as NearSemanticFingerprint;
  const second = 'nfp:87654321' as NearSemanticFingerprint;
  for (const [left, right] of [[first, second], [first, first]] as const) {
    const invalid = generator.compare(left, right);
    assert.equal(invalid.similarity, 0);
    assert.equal(invalid.similar, false);
    assert.match(invalid.hardMismatchReasons?.join('\n') ?? '', /Invalid or checksum-mismatched/u);
  }

  const valid = generator.generate(createSem());
  const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}` as NearSemanticFingerprint;
  const tamperedResult = generator.compare(valid, tampered);
  assert.equal(tamperedResult.similarity, 0);
  assert.equal(tamperedResult.similar, false);
  assert.match(tamperedResult.hardMismatchReasons?.join('\n') ?? '', /Invalid or checksum-mismatched/u);
});

test('nfp:2 fingerprints fail closed and must be regenerated before comparison', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const current = generator.generate(createSem());
  const legacy = current.replace(/^nfp:3:/u, 'nfp:2:') as NearSemanticFingerprint;
  const result = generator.compare(current, legacy);
  assert.equal(result.similar, false);
  assert.equal(result.hardCompatible, false);
  assert.match(result.hardMismatchReasons?.join('\n') ?? '', /Invalid or checksum-mismatched/u);
});

test('empty semantic feature sketches remain valid and comparable', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const empty: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: []
  };
  const fingerprint = generator.generate(empty);
  assert.match(fingerprint, /:-$/u);
  const result = generator.compare(fingerprint, fingerprint);
  assert.equal(result.similar, true);
  assert.equal(result.similarity, 1);
  assert.equal(result.matchedWeight, 0);
  assert.equal(result.totalWeight, 0);
});

test('compareRecords delegates to semantic comparison', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const result = generator.compareRecords(
    { sem: createSem() } as never,
    { sem: createSem() } as never
  );
  assert.equal(result.similarity, 1);
  assert.equal(result.similar, true);
});

function createRoleSwapSem(agentAssistantFirst: boolean): LunumSem {
  const assistant = { type: 'actor', id: 'assistant' };
  const user = { type: 'actor', id: 'user' };
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'command',
    clauses: [{
      predicate: 'delete',
      roles: {
        agent: agentAssistantFirst ? assistant : user,
        theme: { type: 'concept', id: 'files' }
      },
      negated: false,
      conditions: [{
        predicate: 'confirmed',
        roles: {
          agent: agentAssistantFirst ? user : assistant
        },
        negated: false
      }]
    }]
  };
}

test('near-semantic score is bound to clause context and detects agent-role swaps', () => {
  const generator = new NearSemanticFingerprintGenerator(0.8);
  const base = createRoleSwapSem(true);
  const swapped = createRoleSwapSem(false);

  // Identical sems still score a perfect match.
  const identical = generator.compareSem(base, base);
  assert.equal(identical.similarity, 1);

  // Swapping which actor fills `agent` in the root clause vs. the condition clause
  // must now be detectable: previously the role-filler features were not bound to
  // their clause, so `role-id:agent:assistant` / `role-id:agent:user` formed an
  // identical multiset regardless of which clause each id belonged to, and this
  // scored a perfect 1.0 match. With clause-context binding
  // (`role-id:<predicate>:<role>:<id>`), the swap produces different feature keys.
  const swappedResult = generator.compareSem(base, swapped);
  assert.ok(
    swappedResult.similarity < 1,
    `expected role swap to be detectable (similarity < 1), got ${swappedResult.similarity}`
  );

  // A near-match that does NOT swap roles across clauses (just changes an unrelated
  // id) should still score reasonably high, showing the fix did not globally wreck
  // the metric's tolerance for minor identifier variation.
  const near = createRoleSwapSem(true);
  const theme = near.clauses[0]!.roles.theme;
  assert.ok(theme && typeof theme === 'object' && !Array.isArray(theme));
  theme.id = 'documents';
  const nearResult = generator.compareSem(base, near);
  assert.ok(
    nearResult.similarity >= 0.8,
    `expected unrelated near-match to remain high, got ${nearResult.similarity}`
  );
});

test('stored nfp comparison hard-rejects an actor authority swap without original Sem', () => {
  const generator = new NearSemanticFingerprintGenerator(0);
  const result = generator.compare(
    generator.generate(createRoleSwapSem(true)),
    generator.generate(createRoleSwapSem(false))
  );
  assert.equal(result.similarity, 0);
  assert.equal(result.similar, false);
  assert.equal(result.hardCompatible, false);
});

test('full clause paths keep repeated predicates from collapsing into one role-feature bag', () => {
  const generator = new NearSemanticFingerprintGenerator(1);
  const base: LunumSem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [{
      predicate: 'permit', roles: { subject: { type: 'concept', id: 'request' } }, negated: false,
      conditions: [
        { predicate: 'confirmed', roles: { agent: { type: 'concept', id: 'alice' } }, negated: false },
        { predicate: 'confirmed', roles: { agent: { type: 'concept', id: 'bob' } }, negated: false }
      ]
    }]
  };
  const swapped = structuredClone(base);
  const conditions = swapped.clauses[0]!.conditions!;
  conditions[0]!.roles.agent = { type: 'concept', id: 'bob' };
  conditions[1]!.roles.agent = { type: 'concept', id: 'alice' };

  const storedResult = generator.compare(generator.generate(base), generator.generate(swapped));
  assert.ok(storedResult.similarity < 1, `expected repeated-predicate swap to alter stored features, got ${storedResult.similarity}`);
  assert.equal(storedResult.similar, false);
});

test('threshold must remain in the inclusive zero-to-one range', () => {
  const generator = new NearSemanticFingerprintGenerator(0.9);
  assert.equal(generator.getThreshold(), 0.9);
  generator.setThreshold(0.95);
  assert.equal(generator.getThreshold(), 0.95);
  assert.throws(() => generator.setThreshold(-0.1), RangeError);
  assert.throws(() => generator.setThreshold(1.1), RangeError);
  assert.throws(() => new NearSemanticFingerprintGenerator(Number.NaN), RangeError);
});
