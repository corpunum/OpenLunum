/**
 * Tests the bridge between the semantic-group ingest/validation layer
 * (semantic-group-matching.ts) and the existing cross-lingual retrieval
 * scoring pipeline (cross-lingual-retrieval.ts), confirming the new
 * feature actually supplements retrieval scoring rather than living in
 * isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LunumRecord } from '@corpunum/lunum';
import {
  buildParallelRecordGroupsFromSchema,
  createCrossLingualQueries,
  runCrossLingualRetrieval,
  CrossLingualIndex
} from '../src/cross-lingual-retrieval.js';
import type { SemanticGroupSchema } from '../src/semantic-group-matching.js';

function makeRecord(lang: string, text: string, fingerprint: string, groupId?: string): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text, language: lang, role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{
        predicate: 'greet',
        roles: { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'welcome' } },
        negated: false
      }],
      ...(groupId ? { annotations: { semanticGroupId: groupId } } : {})
    },
    fingerprint,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: ['test'] },
    meta: {}
  };
}

test('bridge: schema-validated semantic groups feed cross-lingual query generation and score perfectly', async () => {
  const schema: SemanticGroupSchema = [{ groupId: 'greet-1', languages: ['en', 'el', 'es', 'id'] }];
  const records = [
    makeRecord('en', 'Hello, welcome!', 'fp-en-1', 'greet-1'),
    makeRecord('el', 'Γεια σου, καλώς όρισες!', 'fp-el-1', 'greet-1'),
    makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', 'greet-1'),
    makeRecord('id', 'Halo, selamat datang!', 'fp-id-1', 'greet-1')
  ];

  const { groups, index } = buildParallelRecordGroupsFromSchema(records, schema);
  assert.equal(groups.length, 1);
  assert.equal(index.suspectGroups.size, 0);

  const queries = createCrossLingualQueries(groups, 10);
  assert.ok(queries.length > 0);

  const retrievalIndex = new CrossLingualIndex();
  retrievalIndex.add(records);

  const report = await runCrossLingualRetrieval('bridge-test', retrievalIndex, queries, 10);
  assert.equal(report.overallMetrics.meanPrecision, 1, 'schema-validated group queries should retrieve with perfect precision');
  assert.equal(report.overallMetrics.meanRecall, 1, 'schema-validated group queries should retrieve with perfect recall');
});

test('bridge: an invalid dataset (forged group id) is rejected before it ever reaches retrieval scoring', () => {
  const schema: SemanticGroupSchema = [{ groupId: 'greet-1', languages: ['en', 'es'] }];
  const records = [
    makeRecord('en', 'Hello, welcome!', 'fp-en-1', 'greet-1'),
    makeRecord('es', 'Forged claim', 'fp-es-forged', 'not-a-real-group')
  ];

  assert.throws(
    () => buildParallelRecordGroupsFromSchema(records, schema),
    /Unknown semantic group id/
  );
});

test('bridge: a suspect (structurally mismatched) group never produces a cross-lingual query', () => {
  const schema: SemanticGroupSchema = [{ groupId: 'greet-1', languages: ['en', 'es'] }];
  const en = makeRecord('en', 'Hello, welcome!', 'fp-en-1', 'greet-1');
  const esMismatched: LunumRecord = {
    ...makeRecord('es', '¡Hola! Cuidado.', 'fp-es-1', 'greet-1'),
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'greet', roles: { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'welcome' } }, negated: false },
        { predicate: 'warn', roles: { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'danger' } }, negated: false }
      ],
      annotations: { semanticGroupId: 'greet-1' }
    }
  };

  const { groups, index } = buildParallelRecordGroupsFromSchema([en, esMismatched], schema);
  assert.equal(groups.length, 0, 'a suspect group must not produce a ParallelRecordGroup');
  assert.ok(index.suspectGroups.has('greet-1'));

  const queries = createCrossLingualQueries(groups, 10);
  assert.equal(queries.length, 0);
});
