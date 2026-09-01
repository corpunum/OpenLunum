import test from 'node:test';
import assert from 'node:assert/strict';
import type { LunumRecord, LunumSem } from '@corpunum/lunum';
import { CrossLingualIndex, runCrossLingualRetrieval, type CrossLingualQuery } from '../src/cross-lingual-retrieval.js';

function record(id: string, lang: string, predicate: string): LunumRecord {
  const sem: LunumSem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate, roles: { theme: { type: 'concept', id: 'guide' } } }] };
  return { recordVersion: 'lunum-record/0.1-draft', source: { text: id, language: lang, role: null, ref: null }, sem, fingerprint: `fp-${id}`, renderings: {}, policy: { eligible: true, category: 'test', risk: 'low', confidence: 1, reasons: [] }, meta: { recordId: id } };
}

test('conditional cross-lingual retrieval uses query Sem and preserves duplicate physical records', async () => {
  const index = new CrossLingualIndex();
  index.add([record('en-guide', 'en', 'translate'), record('el-guide', 'el', 'translate'), record('el-delete', 'el', 'delete')]);
  assert.equal(index.getStats().totalRecords, 3);
  const querySem = record('query', 'en', 'translate').sem;
  const query: CrossLingualQuery = { queryText: 'translate', queryLanguage: 'en', targetLanguage: 'el', expectedIds: ['el-guide'], querySem };
  const report = await runCrossLingualRetrieval('query-sem', index, [query], 5);
  assert.deepEqual(report.perQueryResults[0]?.retrieved.map((item) => item.id), ['el-guide']);
  assert.equal(report.perQueryResults[0]?.truePositives.length, 1);
});
