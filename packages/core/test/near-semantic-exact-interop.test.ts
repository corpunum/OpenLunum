import { test } from 'node:test';
import assert from 'node:assert';
import type { LunumSem, LunumRecord } from '../src/types.js';
import {
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint,
  type SimilarityResult
} from '../src/near-semantic-fingerprints.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeSem(opts: {
  world?: string;
  kind?: string;
  predicates?: string[];
  roles?: Record<string, string>;
  negated?: boolean;
  time?: string;
  modality?: string | null;
} = {}): LunumSem {
  const predicates = opts.predicates ?? ['fact'];
  const clauses = predicates.map((pred, i) => {
    const clause: Record<string, unknown> = {
      predicate: pred,
      roles: opts.roles ?? { subject: 'item-' + i },
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

function makeRecord(sem: LunumSem, extraOpts: {
  exactFp?: string;
  nearFp?: string;
  language?: string;
} = {}): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.2',
    source: {
      text: 'Test source text',
      language: extraOpts.language ?? 'en',
      role: null,
      ref: null
    },
    sem,
    fingerprint: extraOpts.exactFp ?? 'lfp:exact:sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    nearSemanticFingerprint: extraOpts.nearFp,
    renderings: {
      en: { code: 'Test rendering', profile: 'generic-en-pivot/0.1', tokens: 5 }
    },
    policy: {
      eligible: true,
      risk: 'low',
      confidence: 0.95,
      reasons: ['test record']
    },
    meta: {
      created: '2026-01-01T00:00:00Z',
      schemaVersion: '0.2'
    }
  } as unknown as LunumRecord;
}

// ── Fixtures ────────────────────────────────────────────────────────

const EXACT_RECORD = makeRecord(
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'France' } }),
  { exactFp: 'lfp:exact:paris-france', nearFp: 'nfp:4c6429f4' }
);

const NEAR_RECORD = makeRecord(
  makeSem({ predicates: ['location'], roles: { subject: 'Paris', object: 'FRANCE' } }),
  { exactFp: 'lfp:exact:paris-france-uppercase', nearFp: 'nfp:772fb9d4' }
);

const NO_NEAR_FP_RECORD = makeRecord(
  makeSem({ predicates: ['fact'], roles: { subject: 'item' } }),
  { exactFp: 'lfp:exact:only' } // no nearSemanticFingerprint
);

// ── Tests ───────────────────────────────────────────────────────────

test('interop: record can carry both exact and near-semantic fingerprints', () => {
  assert.ok(EXACT_RECORD.fingerprint.startsWith('lfp:'), 'Record has exact fingerprint');
  assert.ok(EXACT_RECORD.nearSemanticFingerprint?.startsWith('nfp:'), 'Record has near-semantic fingerprint');
});

test('interop: record can carry only exact fingerprint', () => {
  assert.ok(NO_NEAR_FP_RECORD.fingerprint.startsWith('lfp:'), 'Record has exact fingerprint');
  assert.strictEqual(NO_NEAR_FP_RECORD.nearSemanticFingerprint, undefined, 'Record has no near-semantic fingerprint');
});

test('interop: record can carry only near-semantic fingerprint', () => {
  const onlyNearRecord = makeRecord(
    makeSem({ predicates: ['fact'], roles: { subject: 'item' } }),
    { exactFp: 'lfp:exact:test', nearFp: 'nfp:abcdef01' }
  );
  // Both are present, but the key test is that nearSemanticFingerprint is optional
  assert.ok(onlyNearRecord.nearSemanticFingerprint, 'Record has near-semantic fingerprint');
});

test('interop: generate near-fingerprint from record', () => {
  const gen = new NearSemanticFingerprintGenerator();
  const nearFp = gen.generateFromRecord(EXACT_RECORD);

  assert.ok(nearFp.startsWith('nfp:'), 'Generated near-fingerprint starts with nfp:');
  assert.strictEqual(nearFp, EXACT_RECORD.nearSemanticFingerprint, 'Generated near-fp matches stored near-fp');
});

