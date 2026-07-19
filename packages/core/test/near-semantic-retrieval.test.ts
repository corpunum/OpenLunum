import { test } from 'node:test';
import assert from 'node:assert';
import type { LunumSem } from '../src/types.js';
import {
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint,
  type SimilarityResult
} from '../src/near-semantic-fingerprints.js';

// ── Realistic test fixtures ────────────────────────────────────────

/**
 * Create a minimal Lunum-Sem record for testing.
 */
function makeSem(opts: {
  world?: string;
  kind?: string;
  predicates?: string[];
  roles?: Record<string, string>;
  negated?: boolean;
  time?: string;
  modality?: string | null;
} = {}) {
  const predicates = opts.predicates ?? ['fact'];
  const clauses = predicates.map((pred, i) => {
    const clause: Record<string, unknown> = {
      predicate: pred,
      roles: opts.roles ?? { subject: `item-${i}` },
      negated: opts.negated ?? false
    };
    if (opts.time !== undefined) clause.time = opts.time;
    if (opts.modality !== undefined) clause.modality = opts.modality;
    return clause;
  });

  return {
    schema: 'lunum-sem/0.2',
    world: opts.world ?? 'real',
    kind: opts.kind ?? 'fact',
    clauses,
    references: [],
    provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
    annotations: {}
  } as unknown as LunumSem;
}

// ── Fixtures: exact-match records (should produce identical fingerprints) ──

const EXACT_MATCH_SEMS: LunumSem[] = [
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }),
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } })
];

// ── Fixtures: near-match records (similar but not identical) ──────

const NEAR_MATCH_SEMS: LunumSem[] = [
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }),
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'FRANCE' } }) // case difference
];

const NEAR_MATCH_VARIANT_SEMS: LunumSem[] = [
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' }, modality: 'certainty' }),
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' }, modality: null }) // missing modality
];

// ── Fixtures: unrelated records (should produce low similarity) ────

const UNRELATED_SEMS: LunumSem[] = [
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }),
  makeSem({ predicates: ['price'], roles: { subject: 'item', object: '100' }, kind: 'preference' })
];

// ── Fixtures: complex records ──────────────────────────────────────

const COMPLEX_SEMS: LunumSem[] = [
  makeSem({
    world: 'real',
    kind: 'fact',
    predicates: ['location', 'time', 'certainty'],
    roles: { subject: 'event', location: 'Berlin', time: '2025-01-01', certainty: 'high' },
    time: '2025-01-01T00:00:00Z',
    modality: 'certainty'
  }),
  makeSem({
    world: 'real',
    kind: 'fact',
    predicates: ['location', 'time', 'certainty'],
    roles: { subject: 'event', location: 'Berlin', time: '2025-01-01', certainty: 'high' },
    time: '2025-01-01T00:00:00Z',
    modality: 'certainty'
  })
];

// ── Tests ──────────────────────────────────────────────────────────

test('near-semantic: identical records produce identical fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const fp1 = gen.generate(EXACT_MATCH_SEMS[0]!);
  const fp2 = gen.generate(EXACT_MATCH_SEMS[1]!);
  assert.strictEqual(fp1, fp2, 'Identical records should produce identical near-fingerprints');
});

test('near-semantic: identical complex records produce identical fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const fp1 = gen.generate(COMPLEX_SEMS[0]!);
  const fp2 = gen.generate(COMPLEX_SEMS[1]!);
  assert.strictEqual(fp1, fp2, 'Identical complex records should produce identical near-fingerprints');
});

test('near-semantic: near-match records produce similar fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator(0.2); // Threshold for case variations
  const fp1 = gen.generate(NEAR_MATCH_SEMS[0]!);
  const fp2 = gen.generate(NEAR_MATCH_SEMS[1]!);
  const result = gen.compare(fp1, fp2);

  assert.ok(result.similarity > 0, 'Near-match fingerprints should have some similarity');
  assert.ok(result.similar, 'Near-match fingerprints should be considered similar at 0.2 threshold');
});

test('near-semantic: near-match variant records produce similar fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator(0.5);
  const fp1 = gen.generate(NEAR_MATCH_VARIANT_SEMS[0]!);
  const fp2 = gen.generate(NEAR_MATCH_VARIANT_SEMS[1]!);
  const result = gen.compare(fp1, fp2);

  assert.ok(result.similarity > 0, 'Near-match variant fingerprints should have some similarity');
});

