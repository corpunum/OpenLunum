import test from 'node:test';
import assert from 'node:assert/strict';
import type { LunumSem } from '../src/types.js';
import {
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint,
} from '../src/near-semantic-fingerprints.js';

function makeSem(options: {
  schema?: string;
  world?: string;
  kind?: string;
  predicate?: string;
  subjectId?: string;
  objectId?: string;
  literal?: string;
  negated?: boolean;
  modality?: string | null;
} = {}): LunumSem {
  const roles: Record<string, unknown> = {
    subject: { type: 'entity', id: options.subjectId ?? 'paris' },
    object: { type: 'entity', id: options.objectId ?? 'france' },
  };
  if (options.literal !== undefined) roles.label = { type: 'text', value: options.literal };

  return {
    schema: options.schema ?? 'lunum-sem/0.2',
    world: options.world ?? 'real',
    kind: options.kind ?? 'fact',
    clauses: [{
      predicate: options.predicate ?? 'location',
      roles,
      negated: options.negated ?? false,
      ...(options.modality !== undefined ? { modality: options.modality } : {}),
    }],
    references: [],
    provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
    annotations: {},
  } as unknown as LunumSem;
}

function retrieve(
  generator: NearSemanticFingerprintGenerator,
  query: LunumSem,
  corpus: Array<{ id: string; sem: LunumSem }>,
): string[] {
  const queryFingerprint = generator.generate(query);
  return corpus
    .filter((item) => generator.compare(queryFingerprint, generator.generate(item.sem)).similar)
    .map((item) => item.id);
}

test('identical semantic records produce identical fingerprints and full similarity', () => {
  const generator = new NearSemanticFingerprintGenerator();
  const first = makeSem();
  const second = structuredClone(first);
  const fingerprint = generator.generate(first);

  assert.equal(generator.generate(second), fingerprint);
  const comparison = generator.compare(fingerprint, fingerprint);
  assert.equal(comparison.similarity, 1);
  assert.equal(comparison.similar, true);
  assert.equal(comparison.hardCompatible, true);
});

test('bounded identifier variation is symmetric near-semantic similarity', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  const first = makeSem({ subjectId: 'paris' });
  const second = makeSem({ subjectId: 'city-paris' });
  const forward = generator.compareSem(first, second);
  const reverse = generator.compareSem(second, first);

  assert.equal(forward.similarity, reverse.similarity);
  assert.ok(forward.similarity >= 0.7);
  assert.equal(forward.similar, true);
  assert.equal(forward.hardCompatible, true);
});

test('threshold changes the decision without changing the score', () => {
  const first = makeSem({ subjectId: 'paris' });
  const second = makeSem({ subjectId: 'city-paris' });
  const low = new NearSemanticFingerprintGenerator(0.7).compareSem(first, second);
  const high = new NearSemanticFingerprintGenerator(0.95).compareSem(first, second);

  assert.equal(low.similarity, high.similarity);
  assert.equal(low.similar, true);
  assert.equal(high.similar, false);
});

test('schema, world, kind, structure, negation, modality, and typed literals are hard constraints', () => {
  const generator = new NearSemanticFingerprintGenerator(0);
  const source = makeSem({ literal: 'Paris' });
  const mutations = [
    makeSem({ schema: 'lunum-sem/0.1-draft', literal: 'Paris' }),
    makeSem({ world: 'fiction', literal: 'Paris' }),
    makeSem({ kind: 'preference', literal: 'Paris' }),
    makeSem({ negated: true, literal: 'Paris' }),
    makeSem({ modality: 'possibility', literal: 'Paris' }),
    makeSem({ literal: 'PARIS' }),
  ];

  for (const mutation of mutations) {
    const result = generator.compareSem(source, mutation);
    assert.equal(result.similar, false);
    assert.equal(result.similarity, 0);
    assert.equal(result.hardCompatible, false);
    assert.ok((result.hardMismatchReasons?.length ?? 0) > 0);
  }
});

test('predicate identifiers are hard semantic identity', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  const result = generator.compareSem(
    makeSem({ predicate: 'location' }),
    makeSem({ predicate: 'price' }),
  );

  assert.equal(result.hardCompatible, false);
  assert.equal(result.similarity, 0);
  assert.equal(result.similar, false);
});

test('fingerprints use the versioned checksum and opaque feature-sketch format', () => {
  const fingerprint = new NearSemanticFingerprintGenerator().generate(makeSem());
  assert.match(
    fingerprint,
    /^nfp:3:sha256:[a-f0-9]{64}:[a-f0-9]{64}:(?:-|(?:[a-f0-9]{16}\.)*[a-f0-9]{16})$/u,
  );
  assert.equal(fingerprint.includes('paris'), false);
  assert.equal(fingerprint.includes('france'), false);
});

test('malformed, legacy, and checksum-mismatched fingerprints fail closed', () => {
  const generator = new NearSemanticFingerprintGenerator(0);
  const valid = generator.generate(makeSem());
  const malformed: NearSemanticFingerprint[] = [
    'nfp:12345678',
    'nfp:3:sha256:not-a-checksum',
    `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`,
  ];

  for (const candidate of malformed) {
    const result = generator.compare(valid, candidate);
    assert.equal(result.similar, false);
    assert.equal(result.similarity, 0);
    assert.equal(result.hardCompatible, false);
  }
});

