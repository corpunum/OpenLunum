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
    extract: ({ text }) => text.startsWith('Unframed') ? sem('observe', 'fact') : sem('publish', 'fact'),
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
  const unframed = sem('observe', 'guide');
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Share the guide.', language: 'en' }],
    queries: [{ id: 'q', text: 'Share the guide?', language: 'en', expectedMemoryIds: ['m'] }],
    extract: () => unframed,
  });
  assert.equal(report.metrics.memoryExtractionFailures, 1);
  assert.equal(report.metrics.queryExtractionFailures, 1);
  assert.equal(report.metrics.memoryIdentityAvailable, 0);
  assert.equal(report.metrics.queryIdentityAvailable, 0);
  assert.match(report.queryResults[0]!.extractionError!, /candidate identity unavailable/u);
});

test('expected retrieval IDs must belong to the target-language route', async () => {
  await assert.rejects(() => runRawTextRetrievalEvaluation({
    memories: [
      { id: 'guide-en', text: 'English guide.', language: 'en' },
      { id: 'guide-el', text: 'Greek guide.', language: 'el' },
    ],
    queries: [{
      id: 'q-el', text: 'Find the guide.', language: 'en', targetLanguage: 'el',
      expectedMemoryIds: ['guide-en'], semanticEquivalentMemoryIds: ['guide-en', 'guide-el'],
    }],
    extract: () => sem('publish', 'guide'),
  }), /expected.*target language|route/u);
});

test('query extraction failure retains routed-out semantic equivalents', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'guide-en', text: 'English guide.', language: 'en' },
      { id: 'guide-el', text: 'Greek guide.', language: 'el' },
    ],
    queries: [{
      id: 'q-el', text: 'Find the guide.', language: 'el', targetLanguage: 'el',
      expectedMemoryIds: ['guide-el'], semanticEquivalentMemoryIds: ['guide-en', 'guide-el'],
    }],
    extract: ({ kind }) => kind === 'query' ? null : sem('publish', 'guide'),
  });
  assert.deepEqual(report.queryResults[0]?.routedOutEquivalentMemoryIds, ['guide-en']);
  assert.deepEqual(report.queryResults[0]?.semanticMatchingFailures, []);
});

test('confusion universe is routed raw corpus while identity-available pool stays separate', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'positive', text: 'Known matching fact.', language: 'en' },
      { id: 'available-negative', text: 'Known unrelated fact.', language: 'en' },
      { id: 'unavailable-negative', text: 'Unparsed unrelated fact.', language: 'en' },
      { id: 'unavailable-positive', text: 'Unparsed matching fact.', language: 'en' },
    ],
    queries: [
      { id: 'q-positive', text: 'Known matching fact?', language: 'en', expectedMemoryIds: ['positive', 'unavailable-positive'] },
      { id: 'q-negative', text: 'Unrelated negative?', language: 'en', expectedMemoryIds: [] },
    ],
    extract: ({ kind, text }) => {
      if (kind === 'memory' && text.startsWith('Unparsed')) return null;
      if (kind === 'query' && text.startsWith('Unrelated')) return sem('delete', 'unknown_fact');
      return sem('publish', text.includes('unrelated') ? 'other_fact' : 'matching_fact');
    },
    baselines: { lexical: ({ query }) => query.id === 'q-positive' ? ['positive'] : [] },
  });
  const result = report.queryResults[0] as unknown as Record<string, unknown>;
  assert.equal(result.routedCorpusCount, 4);
  assert.equal(result.identityAvailableCandidateCount, 2);
  assert.deepEqual(result.identityUnavailableMemoryIds, ['unavailable-negative', 'unavailable-positive']);
  assert.deepEqual(result.identityUnavailableExpectedMemoryIds, ['unavailable-positive']);
  assert.deepEqual(result.identityUnavailableNegativeMemoryIds, ['unavailable-negative']);
  assert.deepEqual(report.queryResults[0]!.rankingFailures, []);
  assert.equal(report.metrics.rankingFailures, 0);
  assert.equal(report.metrics.semanticMatchingFailures, 0);
  assert.equal(report.metrics.truePositives, 1);
  assert.equal(report.metrics.falseNegatives, 1);
  assert.equal(report.metrics.trueNegatives, 6);
  assert.equal(report.metrics.routedRawCandidatePairs, 8);
  assert.equal(report.metrics.identityAvailableCandidatePairs, 4);
  assert.equal(report.metrics.identityUnavailableCandidatePairs, 4);
  assert.equal(report.metrics.identityUnavailableExpectedCandidatePairs, 1);
  assert.equal(report.metrics.identityUnavailableNegativeCandidatePairs, 3);
  assert.equal(report.metrics.conditionalRecall, 1);
  assert.equal(report.metrics.negativeComparableQueryCount, 0);
  assert.equal(report.baselines.lexical?.trueNegatives, 6);
  assert.equal(report.baselines.lexical?.falseNegatives, 1);
});

