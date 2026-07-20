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
        experiencer: { type: 'actor', id: 'user' },
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
  assert.match(fingerprint, /^nfp:2:sha256:[a-f0-9]{64}:[a-f0-9]{64}:(?:-|(?:[a-f0-9]{16}\.)*[a-f0-9]{16})$/u);
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

test('negation, modality, kind, and extra clauses fail closed', () => {
  const generator = new NearSemanticFingerprintGenerator(0.5);
  const mutations: LunumSem[] = [];

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
  assert.match(result.hardMismatchReasons?.join('\n') ?? '', /literal or reference values differ/u);
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

test('legacy, malformed, identical malformed, and tampered fingerprints fail closed', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const first = 'nfp:12345678' as NearSemanticFingerprint;
  const second = 'nfp:87654321' as NearSemanticFingerprint;
  for (const [left, right] of [[first, second], [first, first]] as const) {
    const invalid = generator.compare(left, right);
    assert.equal(invalid.similarity, 0);
    assert.equal(invalid.similar, false);
    assert.match(invalid.hardMismatchReasons?.join('\n') ?? '', /Invalid or tampered/u);
  }

  const valid = generator.generate(createSem());
  const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}` as NearSemanticFingerprint;
  const tamperedResult = generator.compare(valid, tampered);
  assert.equal(tamperedResult.similarity, 0);
  assert.equal(tamperedResult.similar, false);
  assert.match(tamperedResult.hardMismatchReasons?.join('\n') ?? '', /Invalid or tampered/u);
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

test('threshold must remain in the inclusive zero-to-one range', () => {
  const generator = new NearSemanticFingerprintGenerator(0.9);
  assert.equal(generator.getThreshold(), 0.9);
  generator.setThreshold(0.95);
  assert.equal(generator.getThreshold(), 0.95);
  assert.throws(() => generator.setThreshold(-0.1), RangeError);
  assert.throws(() => generator.setThreshold(1.1), RangeError);
  assert.throws(() => new NearSemanticFingerprintGenerator(Number.NaN), RangeError);
});
