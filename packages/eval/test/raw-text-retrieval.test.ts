import assert from 'node:assert/strict';
import test from 'node:test';
import type { LunumSem } from '@corpunum/lunum';
import { runRawTextRetrievalEvaluation } from '../src/raw-text-retrieval.js';

function sem(predicate: string, theme: string, extras: Record<string, unknown> = {}): LunumSem {
  return { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [{ predicate, roles: { agent: { type: 'actor', id: 'assistant' }, theme: { type: 'concept', id: theme }, ...extras }, negated: false }] };
}

test('raw-text retrieval extracts both sides and measures cross-language ranking', async () => {
  const table = new Map<string, LunumSem>([
    ['The assistant archives the thread.', sem('publish', 'thread')],
    ['Ο βοηθός αρχειοθετεί το νήμα.', sem('publish', 'thread')],
    ['The assistant deletes all files.', sem('delete', 'all_files')],
    ['The assistant deletes old files.', sem('delete', 'old_files')],
  ]);
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'archive-en', text: 'The assistant archives the thread.', language: 'en' },
      { id: 'archive-el', text: 'Ο βοηθός αρχειοθετεί το νήμα.', language: 'el' },
      { id: 'delete-all', text: 'The assistant deletes all files.', language: 'en' },
      { id: 'delete-old', text: 'The assistant deletes old files.', language: 'en' },
    ],
    queries: [
      { id: 'q-el', text: 'Ο βοηθός αρχειοθετεί το νήμα.', language: 'el', targetLanguage: 'en', expectedMemoryIds: ['archive-en'] },
      { id: 'q-critical', text: 'The assistant deletes old files.', language: 'en', targetLanguage: 'en', expectedMemoryIds: ['delete-old'] },
    ],
    extract: ({ text }) => table.get(text) ?? null,
    threshold: 0.8,
    mode: 'near-semantic',
    topK: 1,
  });
  assert.equal(report.inputMode, 'raw-text-only');
  assert.equal(report.mode, 'near-semantic');
  assert.equal(report.metrics.queryExtractionFailures, 0);
  assert.equal(report.metrics.memoryExtractionFailures, 0);
  assert.equal(report.metrics.queryIdentityAvailable, 2);
  assert.equal(report.metrics.memoryIdentityAvailable, 4);
  assert.equal(report.metrics.queryIdentityCoverage, 1);
  assert.equal(report.metrics.memoryIdentityCoverage, 1);
  assert.equal(report.metrics.conditionalQueryCount, 2);
  assert.equal(report.metrics.conditionalTop1Accuracy, 1);
  assert.equal(report.metrics.top1Accuracy, 1);
  assert.equal(report.metrics.falsePositives, 0);
  assert.equal(report.metrics.falsePositiveRate, 0);
  assert.equal(report.metrics.byLanguagePair['el-en']?.topKRecall, 1);
});

test('raw-text retrieval attributes extractor abstention and rejects wrong-but-valid role binding', async () => {
  const good = sem('publish', 'document', { audience: { type: 'actor', id: 'team' } });
  const wrong = sem('publish', 'document', { audience: { type: 'actor', id: 'admin' } });
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'memory', text: 'Share the document with the team.', language: 'en' }],
    queries: [
      { id: 'abstain', text: 'ambiguous', language: 'en', expectedMemoryIds: ['memory'] },
      { id: 'wrong-role', text: 'Share the document with the team.', language: 'en', expectedMemoryIds: ['memory'] },
    ],
    extract: ({ kind, text }) => {
      if (text === 'ambiguous') return null;
      return kind === 'memory' ? good : wrong;
    },
    topK: 1,
  });
  assert.equal(report.metrics.queryExtractionFailures, 1);
  assert.ok(report.metrics.semanticMatchingFailures >= 1);
  assert.equal(report.queryResults.find((result) => result.queryId === 'wrong-role')?.retrievedMemoryIds.length, 0);
});

test('negative rejection does not treat query abstention as a comparable safe rejection', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'memory', text: 'Known fact.', language: 'en' }],
    queries: [{ id: 'negative', text: 'Unknown fact?', language: 'en', expectedMemoryIds: [] }],
    extract: ({ kind }) => kind === 'memory' ? sem('publish', 'known_fact') : null,
  });
  assert.equal(report.metrics.negativeQueryCount, 1);
  assert.equal(report.metrics.negativeComparableQueryCount, 0);
  assert.equal(report.metrics.negativeRejectionAccuracy, 0);
});

test('retrieval candidate count contains only identity-usable memories', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'usable', text: 'Usable fact.', language: 'en' },
      { id: 'unframed', text: 'Unframed fact.', language: 'en' },
    ],
    queries: [{ id: 'q', text: 'Usable fact?', language: 'en', expectedMemoryIds: ['usable'] }],
    extract: ({ text }) => text.startsWith('Unframed') ? sem('share', 'fact') : sem('publish', 'fact'),
  });
  assert.equal(report.metrics.memoryIdentityAvailable, 1);
  assert.equal(report.queryResults[0]?.candidateCount, 1);
});

test('retrieval input rejects duplicate IDs, unknown gold references, and invalid bounds', async () => {
  const base = { memories: [{ id: 'm', text: 'Fact.', language: 'en' }], queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: ['m'] }], extract: () => sem('publish', 'fact') };
  await assert.rejects(() => runRawTextRetrievalEvaluation({ ...base, memories: [...base.memories, { id: 'm', text: 'Other.', language: 'en' }] }), /duplicate memory id/u);
  await assert.rejects(() => runRawTextRetrievalEvaluation({ ...base, queries: [{ id: base.queries[0]!.id, text: base.queries[0]!.text, language: base.queries[0]!.language, expectedMemoryIds: ['missing'] }] }), /unknown expected memory/u);
  await assert.rejects(() => runRawTextRetrievalEvaluation({ ...base, memories: [...base.memories], queries: [...base.queries], topK: 0 }), /topK/u);
  await assert.rejects(() => runRawTextRetrievalEvaluation({ ...base, memories: [...base.memories], queries: [...base.queries], threshold: 2 }), /threshold/u);
});