test('raw-pool FPR and examined conditional FPR disclose a partial identity pool', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'expected', text: 'Expected guide.', language: 'en' },
      { id: 'false-positive', text: 'Unrelated note.', language: 'en' },
      { id: 'unavailable-negative', text: 'Unparsed note.', language: 'en' },
    ],
    queries: [{ id: 'q', text: 'Find the guide.', language: 'en', expectedMemoryIds: ['expected'] }],
    extract: ({ kind, text }) => kind === 'memory' && text.startsWith('Unparsed') ? null : sem('publish', 'guide'),
    baselines: { lexical: () => ['false-positive'] },
  });
  const result = report.queryResults[0]!;
  const pair = report.metrics.byLanguagePair['en-*']!;
  assert.equal(report.metrics.falsePositives, 1);
  assert.equal(report.metrics.trueNegatives, 1);
  assert.equal(report.metrics.falsePositiveRate, 0.5);
  assert.equal(report.metrics.examinedFalsePositiveRate, 1);
  assert.equal(report.metrics.examinedNegativePairs, 1);
  assert.equal(report.metrics.unexaminedNegativePairs, 1);
  assert.deepEqual(result.identityUnavailableNegativeMemoryIds, ['unavailable-negative']);
  assert.equal(result.falsePositiveRate, 0.5);
  assert.equal(result.examinedFalsePositiveRate, 1);
  assert.equal(pair.falsePositiveRate, 0.5);
  assert.equal(pair.examinedFalsePositiveRate, 1);
  assert.equal(report.baselines.lexical?.falsePositiveRate, 0.5);
  assert.equal(report.baselines.lexical?.examinedFalsePositiveRate, 0.5);
});

test('baseline exceptions are visible failures, not comparable negative rejections', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Known fact.', language: 'en' }],
    queries: [{ id: 'negative', text: 'Unknown fact?', language: 'en', expectedMemoryIds: [] }],
    extract: ({ kind }) => kind === 'memory' ? sem('publish', 'known_fact') : sem('delete', 'unknown_fact'),
    baselines: { broken: () => { throw new Error('baseline unavailable'); } },
  });
  assert.equal(report.baselines.broken?.failures, 1);
  assert.equal(report.baselines.broken?.negativeRejectionAccuracy, 0);
  assert.equal((report.baselines.broken as unknown as Record<string, unknown>)?.negativeComparableQueryCount, 0);
  assert.equal(report.baselines.broken?.top1Accuracy, 0);
  assert.equal(report.baselines.broken?.precision, 0);
  assert.equal((report.baselines.broken as unknown as Record<string, unknown>)?.unexaminedNegativePairs, 1);
  assert.equal(report.baselines.broken?.falsePositiveRate, 0);
  assert.equal(report.baselines.broken?.examinedFalsePositiveRate, null);
});

test('baseline top1Accuracy is the positive-only alias and thrown runs do not count as top1 successes', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'positive', text: 'Known fact.', language: 'en' },
      { id: 'negative-decoy', text: 'Unrelated fact.', language: 'en' },
    ],
    queries: [
      { id: 'positive-query', text: 'Known fact?', language: 'en', expectedMemoryIds: ['positive'] },
      { id: 'negative-query', text: 'Missing fact?', language: 'en', expectedMemoryIds: [] },
    ],
    extract: ({ kind }) => kind === 'memory' ? sem('publish', 'fact') : sem('delete', 'fact'),
    baselines: {
      mixed: ({ query }) => query.id === 'positive-query' ? [] : [],
      throws: ({ query }) => { if (query.id === 'negative-query') throw new Error('baseline unavailable'); return []; },
    },
  });
  assert.equal(report.baselines.mixed?.positiveTop1Accuracy, 0);
  assert.equal(report.baselines.mixed?.top1Accuracy, report.baselines.mixed?.positiveTop1Accuracy);
  assert.equal(report.baselines.throws?.top1Accuracy, report.baselines.throws?.positiveTop1Accuracy);
  assert.equal(report.baselines.throws?.top1Accuracy, 0);
});