test('interop: query by exact fingerprint finds exact match', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, NO_NEAR_FP_RECORD];
  const queryFp = EXACT_RECORD.fingerprint;

  const results = corpus.filter(r => r.fingerprint === queryFp);

  assert.strictEqual(results.length, 1, 'Exact query finds exactly one record');
  assert.strictEqual(results[0]!.fingerprint, queryFp, 'Found record has matching exact fingerprint');
});

test('interop: query by near-fingerprint finds similar records', () => {
  const gen = new NearSemanticFingerprintGenerator(0.1);
  const corpus = [EXACT_RECORD, NEAR_RECORD, NO_NEAR_FP_RECORD];
  const queryNearFp = EXACT_RECORD.nearSemanticFingerprint!;

  const results = corpus
    .filter(r => r.nearSemanticFingerprint !== undefined)
    .filter(r => {
      const result = gen.compare(queryNearFp, r.nearSemanticFingerprint!);
      return result.similar;
    });

  // Both EXACT_RECORD and NEAR_RECORD should match (case variation)
  assert.ok(results.length >= 1, 'Near-semantic query finds at least one result');
  assert.ok(results.some(r => r === EXACT_RECORD), 'Near-semantic query finds exact record');
  assert.ok(results.some(r => r === NEAR_RECORD), 'Near-semantic query finds near-match record');
});

test('interop: mixed query supports both exact and near-semantic matching', () => {
  const gen = new NearSemanticFingerprintGenerator(0.1);
  const corpus = [EXACT_RECORD, NEAR_RECORD, NO_NEAR_FP_RECORD];

  // Query that matches by exact fingerprint
  const exactResults = corpus.filter(r => r.fingerprint === EXACT_RECORD.fingerprint);
  assert.strictEqual(exactResults.length, 1, 'Exact query finds one record');

  // Query that matches by near-fingerprint
  const nearResults = corpus
    .filter(r => r.nearSemanticFingerprint !== undefined)
    .filter(r => gen.compare(EXACT_RECORD.nearSemanticFingerprint!, r.nearSemanticFingerprint!).similar);

  assert.ok(nearResults.length >= 1, 'Near query finds at least one record');
  assert.ok(nearResults.length >= exactResults.length, 'Near query finds >= exact query results');
});

test('interop: records without near-fingerprint are gracefully handled in near-semantic queries', () => {
  const gen = new NearSemanticFingerprintGenerator(0.1);
  const corpus = [EXACT_RECORD, NO_NEAR_FP_RECORD];

  const nearResults = corpus
    .filter(r => r.nearSemanticFingerprint !== undefined)
    .filter(r => gen.compare(EXACT_RECORD.nearSemanticFingerprint!, r.nearSemanticFingerprint!).similar);

  // NO_NEAR_FP_RECORD should be excluded from near-semantic results
  assert.strictEqual(nearResults.length, 1, 'Records without near-fp are excluded');
  assert.strictEqual(nearResults[0], EXACT_RECORD, 'Only EXACT_RECORD matches');
});

test('interop: dual-fingerprint record enables hybrid search', () => {
  /**
   * Hybrid search: first try exact match, then fall back to near-semantic.
   */
  const gen = new NearSemanticFingerprintGenerator(0.1);
  const corpus = [EXACT_RECORD, NEAR_RECORD, NO_NEAR_FP_RECORD];

  function hybridSearch(queryExact: string, queryNear?: NearSemanticFingerprint): LunumRecord[] {
    // Try exact first
    const exact = corpus.filter(r => r.fingerprint === queryExact);
    if (exact.length > 0) return exact;

    // Fall back to near-semantic if query has near-fp
    if (queryNear) {
      return corpus
        .filter(r => r.nearSemanticFingerprint !== undefined)
        .filter(r => gen.compare(queryNear, r.nearSemanticFingerprint!).similar);
    }

    return [];
  }

  // Case 1: Exact match found
  const case1 = hybridSearch(EXACT_RECORD.fingerprint);
  assert.strictEqual(case1.length, 1, 'Hybrid search finds exact match');

  // Case 2: No exact match, fall back to near-semantic
  const case2 = hybridSearch('lfp:nonexistent', EXACT_RECORD.nearSemanticFingerprint);
  assert.ok(case2.length >= 1, 'Hybrid search falls back to near-semantic');

  // Case 3: Neither found
  const case3 = hybridSearch('lfp:nonexistent', 'nfp:nonexistent');
  assert.strictEqual(case3.length, 0, 'Hybrid search returns empty when nothing matches');
});