test('baseline hooks receive raw text only and are reported beside semantic retrieval', async () => {
  const memory = sem('publish', 'guide', { audience: { type: 'actor', id: 'team' } });
  const seen: string[] = [];
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'guide-en', text: 'Translate the guide for the team.', language: 'en' }],
    queries: [{ id: 'q-el', text: 'Μετέφρασε τον οδηγό για την ομάδα.', language: 'el', targetLanguage: 'en', expectedMemoryIds: ['guide-en'] }],
    extract: ({ text, kind }) => {
      seen.push(`${kind}:${text}`);
      return memory;
    },
    topK: 1,
    baselines: {
      lexical: ({ query, memories, topK }) => {
        assert.equal(topK, 1);
        assert.equal(query.text, 'Μετέφρασε τον οδηγό για την ομάδα.');
        assert.equal('expectedMemoryIds' in query, false);
        assert.equal(memories[0]?.text, 'Translate the guide for the team.');
        return [];
      },
    },
  });
  assert.deepEqual(seen, [
    'memory:Translate the guide for the team.',
    'query:Μετέφρασε τον οδηγό για την ομάδα.',
  ]);
  assert.equal(report.baselines.lexical?.top1Accuracy, 0);
  assert.equal(report.baselines.lexical?.falsePositiveRate, 0);
  assert.equal(report.baselines.lexical?.falseNegatives, 1);
});

test('extractor receives no evaluator-private retrieval labels', async () => {
  const seen: Array<Record<string, unknown>> = [];
  const candidate = sem('publish', 'fact');
  await runRawTextRetrievalEvaluation({
    memories: [{ id: 'memory', text: 'Memory text.', language: 'en' }],
    queries: [{ id: 'query', text: 'Query text?', language: 'en', targetLanguage: 'en', expectedMemoryIds: ['memory'], semanticEquivalentMemoryIds: ['memory'] }],
    extract: async (input) => { seen.push(input as unknown as Record<string, unknown>); return candidate; },
  });
  assert.equal(seen.length, 2);
  for (const input of seen) {
    assert.deepEqual(Object.keys(input).sort(), ['id', 'kind', 'language', 'text']);
    assert.equal('expectedMemoryIds' in input, false);
    assert.equal('semanticEquivalentMemoryIds' in input, false);
  }
});

test('baseline failures remain visible instead of disappearing from denominators', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'A fact.', language: 'en' }],
    queries: [{ id: 'q', text: 'A fact?', language: 'en', expectedMemoryIds: ['m'] }],
    extract: () => sem('state', 'fact'),
    baselines: { broken: () => { throw new Error('baseline unavailable'); } },
  });
  assert.equal(report.baselines.broken?.failures, 1);
  assert.equal(report.baselines.broken?.falseNegatives, 1);
});

test('routing is separate from semantic equivalence and baselines use the routed pool', async () => {
  const equivalent = sem('publish', 'guide', { audience: { type: 'actor', id: 'team' } });
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'guide-en', text: 'Translate the guide for the team.', language: 'en' },
      { id: 'guide-el', text: 'Μετέφρασε τον οδηγό για την ομάδα.', language: 'el' },
      { id: 'other-el', text: 'Delete the guide.', language: 'el' }
    ],
    queries: [{ id: 'q-en-to-el', text: 'Translate the guide for the team.', language: 'en', targetLanguage: 'el', expectedMemoryIds: ['guide-el'], semanticEquivalentMemoryIds: ['guide-en', 'guide-el'] }],
    extract: () => equivalent,
    topK: 1,
    baselines: { lexical: ({ memories }) => memories.map((memory) => memory.id) }
  });
  const result = report.queryResults[0]!;
  assert.deepEqual(result.routedOutEquivalentMemoryIds, ['guide-en']);
  assert.equal(report.baselines.lexical?.falsePositives, 0);
  assert.equal(result.candidateCount, 2);
});

test('noncanonical schema-valid extraction is contained and does not enter semantic retrieval', async () => {
  const unknown = sem('unregistered_operation', 'guide');
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'An operation.', language: 'en' }],
    queries: [{ id: 'q', text: 'An operation?', language: 'en', expectedMemoryIds: ['m'] }],
    extract: () => unknown
  });
  assert.equal(report.metrics.memoryExtractionFailures, 1);
  assert.equal(report.metrics.queryExtractionFailures, 1);
  assert.equal(report.metrics.memoryIdentityAvailable, 0);
  assert.equal(report.metrics.queryIdentityAvailable, 0);
  assert.equal(report.metrics.conditionalQueryCount, 0);
  assert.equal(report.metrics.falsePositives, 0);
});

test('identity coverage excludes structurally normalized but unframed candidates', async () => {
  const unframed = sem('share', 'guide');
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Share the guide.', language: 'en' }],
    queries: [{ id: 'q', text: 'Share the guide?', language: 'en', expectedMemoryIds: ['m'] }],
    extract: () => unframed,
  });
  assert.equal(report.metrics.memoryExtractionFailures, 1);
  assert.equal(report.metrics.queryExtractionFailures, 1);
  assert.equal(report.metrics.memoryIdentityAvailable, 0);
  assert.equal(report.metrics.queryIdentityAvailable, 0);
  assert.match(report.queryResults[0]!.extractionError!, /semantic identity unavailable/u);
});
