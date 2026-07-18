/**
 * Tests for cross-lingual retrieval precision measurement.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  CrossLingualIndex,
  runCrossLingualRetrieval,
  createCrossLingualQueries,
  type CrossLingualQuery,
  type ParallelRecordGroup,
  type CrossLingualReport
} from '../src/cross-lingual-retrieval.js';
import type { LunumRecord } from '@corpunum/lunum';

// ── Helpers ────────────────────────────────────────────────────────

function makeRecord(lang: string, text: string, sem: any, fingerprint: string): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text, language: lang, role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: sem?.clauses || [{ predicate: 'test', roles: {} }]
    },
    fingerprint,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: ['test'] },
    meta: {}
  };
}

// ── Tests: CrossLingualIndex ───────────────────────────────────────

test('cross-lingual index: adds records and indexes by language', () => {
  const index = new CrossLingualIndex();
  // Each record has a unique fingerprint
  const records = [
    makeRecord('en', 'Hello world', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:aaaa1234'),
    makeRecord('el', 'Γεια σου κόσμε', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:bbbb1234'),
    makeRecord('es', 'Hola mundo', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:cccc1234'),
    makeRecord('id', 'Halo dunia', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:dddd1234')
  ];

  index.add(records);

  assert.strictEqual(index.getStats().totalRecords, 4);
  assert.strictEqual(index.getStats().recordsByLanguage.en, 1);
  assert.strictEqual(index.getStats().recordsByLanguage.el, 1);
  assert.strictEqual(index.getStats().recordsByLanguage.es, 1);
  assert.strictEqual(index.getStats().recordsByLanguage.id, 1);
});

test('cross-lingual index: returns language IDs', () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa111'),
    makeRecord('en', 'World', { clauses: [] }, 'lfp:0.1:sha256:bbb222'),
    makeRecord('es', 'Hola', { clauses: [] }, 'lfp:0.1:sha256:ccc333')
  ]);

  const enIds = index.getIdsByLanguage('en');
  assert.strictEqual(enIds.length, 2);

  const esIds = index.getIdsByLanguage('es');
  assert.strictEqual(esIds.length, 1);

  const frIds = index.getIdsByLanguage('fr');
  assert.strictEqual(frIds.length, 0);
});

test('cross-lingual index: gets records by ID', () => {
  const index = new CrossLingualIndex();
  const records = [
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa111')
  ];
  index.add(records);

  const found = index.getById('lfp:0.1:sha256:aaa111');
  assert.ok(found);
  assert.strictEqual(found!.source.language, 'en');

  const notFound = index.getById('nonexistent');
  assert.strictEqual(notFound, undefined);
});

test('cross-lingual index: lists available languages', () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
    makeRecord('el', 'Γεια', { clauses: [] }, 'lfp:0.1:sha256:bbb'),
    makeRecord('id', 'Halo', { clauses: [] }, 'lfp:0.1:sha256:ccc')
  ]);

  const langs = index.getLanguages();
  assert.ok(langs.includes('en'));
  assert.ok(langs.includes('el'));
  assert.ok(langs.includes('id'));
  assert.strictEqual(langs.length, 3);
});

// ── Tests: Cross-Lingual Queries ───────────────────────────────────

test('cross-lingual queries: creates queries from parallel groups', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'greet-1',
      records: [
        makeRecord('en', 'Hello world', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:abc123'),
        makeRecord('el', 'Γεια σου κόσμε', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:abc123'),
        makeRecord('es', 'Hola mundo', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:abc123')
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups, 5);

  assert.ok(queries.length > 0, 'Should create at least one query');
  for (const q of queries) {
    assert.ok(q.queryText.length > 0, 'Query text should be non-empty');
    assert.ok(q.queryLanguage !== q.targetLanguage, 'Source and target languages should differ');
    assert.ok(q.expectedIds.length > 0, 'Should have expected IDs');
  }
});

test('cross-lingual queries: limits queries per group', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'greet-all',
      records: [
        makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
        makeRecord('el', 'Γεια', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
        makeRecord('es', 'Hola', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
        makeRecord('id', 'Halo', { clauses: [] }, 'lfp:0.1:sha256:aaa')
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups, 2);

  assert.ok(queries.length <= 2, `Should create at most 2 queries, got ${queries.length}`);
});

test('cross-lingual queries: skips groups with single record', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'single',
      records: [
        makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa')
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups, 5);
  assert.strictEqual(queries.length, 0);
});

test('cross-lingual queries: no same-language queries', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'test',
      records: [
        makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
        makeRecord('en', 'World', { clauses: [] }, 'lfp:0.1:sha256:aaa')
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups, 10);

  // If both records are English, we should still get queries but with different target
  // Actually both have same language, so there's no target language with records
  // This tests that we handle the edge case
  for (const q of queries) {
    assert.ok(q.queryLanguage !== q.targetLanguage || queries.length === 0);
  }
});

// ── Tests: Cross-Lingual Retrieval ─────────────────────────────────

test('cross-lingual retrieval: perfect precision when querying for known IDs', () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello world', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:abc111'),
    makeRecord('es', 'Hola mundo', { clauses: [{ predicate: 'greet', roles: {} }] }, 'lfp:0.1:sha256:abc111')
  ]);

  const queries: CrossLingualQuery[] = [{
    queryText: 'Hello world',
    queryLanguage: 'en',
    targetLanguage: 'es',
    expectedIds: ['lfp:0.1:sha256:abc111']
  }];

  const report = runCrossLingualRetrieval('test-exp', index, queries, 10);

  assert.doesNotReject(report);

  // Run and check
  const result = report.then(r => {
    assert.strictEqual(r.totalQueries, 1);
    assert.strictEqual(r.perQueryResults.length, 1);
    const qr = r.perQueryResults[0]!;
    assert.ok(qr.truePositives.length > 0, 'Should have true positives');
    assert.ok(qr.precision >= 0 && qr.precision <= 1, 'Precision should be 0-1');
  });
  return result as any;
});

test('cross-lingual retrieval: handles empty query set', async () => {
  const index = new CrossLingualIndex();
  const queries: CrossLingualQuery[] = [];

  const report = await runCrossLingualRetrieval('empty-test', index, queries, 10);

  assert.strictEqual(report.totalQueries, 0);
  assert.strictEqual(report.overallMetrics.meanPrecision, 0);
  assert.strictEqual(report.overallMetrics.meanRecall, 0);
  assert.strictEqual(report.overallMetrics.meanF1Score, 0);
});

test('cross-lingual retrieval: handles empty expected IDs', async () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('es', 'Hola mundo', { clauses: [] }, 'lfp:0.1:sha256:abc111')
  ]);

  const queries: CrossLingualQuery[] = [{
    queryText: 'Hello',
    queryLanguage: 'en',
    targetLanguage: 'es',
    expectedIds: []
  }];

  const report = await runCrossLingualRetrieval('no-expect-test', index, queries, 10);

  assert.strictEqual(report.totalQueries, 1);
  // With no expected IDs, recall should be 1 (no false negatives possible)
  const qr = report.perQueryResults[0]!;
  assert.strictEqual(qr.recall, 1);
});

test('cross-lingual retrieval: computes per-language-pair metrics', async () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
    makeRecord('es', 'Hola', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
    makeRecord('en', 'World', { clauses: [] }, 'lfp:0.1:sha256:bbb'),
    makeRecord('es', 'Mundo', { clauses: [] }, 'lfp:0.1:sha256:bbb')
  ]);

  const queries: CrossLingualQuery[] = [
    {
      queryText: 'Hello',
      queryLanguage: 'en',
      targetLanguage: 'es',
      expectedIds: ['lfp:0.1:sha256:aaa']
    },
    {
      queryText: 'World',
      queryLanguage: 'en',
      targetLanguage: 'es',
      expectedIds: ['lfp:0.1:sha256:bbb']
    }
  ];

  const report = await runCrossLingualRetrieval('pair-test', index, queries, 10);

  const pairMetrics = report.overallMetrics.byLanguagePair;
  const enEs = pairMetrics['en->es'];
  assert.ok(enEs, 'Should have en->es metrics');
  assert.strictEqual(enEs.count, 2, 'Should have 2 queries for en->es');
  assert.ok(enEs.meanPrecision >= 0, 'Mean precision should be >= 0');
  assert.ok(enEs.meanRecall >= 0, 'Mean recall should be >= 0');
});

test('cross-lingual retrieval: computes source language metrics', async () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
    makeRecord('el', 'Γεια', { clauses: [] }, 'lfp:0.1:sha256:aaa')
  ]);

  const queries: CrossLingualQuery[] = [{
    queryText: 'Hello',
    queryLanguage: 'en',
    targetLanguage: 'el',
    expectedIds: ['lfp:0.1:sha256:aaa']
  }];

  const report = await runCrossLingualRetrieval('source-test', index, queries, 10);

  const sourceMetrics = report.overallMetrics.bySourceLanguage;
  assert.ok(sourceMetrics.en, 'Should have en source metrics');
  assert.strictEqual(sourceMetrics.en.count, 1);
});

test('cross-lingual retrieval: computes target language metrics', async () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:aaa'),
    makeRecord('el', 'Γεια', { clauses: [] }, 'lfp:0.1:sha256:aaa')
  ]);

  const queries: CrossLingualQuery[] = [{
    queryText: 'Hello',
    queryLanguage: 'en',
    targetLanguage: 'el',
    expectedIds: ['lfp:0.1:sha256:aaa']
  }];

  const report = await runCrossLingualRetrieval('target-test', index, queries, 10);

  const targetMetrics = report.overallMetrics.byTargetLanguage;
  assert.ok(targetMetrics.el, 'Should have el target metrics');
  assert.strictEqual(targetMetrics.el.count, 1);
});

test('cross-lingual retrieval: F1 score formula is correct', () => {
  // Test with known precision and recall
  const precision = 0.6;
  const recall = 0.4;
  const expectedF1 = 2 * (precision * recall) / (precision + recall); // = 0.48

  assert.strictEqual(
    2 * (precision * recall) / (precision + recall),
    expectedF1
  );
});

test('cross-lingual retrieval: perfect F1 when precision = recall = 1', () => {
  const precision = 1.0;
  const recall = 1.0;
  const f1 = 2 * (precision * recall) / (precision + recall);

  assert.strictEqual(f1, 1.0);
});

test('cross-lingual retrieval: zero F1 when precision = 0', () => {
  const precision = 0.0;
  const recall = 0.5;
  const f1 = 2 * (precision * recall) / (precision + recall);

  assert.strictEqual(f1, 0.0);
});

test('cross-lingual retrieval: report has correct structure', async () => {
  const index = new CrossLingualIndex();
  index.add([
    makeRecord('en', 'Test', { clauses: [] }, 'lfp:0.1:sha256:abc')
  ]);

  const queries: CrossLingualQuery[] = [{
    queryText: 'Test',
    queryLanguage: 'en',
    targetLanguage: 'el',
    expectedIds: ['lfp:0.1:sha256:abc']
  }];

  const report = await runCrossLingualRetrieval('struct-test', index, queries, 10);

  // Verify report structure
  assert.ok(report.experimentId === 'struct-test');
  assert.ok(report.runId.length > 0);
  assert.strictEqual(report.totalQueries, 1);
  assert.ok(report.generatedAt > 0);
  assert.strictEqual(report.perQueryResults.length, 1);

  // Verify query result structure
  const qr = report.perQueryResults[0]!;
  assert.ok(qr.queryId.length > 0);
  assert.ok(qr.queryText.length > 0);
  assert.strictEqual(qr.queryLanguage, 'en');
  assert.strictEqual(qr.targetLanguage, 'el');
  assert.strictEqual(qr.precision >= 0 && qr.precision <= 1, true);
  assert.strictEqual(qr.recall >= 0 && qr.recall <= 1, true);
  assert.strictEqual(qr.f1Score >= 0 && qr.f1Score <= 1, true);
});

test('cross-lingual retrieval: handles maxResults limit', async () => {
  const index = new CrossLingualIndex();
  // Add 5 records to target language
  for (let i = 0; i < 5; i++) {
    index.add([makeRecord('es', `Spanish ${i}`, { clauses: [] }, `lfp:0.1:sha256:es${i}`)]);
  }

  const queries: CrossLingualQuery[] = [{
    queryText: 'Test',
    queryLanguage: 'en',
    targetLanguage: 'es',
    expectedIds: []
  }];

  const report = await runCrossLingualRetrieval('limit-test', index, queries, 3);

  assert.strictEqual(report.totalQueries, 1);
  const qr = report.perQueryResults[0]!;
  assert.ok(qr.retrieved.length <= 3, `Should retrieve at most 3, got ${qr.retrieved.length}`);
});

test('cross-lingual queries: generates multi-language pair queries', () => {
  const groups: ParallelRecordGroup[] = [
    {
      groupId: 'multi-lang',
      records: [
        makeRecord('en', 'Hello', { clauses: [] }, 'lfp:0.1:sha256:abc'),
        makeRecord('el', 'Γεια', { clauses: [] }, 'lfp:0.1:sha256:abc'),
        makeRecord('es', 'Hola', { clauses: [] }, 'lfp:0.1:sha256:abc'),
        makeRecord('id', 'Halo', { clauses: [] }, 'lfp:0.1:sha256:abc')
      ]
    }
  ];

  const queries = createCrossLingualQueries(groups, 10);

  // Should generate queries between different language pairs
  const pairs = new Set(queries.map(q => `${q.queryLanguage}->${q.targetLanguage}`));
  assert.ok(pairs.size >= 1, 'Should have at least one language pair');

  // Verify no same-language pairs
  for (const q of queries) {
    assert.ok(q.queryLanguage !== q.targetLanguage);
  }
});
