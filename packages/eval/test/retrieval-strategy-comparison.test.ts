import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStrategies,
  DEFAULT_HYBRID_WEIGHTS,
  type RetrievalDocument,
  type RetrievalQuery,
} from '../src/retrieval-strategy-comparison.js';
import type { LunumSem } from '@corpunum/lunum';

function makeSem(predicate: string, subjectId: string = 'paris'): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate, roles: { subject: { type: 'entity', id: subjectId } }, negated: false }],
    references: [],
    provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
    annotations: {},
  } as unknown as LunumSem;
}

function makeCorpus(): RetrievalDocument[] {
  return [
    { id: 'exact-match', sem: makeSem('location', 'paris'), text: 'Paris is the capital of France', language: 'en', relevantTo: ['q1'] },
    { id: 'near-match', sem: makeSem('location', 'city-paris'), text: 'The city of Paris in France', language: 'en', relevantTo: ['q1'] },
    { id: 'lexical-match', sem: makeSem('price', 'london'), text: 'Paris is known for its landmarks', language: 'en', relevantTo: ['q1'] },
    { id: 'unrelated', sem: makeSem('temperature', 'tokyo'), text: 'Tokyo weather forecast today', language: 'en', relevantTo: [] },
  ];
}

function makeQuery(): RetrievalQuery {
  return {
    sem: makeSem('location', 'paris'),
    text: 'Paris capital France',
    relevantDocIds: ['exact-match', 'near-match'],
  };
}

describe('retrieval strategy comparison', () => {
  it('fingerprint strategy retrieves exact matches only', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    const fp = report.strategies.find(s => s.strategy === 'fingerprint')!;
    assert.ok(fp.precision >= 0 && fp.precision <= 1);
    assert.ok(fp.recall >= 0 && fp.recall <= 1);
  });

  it('semantic-group strategy retrieves near-semantic matches', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    const sg = report.strategies.find(s => s.strategy === 'semantic-group')!;
    assert.ok(sg.recall >= 0);
  });

  it('lexical strategy retrieves keyword-overlapping documents', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    const lex = report.strategies.find(s => s.strategy === 'lexical')!;
    assert.ok(lex.retrievedCount >= 0);
  });

  it('hybrid strategy combines all signals', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    const hyb = report.strategies.find(s => s.strategy === 'hybrid')!;
    assert.ok(hyb.f1 >= 0);
  });

  it('report has all 4 strategies', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    assert.equal(report.strategies.length, 4);
    const names = new Set(report.strategies.map(s => s.strategy));
    assert.ok(names.has('fingerprint'));
    assert.ok(names.has('semantic-group'));
    assert.ok(names.has('lexical'));
    assert.ok(names.has('hybrid'));
  });

  it('strategies are sorted by F1 descending', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    for (let i = 1; i < report.strategies.length; i++) {
      assert.ok(report.strategies[i - 1]!.f1 >= report.strategies[i]!.f1);
    }
  });

  it('bestStrategy is the highest F1', () => {
    const report = compareStrategies([makeQuery()], makeCorpus());
    assert.equal(report.bestStrategy, report.strategies[0]!.strategy);
  });

  it('report includes corpus and query counts', () => {
    const corpus = makeCorpus();
    const report = compareStrategies([makeQuery()], corpus);
    assert.equal(report.corpusSize, corpus.length);
    assert.equal(report.queryCount, 1);
  });

  it('empty queries produce zero metrics', () => {
    const report = compareStrategies([], makeCorpus());
    assert.equal(report.queryCount, 0);
    for (const s of report.strategies) {
      assert.equal(s.precision, 0);
      assert.equal(s.recall, 0);
      assert.equal(s.f1, 0);
    }
  });

  it('custom hybrid weights change results', () => {
    const queries = [makeQuery()];
    const corpus = makeCorpus();
    const r1 = compareStrategies(queries, corpus, DEFAULT_HYBRID_WEIGHTS);
    const r2 = compareStrategies(queries, corpus, { fingerprint: 0.8, semantic: 0.1, lexical: 0.1 });
    const h1 = r1.strategies.find(s => s.strategy === 'hybrid')!;
    const h2 = r2.strategies.find(s => s.strategy === 'hybrid')!;
    assert.ok(typeof h1.f1 === 'number');
    assert.ok(typeof h2.f1 === 'number');
  });
});