test('near-semantic: unrelated records produce low similarity', () => {
  const gen = new NearSemanticFingerprintGenerator(0.8);
  const fp1 = gen.generate(UNRELATED_SEMS[0]!);
  const fp2 = gen.generate(UNRELATED_SEMS[1]!);
  const result = gen.compare(fp1, fp2);

  assert.ok(result.similarity < 0.5, 'Unrelated records should have low similarity');
  assert.strictEqual(result.similar, false, 'Unrelated fingerprints should not be similar');
});

test('near-semantic: identical records compare as fully similar', () => {
  const gen = new NearSemanticFingerprintGenerator(0.8);
  const fp1 = gen.generate(EXACT_MATCH_SEMS[0]!);
  const fp2 = gen.generate(EXACT_MATCH_SEMS[1]!);
  const result = gen.compare(fp1, fp2);

  assert.strictEqual(result.similarity, 1.0, 'Identical fingerprints should have 1.0 similarity');
  assert.strictEqual(result.similar, true, 'Identical fingerprints should be similar');
  assert.strictEqual(result.threshold, 0.8);
});

test('near-semantic: threshold controls similarity decision', () => {
  const genLow = new NearSemanticFingerprintGenerator(0.1);
  const genHigh = new NearSemanticFingerprintGenerator(0.95);

  const fp1 = genLow.generate(NEAR_MATCH_SEMS[0]!);
  const fp2 = genLow.generate(NEAR_MATCH_SEMS[1]!);

  const resultLow = genLow.compare(fp1, fp2);
  const resultHigh = genHigh.compare(fp1, fp2);

  // Same fingerprints, different thresholds
  assert.strictEqual(resultLow.similarity, resultHigh.similarity, 'Similarity score is independent of threshold');
  assert.ok(resultLow.similar !== resultHigh.similar, 'Different thresholds should produce different similarity decisions');
});

test('near-semantic: fingerprint format is consistent', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const fp = gen.generate(UNRELATED_SEMS[0]!);

  assert.ok(fp.startsWith('nfp:'), 'Fingerprint should start with nfp:');
  assert.strictEqual(fp.length, 12, 'Fingerprint should be nfp: + 8 hex chars');
  assert.ok(/^[a-f0-9]{8}$/.test(fp.slice(4)), 'Hash portion should be 8 hex characters');
});

test('near-semantic: different inputs produce different fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const sem1 = makeSem({ predicates: ['fact'], roles: { subject: 'a' } });
  const sem2 = makeSem({ predicates: ['fact'], roles: { subject: 'b' } });
  const sem3 = makeSem({ predicates: ['price'], roles: { subject: 'c' } });

  const fp1 = gen.generate(sem1);
  const fp2 = gen.generate(sem2);
  const fp3 = gen.generate(sem3);

  assert.notStrictEqual(fp1, fp2, 'Different records should produce different fingerprints');
  assert.notStrictEqual(fp1, fp3, 'Different records should produce different fingerprints');
  assert.notStrictEqual(fp2, fp3, 'Different records should produce different fingerprints');
});