test('unexamined negative pairs include every routed record when query extraction fails', async () => {
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'one', text: 'Known fact one.', language: 'en' },
      { id: 'two', text: 'Known fact two.', language: 'en' },
    ],
    queries: [{ id: 'negative', text: 'Unparseable negative?', language: 'en', expectedMemoryIds: [] }],
    extract: ({ kind }) => kind === 'query' ? null : sem('publish', 'fact'),
  });
  const result = report.queryResults[0] as unknown as Record<string, unknown>;
  assert.equal(result.unexaminedNegativePairs, 2);
  const metrics = report.metrics as unknown as Record<string, unknown>;
  assert.equal(metrics.unexaminedNegativePairs, 2);
  assert.equal(metrics.examinedNegativePairs, 0);
  assert.equal(report.metrics.falsePositiveRate, 0);
  assert.equal(report.metrics.examinedFalsePositiveRate, null);
  assert.equal(report.queryResults[0]?.falsePositiveRate, 0);
  assert.equal(report.queryResults[0]?.examinedFalsePositiveRate, null);
  assert.equal(report.metrics.negativeComparableQueryCount, 0);
});

test('candidate identity uses submitCandidate transport and source-literal gates', async () => {
  const transportInvalid = sem('publish', 'guide') as unknown as {
    schema: string; world: string; kind: string;
    clauses: Array<Record<string, unknown>>;
  };
  transportInvalid.clauses[0] = {
    ...transportInvalid.clauses[0],
    conditions: [{ predicate: 'confirmed', roles: { agent: { type: 'actor', id: 'user' } }, negated: false, world: 'real' }],
  };
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'wire-invalid', text: 'The assistant publishes the guide.', language: 'en' },
      { id: 'literal-dropped', text: 'The assistant publishes the guide below 5000 euros.', language: 'en' },
    ],
    queries: [
      { id: 'wire-query', text: 'The assistant publishes the guide.', language: 'en', expectedMemoryIds: ['wire-invalid'] },
      { id: 'literal-query', text: 'The assistant publishes the guide below 5000 euros?', language: 'en', expectedMemoryIds: ['literal-dropped'] },
    ],
    extract: ({ text }) => text.includes('5000') ? sem('publish', 'guide') : transportInvalid as unknown as LunumSem,
  });
  assert.equal(report.metrics.memoryIdentityAvailable, 0);
  assert.equal(report.metrics.queryIdentityAvailable, 0);
  assert.match(report.queryResults.find((item) => item.queryId === 'wire-query')?.extractionError ?? '', /transport|identity unavailable/u);
  assert.match(report.queryResults.find((item) => item.queryId === 'literal-query')?.extractionError ?? '', /5000|literal|identity unavailable/u);
  assert.equal(report.metrics.falseNegatives, 2);
});

test('semantic gold fields in raw retrieval rows fail before extraction', async () => {
  let extractionCalls = 0;
  const extract = () => { extractionCalls += 1; return sem('publish', 'fact'); };
  for (const field of ['sem', 'querySem', 'targetSem', 'querySemGold']) {
    await assert.rejects(() => runRawTextRetrievalEvaluation({
      memories: [{ id: 'm', text: 'Fact.', language: 'en' }],
      queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: [], [field]: sem('publish', 'fact') } as never],
      extract,
    }), new RegExp(field, 'u'));
  }
  await assert.rejects(() => runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Fact.', language: 'en', sem: sem('publish', 'fact') } as never],
    queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: [] }],
    extract,
  }), /sem/u);
  await assert.rejects(() => runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Fact.', language: 'en' }],
    queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: [], hiddenPayload: 'unexpected' } as never],
    extract,
  }), /unknown input field: hiddenPayload/u);
  assert.equal(extractionCalls, 0);
});