test('near-semantic retrieval improves recall only for compatible identifier variation', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  const query = makeSem({ subjectId: 'paris' });
  const corpus = [
    { id: 'exact', sem: makeSem({ subjectId: 'paris' }) },
    { id: 'near-id', sem: makeSem({ subjectId: 'city-paris' }) },
    { id: 'other-id', sem: makeSem({ subjectId: 'london' }) },
    { id: 'hard-literal-change', sem: makeSem({ subjectId: 'paris', literal: 'different' }) },
    { id: 'hard-predicate-change', sem: makeSem({ subjectId: 'paris', predicate: 'price' }) },
  ];

  const queryFingerprint = generator.generate(query);
  const exactMatches = corpus.filter((item) => generator.generate(item.sem) === queryFingerprint).map((item) => item.id);
  const nearMatches = retrieve(generator, query, corpus);
  const relevant = new Set(['exact', 'near-id']);
  const exactRecall = exactMatches.filter((id) => relevant.has(id)).length / relevant.size;
  const nearRecall = nearMatches.filter((id) => relevant.has(id)).length / relevant.size;

  assert.deepEqual(exactMatches, ['exact']);
  assert.ok(nearMatches.includes('exact'));
  assert.ok(nearMatches.includes('near-id'));
  assert.equal(nearMatches.includes('hard-literal-change'), false);
  assert.equal(nearMatches.includes('hard-predicate-change'), false);
  assert.ok(nearRecall > exactRecall);
});

test('false-positive measurement reports no hard-incompatible matches', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  const query = makeSem({ subjectId: 'paris', literal: 'France' });
  const corpus = [
    { id: 'relevant-exact', relevant: true, sem: makeSem({ subjectId: 'paris', literal: 'France' }) },
    { id: 'relevant-near', relevant: true, sem: makeSem({ subjectId: 'city-paris', literal: 'France' }) },
    { id: 'wrong-literal', relevant: false, sem: makeSem({ subjectId: 'paris', literal: 'Germany' }) },
    { id: 'wrong-kind', relevant: false, sem: makeSem({ subjectId: 'paris', literal: 'France', kind: 'preference' }) },
    { id: 'wrong-modality', relevant: false, sem: makeSem({ subjectId: 'paris', literal: 'France', modality: 'possibility' }) },
  ];

  const matches = new Set(retrieve(generator, query, corpus));
  const retrieved = corpus.filter((item) => matches.has(item.id));
  const falsePositives = retrieved.filter((item) => !item.relevant);

  assert.ok(matches.has('relevant-exact'));
  assert.ok(matches.has('relevant-near'));
  assert.equal(falsePositives.length, 0);
});

test('compareRecords and threshold mutation preserve the same semantics', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  const first = { sem: makeSem({ subjectId: 'paris' }) } as never;
  const second = { sem: makeSem({ subjectId: 'city-paris' }) } as never;
  const before = generator.compareRecords(first, second);
  generator.setThreshold(0.95);
  const after = generator.compareRecords(first, second);

  assert.equal(before.similarity, after.similarity);
  assert.equal(before.similar, true);
  assert.equal(after.similar, false);
  assert.throws(() => generator.setThreshold(-0.01), RangeError);
  assert.throws(() => generator.setThreshold(1.01), RangeError);
});

test('adversarial retrieval attacks are rejected by hard constraints', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  
  // Create a query that should match a document about Paris
  const query = makeSem({ subjectId: 'paris', literal: 'France' });
  
  // Create a corpus with a legitimate document
  const legitimateDoc = { 
    id: 'legitimate', 
    sem: makeSem({ subjectId: 'paris', literal: 'France' }) 
  };
  
  // Create an adversarial document that tries to bypass hard constraints
  // by changing the literal but keeping other fields the same (should still be rejected)
  const adversarialDoc = { 
    id: 'adversarial', 
    sem: makeSem({ subjectId: 'paris', literal: 'Germany' }) 
  };
  
  const corpus = [legitimateDoc, adversarialDoc];
  
  const matches = new Set(retrieve(generator, query, corpus));
  
  // Only the legitimate document should match
  assert.ok(matches.has('legitimate'));
  assert.equal(matches.size, 1);
  
  // The adversarial document should not match because of hard constraint on literal
  assert.equal(matches.has('adversarial'), false);
});

test('retrieval is robust against adversarial modifications that attempt to evade filtering', () => {
  const generator = new NearSemanticFingerprintGenerator(0.7);
  
  // Query for Paris-related information
  const query = makeSem({ subjectId: 'paris', kind: 'fact' });
  
  // Legitimate document with matching hard fields
  const legitimateDoc = { id: 'paris-location', sem: makeSem({ subjectId: 'paris', kind: 'fact' }) };

  // Adversarial documents that try to evade by changing hard-constraint fields
  const adversarialDocs = [
    { id: 'schema-adversarial', sem: makeSem({ subjectId: 'paris', schema: 'lunum-sem/0.1', kind: 'fact' }) },
    { id: 'world-adversarial', sem: makeSem({ subjectId: 'paris', world: 'fiction', kind: 'fact' }) },
    { id: 'kind-adversarial', sem: makeSem({ subjectId: 'paris', kind: 'preference' }) },
  ];

  const corpus = [legitimateDoc, ...adversarialDocs];

  const matches = new Set(retrieve(generator, query, corpus));

  // Only the legitimate document should match
  assert.ok(matches.has('paris-location'));
  assert.equal(matches.size, 1);

  // Adversarial documents should not match due to hard constraints
  assert.equal(matches.has('schema-adversarial'), false);
  assert.equal(matches.has('world-adversarial'), false);
  assert.equal(matches.has('kind-adversarial'), false);
});
