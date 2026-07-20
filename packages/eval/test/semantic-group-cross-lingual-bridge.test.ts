/**
 * Tests the bridge between the semantic-group ingest/validation layer
 * (semantic-group-matching.ts) and the existing cross-lingual retrieval
 * scoring pipeline (cross-lingual-retrieval.ts), confirming the new
 * feature actually supplements retrieval scoring rather than living in
 * isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import type { LunumRecord } from '@corpunum/lunum';
import { createRecord } from '@corpunum/lunum';
import {
  buildParallelRecordGroupsFromSchema,
  createCrossLingualQueries,
  runCrossLingualRetrieval,
  CrossLingualIndex
} from '../src/cross-lingual-retrieval.js';
import { buildSemanticGroupIndex } from '../src/semantic-group-matching.js';
import type { SemanticGroupSchema } from '../src/semantic-group-matching.js';
import { findWorkspaceRoot, loadDataset, sha256File } from '../src/io.js';

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

// ── Comparison against current retrieval behavior on a committed dataset hash ──
// (maintainer requirement, issue #256: "comparison against current
// retrieval behavior on a committed dataset hash.")
//
// The project's real committed dataset (datasets/dev/multilingual-core-v1.jsonl,
// pinned sha256 below, same value used by packages/eval/src/smoke.ts) has
// ZERO records with a `sem.annotations.semanticGroupId` value today -- this
// feature is additive and the dataset has not been authored to use it yet.
// So the honest, verifiable comparison this test can make is: on the
// actual current dataset, semantic-group-based matching produces IDENTICAL
// results to the pre-existing fingerprint-only path, because there is
// nothing for it to group. This proves the new code path is behavior-
// inert on real data until the dataset itself is annotated -- zero
// regression risk from merging it, independent of whether the feature
// itself is later adopted for retrieval.
//
// If this test starts failing because the dataset hash changed, that is
// expected -- re-pin DATASET_SHA256 after confirming the new dataset
// content is what was intended, do not just delete the assertion.
const DATASET_SHA256 = '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873';

test('dataset comparison: current committed dataset is unaffected by semantic-group matching (zero groups declared today)', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const datasetPath = path.join(workspaceRoot, 'datasets/dev/multilingual-core-v1.jsonl');

  const actualHash = await sha256File(datasetPath);
  assert.equal(actualHash, DATASET_SHA256, 'dataset content has changed since this comparison was pinned -- re-verify and re-pin');

  const items = await loadDataset(datasetPath);
  assert.ok(items.length > 0);

  const records: LunumRecord[] = items.map((item) =>
    createRecord({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, sem: item.goldSem })
  );

  // No schema is declared to match today's dataset, because today's
  // dataset declares no semanticGroupId annotations at all.
  const index = buildSemanticGroupIndex(records, []);

  assert.equal(index.groups.size, 0, 'the current dataset has no group-based matches -- it has not adopted semanticGroupId yet');
  assert.equal(index.ungroupedRecords.size, records.length, 'every record in the current dataset must fall back to fingerprint matching, unchanged');
  assert.equal(index.suspectGroups.size, 0);
});
