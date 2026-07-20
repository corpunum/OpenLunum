import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { LunumRecord, LunumSem } from '../src/types.js';
import {
  NearSemanticFingerprintGenerator,
  type NearSemanticFingerprint,
} from '../src/near-semantic-fingerprints.js';

const generator = new NearSemanticFingerprintGenerator(0.7);

function makeSem(options: {
  subjectId?: string;
  objectId?: string;
  literal?: string;
  predicate?: string;
  modality?: string | null;
} = {}): LunumSem {
  const roles: Record<string, unknown> = {
    subject: { type: 'entity', id: options.subjectId ?? 'paris' },
    object: { type: 'entity', id: options.objectId ?? 'france' },
  };
  if (options.literal !== undefined) roles.label = { type: 'text', value: options.literal };

  return {
    schema: 'lunum-sem/0.2',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: options.predicate ?? 'location',
      roles,
      negated: false,
      ...(options.modality !== undefined ? { modality: options.modality } : {}),
    }],
    references: [],
    provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
    annotations: {},
  } as unknown as LunumSem;
}

function exactFingerprint(id: string): string {
  return `lfp:0.2:sha256:${createHash('sha256').update(id).digest('hex').slice(0, 32)}`;
}

function makeRecord(
  id: string,
  sem: LunumSem,
  options: { includeNear?: boolean; language?: string } = {},
): LunumRecord {
  const includeNear = options.includeNear ?? true;
  return {
    recordVersion: 'lunum-record/0.2',
    source: { text: `Source for ${id}`, language: options.language ?? 'en', role: null, ref: null },
    sem,
    fingerprint: exactFingerprint(id),
    ...(includeNear ? { nearSemanticFingerprint: generator.generate(sem) } : {}),
    renderings: { en: { code: `Rendering for ${id}`, profile: 'generic-en-pivot/0.1', tokens: 5 } },
    policy: { eligible: true, risk: 'low', confidence: 0.95, reasons: ['test record'] },
    meta: { created: '2026-01-01T00:00:00Z', schemaVersion: '0.2' },
  } as unknown as LunumRecord;
}

const EXACT_RECORD = makeRecord('exact-paris', makeSem({ subjectId: 'paris', literal: 'France' }));
const NEAR_RECORD = makeRecord('near-paris', makeSem({ subjectId: 'city-paris', literal: 'France' }));
const HARD_MISMATCH_RECORD = makeRecord('hard-mismatch', makeSem({ subjectId: 'paris', literal: 'Germany' }));
const NO_NEAR_RECORD = makeRecord('no-near', makeSem({ subjectId: 'item' }), { includeNear: false });

function nearSearch(query: NearSemanticFingerprint, corpus: LunumRecord[]): LunumRecord[] {
  return corpus
    .filter((record) => record.nearSemanticFingerprint !== undefined)
    .filter((record) => generator.compare(query, record.nearSemanticFingerprint!).similar);
}

test('a record can carry valid exact and generated near-semantic fingerprints', () => {
  assert.match(EXACT_RECORD.fingerprint, /^lfp:0\.2:sha256:[a-f0-9]{32}$/u);
  assert.match(
    EXACT_RECORD.nearSemanticFingerprint ?? '',
    /^nfp:2:sha256:[a-f0-9]{64}:[a-f0-9]{64}:/u,
  );
  assert.equal(generator.generateFromRecord(EXACT_RECORD), EXACT_RECORD.nearSemanticFingerprint);
});

test('nearSemanticFingerprint remains optional', () => {
  assert.equal(NO_NEAR_RECORD.nearSemanticFingerprint, undefined);
  assert.match(NO_NEAR_RECORD.fingerprint, /^lfp:/u);
});

test('exact lookup returns only the exact fingerprint match', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, HARD_MISMATCH_RECORD, NO_NEAR_RECORD];
  const results = corpus.filter((record) => record.fingerprint === EXACT_RECORD.fingerprint);
  assert.deepEqual(results, [EXACT_RECORD]);
});

