import assert from 'node:assert/strict';
import test from 'node:test';
import type { LunumSem } from '@corpunum/lunum';
import { runRawTextRetrievalEvaluation } from '../src/raw-text-retrieval.js';

function sem(predicate: string, theme: string, extras: Record<string, unknown> = {}): LunumSem {
  return { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'statement', clauses: [{ predicate, roles: { agent: { type: 'actor', id: 'assistant' }, theme: { type: 'concept', id: theme }, ...extras }, negated: false }] };
}

test('raw-text retrieval extracts both sides and measures cross-language ranking', async () => {
  const table = new Map<string, LunumSem>([
    ['The assistant archives the thread.', sem('archive', 'thread')],
    ['Ο βοηθός αρχειοθετεί το νήμα.', sem('archive', 'thread')],
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
    topK: 1,
  });
  assert.equal(report.inputMode, 'raw-text-only');
  assert.equal(report.metrics.queryExtractionFailures, 0);
  assert.equal(report.metrics.memoryExtractionFailures, 0);
  assert.equal(report.metrics.top1Accuracy, 1);
  assert.equal(report.metrics.falsePositives, 0);
  assert.equal(report.metrics.falsePositiveRate, 0);
  assert.equal(report.metrics.byLanguagePair['el-en']?.topKRecall, 1);
});

test('raw-text retrieval attributes extractor abstention and rejects wrong-but-valid role binding', async () => {
  const good = sem('share', 'document', { recipient: { type: 'actor', id: 'team' } });
  const wrong = sem('share', 'document', { recipient: { type: 'actor', id: 'admin' } });
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

test('baseline hooks receive raw text only and are reported beside semantic retrieval', async () => {
  const memory = sem('translate', 'guide', { recipient: { type: 'actor', id: 'team' } });
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