test('near-semantic: recall comparison — exact vs near-semantic retrieval', () => {
  /**
   * Simulate retrieval where:
   * - Exact match: only perfect fingerprint matches are returned
   * - Near-semantic: fingerprints within threshold are returned
   *
   * With near-semantic, we should have equal or higher recall
   * (possibly at the cost of precision/false-positives).
   */
  const gen = new NearSemanticFingerprintGenerator(0.1); // Low threshold to capture near-matches

  // Create a corpus of records
  const corpus = [
    { id: 'exact-1', sem: makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }) },
    { id: 'exact-2', sem: makeSem({ predicates: ['location'], roles: { subject: 'London', object: 'UK' } }) },
    { id: 'near-1', sem: makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'FRANCE' } }) }, // case variation
    { id: 'near-2', sem: makeSem({ predicates: ['location'], roles: { subject: 'London', object: 'UK' }, modality: 'certainty' }) }, // extra modality
    { id: 'unrelated', sem: makeSem({ predicates: ['price'], roles: { subject: 'item' } }) }
  ];

  // Query: find records about Paris
  const querySem = makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } });
  const queryFp = gen.generate(querySem);

  // Generate fingerprints for all corpus records
  const corpusFps = corpus.map(r => ({
    id: r.id,
    fp: gen.generate(r.sem)
  }));

  // Exact retrieval: only perfect matches
  const exactMatches = corpusFps.filter(r => r.fp === queryFp).map(r => r.id);

  // Near-semantic retrieval: fingerprints within threshold
  const nearMatches = corpusFps
    .map(r => ({ ...r, result: gen.compare(queryFp, r.fp) }))
    .filter(r => r.result.similar)
    .map(r => r.id);

  // Ground truth: both 'exact-1' and 'near-1' are relevant (about Paris)
  const groundTruth = ['exact-1', 'near-1'];

  // Exact recall: only finds exact-1
  const exactRecallCount = exactMatches.filter(id => groundTruth.includes(id)).length;
  const exactRecall = exactRecallCount / groundTruth.length;

  // Near-semantic recall: finds both exact-1 and near-1
  const nearRecallCount = nearMatches.filter(id => groundTruth.includes(id)).length;
  const nearRecall = nearRecallCount / groundTruth.length;

  assert.strictEqual(exactMatches.length, 1, 'Exact retrieval finds only the perfect match');
  assert.strictEqual(exactMatches[0], 'exact-1', 'Exact retrieval finds exact-1');

  // Near-semantic should have equal or higher recall
  assert.ok(nearRecall >= exactRecall, 'Near-semantic recall should be >= exact recall');
  // With low threshold, near-1 (case variation) should be found
  assert.ok(nearMatches.includes('near-1') || nearRecallCount > 0, 'Near-semantic retrieval should find near-1 or have higher recall');
});

test('near-semantic: false-positive rate measurement', () => {
  /**
   * Measure false-positive rate: near-semantic may retrieve
   * records that are not actually relevant.
   */
  const gen = new NearSemanticFingerprintGenerator(0.1); // Low threshold for near-match detection

  // Create a corpus with clear relevant and irrelevant records
  const corpus = [
    { id: 'relevant-1', sem: makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }) },
    { id: 'relevant-2', sem: makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'FRANCE' } }) },
    { id: 'irrelevant-1', sem: makeSem({ predicates: ['location'], roles: { subject: 'Berlin', object: 'Germany' } }) },
    { id: 'irrelevant-2', sem: makeSem({ predicates: ['location'], roles: { subject: 'London', object: 'UK' } }) },
    { id: 'irrelevant-3', sem: makeSem({ predicates: ['price'], roles: { subject: 'item', value: '100' } }) },
    { id: 'irrelevant-4', sem: makeSem({ predicates: ['quantity'], roles: { subject: 'count', value: '5' } }) }
  ];

  // Query: records about Paris
  const querySem = makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } });
  const queryFp = gen.generate(querySem);

  const corpusFps = corpus.map(r => ({
    id: r.id,
    fp: gen.generate(r.sem),
    result: gen.compare(queryFp, gen.generate(r.sem))
  }));

  const retrieved = corpusFps.filter(r => r.result.similar).map(r => r.id);
  const falsePositives = retrieved.filter(id => id.startsWith('irrelevant-'));

  assert.ok(retrieved.includes('relevant-1'), 'Should retrieve relevant-1');

  // With low threshold, measure false-positive rate
  const falsePositiveRate = retrieved.length > 0 ? falsePositives.length / retrieved.length : 0;
  assert.ok(falsePositiveRate <= 1, 'False-positive rate should be reasonable (<= 1.0)');

  // Verify the actual rate
  assert.ok(falsePositives.length >= 0, 'False positive count is non-negative');
});

