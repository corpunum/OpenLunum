import { test } from 'node:test';
import assert from 'node:assert';
import {
  TokenAtlas,
  type ModelTokenizerProfile,
  type AtlasEntry,
  type AtlasProfileMeasures,
  runTokenizerOptimizationPass
} from '../src/token-atlas.js';
import type { LunumRecord } from '../src/types.js';
import { runVerifiedTokenizerOptimizationPass } from '../src/token-optimization.js';

// ── Helpers ────────────────────────────────────────────────────────

function createMockRecord(
  text: string,
  language = 'en',
  predicate = 'test'
): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language, role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test-world',
      kind: predicate,
      clauses: [{ predicate, roles: { subject: 'entity' } }],
      annotations: { source: 'test' },
      provenance: { author: 'test' }
    },
    fingerprint: `sha256-${text.slice(0, 16)}`,
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low' as const,
      confidence: 0.95,
      reasons: ['test policy']
    },
    meta: {}
  };
}

function makeModel(name: string): ModelTokenizerProfile {
  return { name, tokenizer: { model: name, addBos: true, addEos: true } };
}

// ── Constructor Tests ──────────────────────────────────────────────

test('TokenAtlas requires at least 3 models', () => {
  assert.throws(
    () => new TokenAtlas([makeModel('a'), makeModel('b')]),
    { message: /requires at least 3 named models/ }
  );
});

test('TokenAtlas accepts exactly 3 models', () => {
  const atlas = new TokenAtlas([makeModel('a'), makeModel('b'), makeModel('c')]);
  assert.strictEqual(atlas.getModelCount(), 3);
});

test('TokenAtlas.withCommonModels creates 3 models', () => {
  const atlas = TokenAtlas.withCommonModels();
  assert.strictEqual(atlas.getModelCount(), 3);
  const models = atlas.getModels();
  assert.strictEqual(models[0]?.name, 'llama3.1-8b-instruct');
  assert.strictEqual(models[1]?.name, 'qwen2.5-7b-instruct');
  assert.strictEqual(models[2]?.name, 'mistral-7b-instruct-v0.3');
});

// ── Measure Tests ─────────────────────────────────────────────────

test('measure returns an AtlasEntry with all profiles', () => {
  const atlas = new TokenAtlas([
    makeModel('test-model-1'),
    makeModel('test-model-2'),
    makeModel('test-model-3')
  ]);
  const record = createMockRecord('Hello world, this is a test sentence.');
  const entry: AtlasEntry = atlas.measure(record);

  assert.ok(entry);
  assert.strictEqual(entry.fingerprint, record.fingerprint);
  assert.strictEqual(entry.sourceLength, record.source.text!.length);
  assert.ok(entry.measuredAt > 0);
  assert.deepStrictEqual(entry.tokenizerProfiles['test-model-1'], {
    model: 'test-model-1',
    addBos: true,
    addEos: true
  });

  const models = atlas.getModels();
  for (const model of models) {
    const mm = entry.measurements[model.name] as AtlasProfileMeasures | undefined;
    assert.ok(mm);
    assert.strictEqual(mm!.natural.profile, 'natural');
    assert.strictEqual(mm!.safe.profile, 'safe');
    assert.strictEqual(mm!.short.profile, 'short');
    assert.strictEqual(mm!.tight.profile, 'tight');
  }
});

test('measure counts tokens with the named model tokenizer', () => {
  const atlas = new TokenAtlas([
    makeModel('count-test-1'),
    makeModel('count-test-2'),
    makeModel('count-test-3')
  ]);
  const record = createMockRecord('Short text');
  const entry: AtlasEntry = atlas.measure(record);
  const mm = entry.measurements['count-test-1'] as AtlasProfileMeasures | undefined;
  assert.ok(mm);
  assert.ok(mm!.natural.tokenCount > 0, 'Natural token count should be positive');
});