test('near lookup returns exact and compatible identifier variants', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, HARD_MISMATCH_RECORD, NO_NEAR_RECORD];
  const results = nearSearch(EXACT_RECORD.nearSemanticFingerprint!, corpus);

  assert.ok(results.includes(EXACT_RECORD));
  assert.ok(results.includes(NEAR_RECORD));
  assert.equal(results.includes(HARD_MISMATCH_RECORD), false);
  assert.equal(results.includes(NO_NEAR_RECORD), false);
});

test('mixed exact and near modes remain explicit and independent', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, HARD_MISMATCH_RECORD, NO_NEAR_RECORD];
  const exactResults = corpus.filter((record) => record.fingerprint === EXACT_RECORD.fingerprint);
  const nearResults = nearSearch(EXACT_RECORD.nearSemanticFingerprint!, corpus);

  assert.equal(exactResults.length, 1);
  assert.ok(nearResults.length > exactResults.length);
  assert.ok(nearResults.includes(EXACT_RECORD));
  assert.ok(nearResults.includes(NEAR_RECORD));
});

test('hybrid search tries exact first and falls back to near semantics', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, HARD_MISMATCH_RECORD, NO_NEAR_RECORD];
  function hybridSearch(exact: string, near?: NearSemanticFingerprint): LunumRecord[] {
    const exactResults = corpus.filter((record) => record.fingerprint === exact);
    if (exactResults.length > 0) return exactResults;
    return near ? nearSearch(near, corpus) : [];
  }

  assert.deepEqual(hybridSearch(EXACT_RECORD.fingerprint), [EXACT_RECORD]);
  const fallback = hybridSearch('lfp:0.2:sha256:missing', EXACT_RECORD.nearSemanticFingerprint);
  assert.ok(fallback.includes(EXACT_RECORD));
  assert.ok(fallback.includes(NEAR_RECORD));
  assert.deepEqual(hybridSearch('lfp:0.2:sha256:missing'), []);
});

test('malformed fallback fingerprints fail closed rather than matching records', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD];
  assert.deepEqual(nearSearch('nfp:nonexistent', corpus), []);
  assert.deepEqual(nearSearch('nfp:12345678', corpus), []);
});

test('similarity between stored near fingerprints is symmetric', () => {
  const forward = generator.compare(EXACT_RECORD.nearSemanticFingerprint!, NEAR_RECORD.nearSemanticFingerprint!);
  const reverse = generator.compare(NEAR_RECORD.nearSemanticFingerprint!, EXACT_RECORD.nearSemanticFingerprint!);
  assert.equal(forward.similarity, reverse.similarity);
  assert.equal(forward.similar, true);
});

test('hard-incompatible stored fingerprints never become near matches', () => {
  const result = generator.compare(
    EXACT_RECORD.nearSemanticFingerprint!,
    HARD_MISMATCH_RECORD.nearSemanticFingerprint!,
  );
  assert.equal(result.similarity, 0);
  assert.equal(result.similar, false);
  assert.equal(result.hardCompatible, false);
});

test('near retrieval improves recall over exact retrieval for bounded identifier variation', () => {
  const corpus = [EXACT_RECORD, NEAR_RECORD, HARD_MISMATCH_RECORD];
  const relevant = new Set([EXACT_RECORD, NEAR_RECORD]);
  const exactResults = corpus.filter((record) => record.fingerprint === EXACT_RECORD.fingerprint);
  const nearResults = nearSearch(EXACT_RECORD.nearSemanticFingerprint!, corpus);
  const exactRecall = exactResults.filter((record) => relevant.has(record)).length / relevant.size;
  const nearRecall = nearResults.filter((record) => relevant.has(record)).length / relevant.size;

  assert.ok(nearRecall > exactRecall);
  assert.equal(nearResults.includes(HARD_MISMATCH_RECORD), false);
});