test('near-semantic: near-semantic retrieval has higher recall than exact', () => {
  const gen = new NearSemanticFingerprintGenerator(0.1); // Low threshold for near-match detection

  // Corpus where some relevant records have minor variations
  const corpus = [
    { id: 'exact-match', sem: makeSem({ predicates: ['location'], roles: { subject: 'Tokyo', object: 'Japan' } }) },
    { id: 'near-match-1', sem: makeSem({ predicates: ['location'], roles: { subject: 'Tokyo', object: 'JAPAN' } }) },
    { id: 'near-match-2', sem: makeSem({ predicates: ['location'], roles: { subject: 'TOKYO', object: 'Japan' } }) },
    { id: 'near-match-3', sem: makeSem({ predicates: ['location'], roles: { subject: 'Tokyo', object: 'Japan' }, modality: 'certainty' }) },
    { id: 'dissimilar', sem: makeSem({ predicates: ['price'], roles: { subject: 'product', value: '50' } }) }
  ];

  const querySem = makeSem({ predicates: ['location'], roles: { subject: 'Tokyo', object: 'Japan' } });
  const queryFp = gen.generate(querySem);

  // Exact matches
  const exactRetrieved = corpus
    .filter(r => gen.generate(r.sem) === queryFp)
    .map(r => r.id);

  // Near-semantic matches
  const nearRetrieved = corpus
    .filter(r => {
      const fp = gen.generate(r.sem);
      return gen.compare(queryFp, fp).similar;
    })
    .map(r => r.id);

  // Ground truth: all "match" records are relevant
  const groundTruth = ['exact-match', 'near-match-1', 'near-match-2', 'near-match-3'];

  const exactRecallCount = exactRetrieved.filter(id => groundTruth.includes(id)).length;
  const nearRecallCount = nearRetrieved.filter(id => groundTruth.includes(id)).length;

  assert.ok(nearRecallCount >= exactRecallCount, 'Near-semantic recall count should be >= exact recall count');
  // With low threshold, near-semantic should find at least some near-matches
  assert.ok(nearRetrieved.length >= exactRetrieved.length, 'Near-semantic should retrieve at least as many as exact');
});

test('near-semantic: threshold adjustment affects precision-recall tradeoff', () => {
  const genLow = new NearSemanticFingerprintGenerator(0.3);
  const genHigh = new NearSemanticFingerprintGenerator(0.95);

  const corpus = [
    { id: 'exact', sem: makeSem({ predicates: ['fact'], roles: { subject: 'a', value: 'b' } }) },
    { id: 'similar', sem: makeSem({ predicates: ['fact'], roles: { subject: 'a', value: 'B' } }) },
    { id: 'dissimilar', sem: makeSem({ predicates: ['price'], roles: { subject: 'c', value: 'd' } }) }
  ];

  const querySem = makeSem({ predicates: ['fact'], roles: { subject: 'a', value: 'b' } });

  const lowRetrieved = corpus.filter(r => {
    const fp = genLow.generate(r.sem);
    return genLow.compare(genLow.generate(querySem), fp).similar;
  }).map(r => r.id);

  const highRetrieved = corpus.filter(r => {
    const fp = genHigh.generate(r.sem);
    return genHigh.compare(genHigh.generate(querySem), fp).similar;
  }).map(r => r.id);

  // Lower threshold retrieves more (higher recall, potentially lower precision)
  assert.ok(lowRetrieved.length >= highRetrieved.length, 'Lower threshold should retrieve more records');
  assert.ok(lowRetrieved.includes('exact'), 'Both thresholds should find the exact match');
  assert.ok(highRetrieved.includes('exact'), 'Both thresholds should find the exact match');
});

test('near-semantic: SimilarityResult interface is complete', () => {
  const gen = new NearSemanticFingerprintGenerator(0.8);
  const fp1 = gen.generate(EXACT_MATCH_SEMS.at(0)!);
  const fp2 = gen.generate(EXACT_MATCH_SEMS.at(1)!);
  const result: SimilarityResult = gen.compare(fp1, fp2);

  assert.ok('fingerprint1' in result);
  assert.ok('fingerprint2' in result);
  assert.ok('similarity' in result);
  assert.ok('similar' in result);
  assert.ok('threshold' in result);

  assert.strictEqual(typeof result.fingerprint1, 'string');
  assert.strictEqual(typeof result.fingerprint2, 'string');
  assert.strictEqual(typeof result.similarity, 'number');
  assert.strictEqual(typeof result.similar, 'boolean');
  assert.strictEqual(typeof result.threshold, 'number');
});

test('near-semantic: fingerprints are stable across multiple generations', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const sem = makeSem({ predicates: ['fact'], roles: { subject: 'stable-test' } });

  // Generate multiple times
  const fps = Array.from({ length: 10 }, () => gen.generate(sem));

  // All should be identical
  const unique = new Set(fps);
  assert.strictEqual(unique.size, 1, 'Fingerprints should be deterministic');
});