test('profile token counts show reduction for compressed profiles', () => {
  const atlas = new TokenAtlas([
    makeModel('reduction-test-1'),
    makeModel('reduction-test-2'),
    makeModel('reduction-test-3')
  ]);
  const record = createMockRecord(
    'This is a longer sentence with multiple words that should be tokenized differently across profiles.'
  );
  const entry: AtlasEntry = atlas.measure(record);
  const models = atlas.getModels();

  for (const model of models) {
    const mm = entry.measurements[model.name] as AtlasProfileMeasures | undefined;
    assert.ok(mm);
    const natural = mm!.natural.tokenCount;
    const safe = mm!.safe.tokenCount;
    const short = mm!.short.tokenCount;
    const tight = mm!.tight.tokenCount;

    assert.ok(
      tight <= natural || tight === 0,
      `Tight (${tight}) should be <= natural (${natural})`
    );
    assert.ok(
      short <= natural || short === 0,
      `Short (${short}) should be <= natural (${natural})`
    );
    assert.ok(
      safe <= natural || safe === 0,
      `Safe (${safe}) should be <= natural (${natural})`
    );
  }
});

test('measureBatch measures multiple records', () => {
  const atlas = new TokenAtlas([
    makeModel('batch-1'),
    makeModel('batch-2'),
    makeModel('batch-3')
  ]);
  const records = [
    createMockRecord('First record'),
    createMockRecord('Second record'),
    createMockRecord('Third record')
  ];
  const entries = atlas.measureBatch(records);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(atlas.getRecordCount(), 3);
});

// ── Report Tests ──────────────────────────────────────────────────

test('report generates an AtlasReport with aggregates', () => {
  const atlas = new TokenAtlas([
    makeModel('report-model-1'),
    makeModel('report-model-2'),
    makeModel('report-model-3')
  ]);
  atlas.measureBatch([
    createMockRecord('Report test one'),
    createMockRecord('Report test two with more words'),
    createMockRecord('Third report entry')
  ]);
  const report = atlas.report({ title: 'Test Report' });

  assert.strictEqual(report.title, 'Test Report');
  assert.strictEqual(report.models.length, 3);
  assert.deepStrictEqual(report.profiles, ['natural', 'safe', 'short', 'tight']);
  assert.strictEqual(report.totalRecords, 3);
  assert.ok(report.generatedAt > 0);
  assert.ok(report.aggregates);
  assert.strictEqual(report.entries.length, 3);
});

test('report aggregates include averages medians stdDevs ranges', () => {
  const atlas = new TokenAtlas([
    makeModel('agg-1'),
    makeModel('agg-2'),
    makeModel('agg-3')
  ]);
  atlas.measureBatch([
    createMockRecord('Aggregation test record one'),
    createMockRecord('Aggregation test record two longer'),
    createMockRecord('Aggregation test record three even longer sentence')
  ]);
  const report = atlas.report();
  const modelAgg = report.aggregates['agg-1'];

  assert.ok(modelAgg);
  assert.strictEqual(modelAgg.model, 'agg-1');
  assert.ok(modelAgg.averages);
  assert.ok(modelAgg.medians);
  assert.ok(modelAgg.stdDevs);
  assert.ok(modelAgg.ranges);
  assert.ok(modelAgg.avgReduction);

  // All profile keys exist
  assert.ok('natural' in modelAgg.averages);
  assert.ok('safe' in modelAgg.averages);
  assert.ok('short' in modelAgg.averages);
  assert.ok('tight' in modelAgg.averages);
  assert.ok('natural' in modelAgg.medians);
  assert.ok('safe' in modelAgg.medians);
  assert.ok('short' in modelAgg.medians);
  assert.ok('tight' in modelAgg.medians);
  assert.ok('natural' in modelAgg.ranges);
  assert.ok('safe' in modelAgg.ranges);
  assert.ok('short' in modelAgg.ranges);
  assert.ok('tight' in modelAgg.ranges);
});

test('report includes per-model avgReduction', () => {
  const atlas = new TokenAtlas([
    makeModel('red-1'),
    makeModel('red-2'),
    makeModel('red-3')
  ]);
  atlas.measureBatch([
    createMockRecord('Reduction test longer sentence with many words'),
    createMockRecord('Another reduction test with additional text')
  ]);
  const report = atlas.report();
  const reduction = report.aggregates['red-1']?.avgReduction;

  assert.ok(reduction);
  assert.ok('safe' in reduction);
  assert.ok('short' in reduction);
  assert.ok('tight' in reduction);
});