test('retrieval reports separate exact and near provenance and candidate identity status', async () => {
  const exact = sem('publish', 'guide');
  const near = sem('publish', 'manual');
  const report = await runRawTextRetrievalEvaluation({
    memories: [
      { id: 'exact', text: 'Exact guide.', language: 'en' },
      { id: 'near', text: 'Related manual.', language: 'en' },
    ],
    queries: [{ id: 'q', text: 'Find guide.', language: 'en', expectedMemoryIds: ['exact'] }],
    extract: ({ kind, text }) => kind === 'query' || text === 'Exact guide.' ? exact : near,
    threshold: 0.1,
    mode: 'near-semantic',
    topK: 2,
  });
  const result = report.queryResults[0] as unknown as Record<string, unknown>;
  const output = report as unknown as Record<string, unknown>;
  assert.deepEqual(result.exactRetrievedMemoryIds, ['exact']);
  assert.deepEqual(result.nearSemanticRetrievedMemoryIds, ['near']);
  assert.equal(output.retrievalBasis, 'candidate-identity-not-promoted');
  assert.equal(report.version, '0.6.0');
  assert.equal(report.metrics.exactRetrievedCount, 1);
  assert.equal(report.metrics.nearSemanticRetrievedCount, 1);
});

test('type metadata cannot hide gold and target language must be a nonempty string', async () => {
  let calls = 0;
  const extract = () => { calls += 1; return null; };
  await assert.rejects(() => runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Fact.', language: 'en', type: { goldSem: sem('publish', 'fact') } } as never],
    queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: [] }], extract,
  }), /invalid memory type/u);
  for (const targetLanguage of ['', 42]) {
    await assert.rejects(() => runRawTextRetrievalEvaluation({
      memories: [{ id: 'm', text: 'Fact.', language: 'en' }],
      queries: [{ id: 'q', text: 'Fact?', language: 'en', expectedMemoryIds: [], targetLanguage } as never], extract,
    }), /invalid query target language/u);
  }
  assert.equal(calls, 0);
});

test('baselines receive isolated raw projections, never labels or shared mutable sources', async () => {
  const memory = { id: 'm', text: 'Raw memory.', language: 'en', type: 'memory' };
  const query = { id: 'q', text: 'Raw query.', language: 'en', type: 'query', targetLanguage: 'en', expectedMemoryIds: ['m'], semanticEquivalentMemoryIds: ['m'] };
  const report = await runRawTextRetrievalEvaluation({
    memories: [memory], queries: [query], extract: () => sem('publish', 'fact'),
    baselines: {
      first: ({ query: raw, memories }) => {
        assert.deepEqual(Object.keys(raw).sort(), ['id', 'language', 'targetLanguage', 'text']);
        assert.deepEqual(Object.keys(memories[0]!).sort(), ['id', 'language', 'text']);
        assert.throws(() => { raw.text = 'changed'; }, TypeError);
        assert.throws(() => { memories[0]!.text = 'changed'; }, TypeError);
        memories.splice(0, 1);
        return [];
      },
      second: ({ query: raw, memories }) => {
        assert.equal(raw.text, 'Raw query.');
        assert.equal(memories.length, 1);
        assert.equal(memories[0]!.text, 'Raw memory.');
        return ['m'];
      },
    },
  });
  assert.equal(report.baselines.first?.failures, 0);
  assert.equal(report.baselines.second?.positiveTop1Accuracy, 1);
  assert.equal(memory.text, 'Raw memory.');
  assert.equal(query.text, 'Raw query.');
});

test('extractor cannot rewrite the source used for candidate validation', async () => {
  const seen: string[] = [];
  await runRawTextRetrievalEvaluation({
    memories: [{ id: 'm', text: 'Raw memory.', language: 'en' }],
    queries: [{ id: 'q', text: 'Raw query.', language: 'en', expectedMemoryIds: ['m'] }],
    extract: input => {
      assert.equal(Object.isFrozen(input), true);
      assert.throws(() => { input.text = 'different source'; }, TypeError);
      seen.push(input.text);
      return sem('publish', 'fact');
    },
  });
  assert.deepEqual(seen, ['Raw memory.', 'Raw query.']);
});