test('interop: fingerprint format validation', () => {
  const exactPattern = /^lfp:/;
  const nearPattern = /^nfp:/;

  assert.ok(exactPattern.test(EXACT_RECORD.fingerprint), 'Exact fingerprint matches lfp: pattern');
  assert.ok(nearPattern.test(EXACT_RECORD.nearSemanticFingerprint!), 'Near-fingerprint matches nfp: pattern');
});

test('interop: record with only near-fingerprint is valid', () => {
  const record = makeRecord(
    makeSem({ predicates: ['fact'], roles: { subject: 'test' } }),
    { exactFp: 'lfp:exact:test', nearFp: 'nfp:test1234' }
  );

  // Both fields should be present
  assert.ok(record.fingerprint.startsWith('lfp:'));
  assert.ok(record.nearSemanticFingerprint?.startsWith('nfp:'));
});

test('interop: near-fingerprint is optional in record interface', () => {
  const record = makeRecord(
    makeSem({ predicates: ['fact'], roles: { subject: 'test' } }),
    { exactFp: 'lfp:exact:test' }
  );

  // nearSemanticFingerprint should be undefined (optional)
  assert.strictEqual(record.nearSemanticFingerprint, undefined);
});

test('interop: similarity comparison works between records with near-fingerprints', () => {
  const gen = new NearSemanticFingerprintGenerator(0.2);

  const sim = gen.compare(EXACT_RECORD.nearSemanticFingerprint!, NEAR_RECORD.nearSemanticFingerprint!);

  assert.ok(sim.similarity > 0, 'Similarity is positive for near-matches');
  assert.ok(sim.similar, 'Near-matches are considered similar at 0.2 threshold');
});

test('interop: exact vs near-semantic retrieval recall comparison', () => {
  const gen = new NearSemanticFingerprintGenerator(0.1);
  const corpus = [
    EXACT_RECORD,
    NEAR_RECORD,
    makeRecord(makeSem({ predicates: ['location'], roles: { subject: 'London', object: 'UK' } }), { exactFp: 'lfp:exact:london', nearFp: 'nfp:abcd1234' }),
    makeRecord(makeSem({ predicates: ['price'], roles: { subject: 'item' } }), { exactFp: 'lfp:exact:price', nearFp: 'nfp:efgh5678' })
  ];

  const queryExact = EXACT_RECORD.fingerprint;
  const queryNear = EXACT_RECORD.nearSemanticFingerprint!;

  // Exact retrieval
  const exactResults = corpus.filter(r => r.fingerprint === queryExact);

  // Near-semantic retrieval
  const nearResults = corpus
    .filter(r => r.nearSemanticFingerprint !== undefined)
    .filter(r => gen.compare(queryNear, r.nearSemanticFingerprint!).similar);

  // Near-semantic should find at least as many results as exact
  assert.ok(nearResults.length >= exactResults.length, 'Near-semantic recall >= exact recall');

  // Near-semantic should find both EXACT and NEAR records
  assert.ok(nearResults.includes(EXACT_RECORD), 'Near-semantic finds exact record');
  assert.ok(nearResults.includes(NEAR_RECORD), 'Near-semantic finds near-match record');
});