// ── Lifecycle Tests ───────────────────────────────────────────────

test('clear removes all measurements', () => {
  const atlas = new TokenAtlas([
    makeModel('clear-1'),
    makeModel('clear-2'),
    makeModel('clear-3')
  ]);
  atlas.measure(createMockRecord('Before clear'));
  assert.strictEqual(atlas.getRecordCount(), 1);

  atlas.clear();
  assert.strictEqual(atlas.getRecordCount(), 0);
  assert.strictEqual(atlas.getEntries().length, 0);
});

test('getModels returns a copy of the array', () => {
  const models = [makeModel('copy-1'), makeModel('copy-2'), makeModel('copy-3')];
  const atlas = new TokenAtlas(models);
  const retrieved = atlas.getModels();

  assert.strictEqual(retrieved.length, 3);
  assert.strictEqual(retrieved[0]?.name, 'copy-1');
  // Verify it's a different array reference
  retrieved.length = 0;
  assert.strictEqual(atlas.getModels().length, 3);
});

test('getEntries returns a copy', () => {
  const atlas = new TokenAtlas([
    makeModel('entries-1'),
    makeModel('entries-2'),
    makeModel('entries-3')
  ]);
  atlas.measure(createMockRecord('Entry test'));
  const entries = atlas.getEntries();
  assert.strictEqual(entries.length, 1);
  entries.length = 0;
  assert.strictEqual(atlas.getEntries().length, 1);
});

// ── Edge Cases ────────────────────────────────────────────────────

test('measure handles empty source text', () => {
  const atlas = new TokenAtlas([
    makeModel('empty-1'),
    makeModel('empty-2'),
    makeModel('empty-3')
  ]);
  const entry = atlas.measure(createMockRecord('', 'en'));
  const mm = entry.measurements['empty-1'] as AtlasProfileMeasures | undefined;
  assert.ok(mm);
  assert.ok(mm!.natural.tokenCount >= 0);
});

test('measure handles records with existing renderings', () => {
  const atlas = new TokenAtlas([
    makeModel('rendering-1'),
    makeModel('rendering-2'),
    makeModel('rendering-3')
  ]);
  const record = createMockRecord('Record with rendering');
  record.renderings['safe'] = { code: 'safe-profile-code', profile: 'safe', tokens: 5 };
  const entry = atlas.measure(record);
  const mm = entry.measurements['rendering-1'] as AtlasProfileMeasures | undefined;
  assert.ok(mm);
  assert.ok(mm!.natural.tokenCount >= 0);
});

test('AtlasEntry contains fingerprint and sourceLength', () => {
  const atlas = new TokenAtlas([
    makeModel('entry-fields-1'),
    makeModel('entry-fields-2'),
    makeModel('entry-fields-3')
  ]);
  const entry = atlas.measure(createMockRecord('Entry field test'));
  const record = entry.record;

  assert.strictEqual(entry.fingerprint, record.fingerprint);
  assert.strictEqual(entry.sourceLength, record.source.text!.length);
  assert.ok(entry.measuredAt > 0);
});

test('measured named models produce bound model-specific profile artifacts', () => {
  const atlas = TokenAtlas.withCommonModels();
  const entries = atlas.measureBatch([
    createMockRecord('A complete measured record without hidden model assumptions.'),
  ]);
  const result = runVerifiedTokenizerOptimizationPass(entries, {
    modelProfiles: atlas.getModels(),
    sourceRendererProfile: 'generic-en-pivot/0.1',
  });

  assert.strictEqual(result.allSemanticsPreserved, true);
  assert.strictEqual(result.artifacts.length, atlas.getModelCount());
  for (const artifact of result.artifacts) {
    assert.strictEqual(artifact.valid, true);
    assert.strictEqual(artifact.expectedRecordCount, 1);
    assert.strictEqual(artifact.verifiedRecordCount, 1);
    assert.strictEqual(artifact.selections.length, 1);
    assert.deepStrictEqual(
      artifact.tokenizer,
      entries[0]?.tokenizerProfiles[artifact.modelName]
    );
  }
});

// ── Tokenizer-Optimization Pass ───────────────────────────────────

test('runTokenizerOptimizationPass: semantics preserved when fingerprints match', () => {
  const atlas = new TokenAtlas([
    makeModel('opt-1'),
    makeModel('opt-2'),
    makeModel('opt-3')
  ]);
  const record = createMockRecord('Optimization test record');
  const entry = atlas.measure(record);

  const result = runTokenizerOptimizationPass([entry]);
  assert.strictEqual(result.allSemanticsPreserved, true);
  assert.strictEqual(result.recordCount, 1);
  assert.strictEqual(result.results.length, 3); // one per model
  for (const r of result.results) {
    assert.strictEqual(r.semanticsPreserved, true);
    assert.ok(r.bestProfile === 'safe' || r.bestProfile === 'short' || r.bestProfile === 'tight');
    assert.ok(r.bestTokenCount > 0);
    // reductionPct can be negative if the profile adds tokens vs natural
    // (e.g., adding profile wrapper tokens), so only assert it's a number
    assert.ok(typeof r.reductionPct === 'number');
  }
});

test('runTokenizerOptimizationPass: best profile selected correctly', () => {
  const atlas = new TokenAtlas([
    makeModel('best-profile-1'),
    makeModel('best-profile-2'),
    makeModel('best-profile-3')
  ]);
  const record = createMockRecord('Best profile test');
  const entry = atlas.measure(record);

  const result = runTokenizerOptimizationPass([entry]);
  for (const r of result.results) {
    // Best profile should have the lowest token count among non-natural profiles
    const nonNatural = ['safe', 'short', 'tight'] as const;
    for (const profile of nonNatural) {
      if (profile !== r.bestProfile) {
        assert.ok(
          r.profileTokens[profile] >= r.bestTokenCount,
          `${profile} (${r.profileTokens[profile]}) should not be less than best (${r.bestTokenCount})`
        );
      }
    }
  }
});

test('runTokenizerOptimizationPass: empty entries returns empty result', () => {
  const result = runTokenizerOptimizationPass([]);
  assert.strictEqual(result.models.length, 0);
  assert.strictEqual(result.results.length, 0);
  assert.strictEqual(result.recordCount, 0);
  assert.strictEqual(result.allSemanticsPreserved, true);
  assert.strictEqual(result.warnings.length, 0);
});

test('runTokenizerOptimizationPass: multiple records produce multiple results', () => {
  const atlas = new TokenAtlas([
    makeModel('multi-1'),
    makeModel('multi-2'),
    makeModel('multi-3')
  ]);
  const records = [
    createMockRecord('Record A'),
    createMockRecord('Record B'),
    createMockRecord('Record C')
  ];
  const entries = atlas.measureBatch(records);

  const result = runTokenizerOptimizationPass(entries);
  assert.strictEqual(result.recordCount, 3);
  assert.strictEqual(result.results.length, 9); // 3 records × 3 models
  assert.strictEqual(result.allSemanticsPreserved, true);
});

test('runTokenizerOptimizationPass: reduction percentage is correct', () => {
  const atlas = new TokenAtlas([
    makeModel('reduction-1'),
    makeModel('reduction-2'),
    makeModel('reduction-3')
  ]);
  const record = createMockRecord('Reduction percentage test');
  const entry = atlas.measure(record);

  const result = runTokenizerOptimizationPass([entry]);
  for (const r of result.results) {
    const natural = r.profileTokens.natural;
    const best = r.bestTokenCount;
    if (natural > 0) {
      const expectedReduction = Math.round((1 - best / natural) * 10000) / 100;
      assert.strictEqual(
        Math.abs(r.reductionPct - expectedReduction) < 0.01,
        true,
        `Reduction ${r.reductionPct}% should match expected ${expectedReduction}%`
      );
    }
  }
});
