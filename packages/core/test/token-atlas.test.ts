import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { TokenAtlas, type AtlasProfileMeasures, type LunumRecord, type ModelTokenizerProfile } from '../src/index.js';
import { runTokenizerOptimizationPass } from '../src/token-optimization-compat.js';
import { runVerifiedTokenizerOptimizationPass } from '../src/token-optimization.js';

function createMockRecord(text: string, predicate = 'test'): LunumRecord {
  const sem: LunumRecord['sem'] = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test-world',
    kind: predicate,
    clauses: [{ predicate, roles: { subject: 'entity', description: 'A value that remains intact across renderer profiles.' } }],
    annotations: { source: 'test' },
    provenance: { author: 'test' },
  };
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text, language: 'en', role: null, ref: null },
    sem,
    fingerprint: fingerprintSem(sem),
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low', confidence: 0.95, reasons: ['test policy'] },
    meta: {},
  };
}

function model(name: string): ModelTokenizerProfile {
  return { name, tokenizer: { model: name, addBos: true, addEos: true } };
}

function atlas(): TokenAtlas {
  return new TokenAtlas([model('alpha'), model('beta'), model('gamma')]);
}

test('TokenAtlas requires at least three named models and exposes defensive copies', () => {
  assert.throws(() => new TokenAtlas([model('a'), model('b')]), /requires at least 3 named models/u);
  const measured = atlas();
  assert.equal(measured.getModelCount(), 3);
  const models = measured.getModels();
  models.length = 0;
  assert.equal(measured.getModelCount(), 3);
});

test('withCommonModels binds three explicit tokenizer identities', () => {
  const measured = TokenAtlas.withCommonModels();
  assert.deepEqual(measured.getModels().map((entry) => entry.name), [
    'llama3.1-8b-instruct',
    'qwen2.5-7b-instruct',
    'mistral-7b-instruct-v0.3',
  ]);
});

test('measure records natural and three distinct renderer profiles with tokenizer identity', () => {
  const measured = atlas();
  const record = createMockRecord('A natural-language input whose token count is measured rather than assumed.');
  const entry = measured.measure(record);

  assert.equal(entry.record, record);
  assert.equal(entry.fingerprint, record.fingerprint);
  assert.equal(entry.sourceLength, record.source.text.length);
  assert.ok(entry.measuredAt > 0);
  assert.deepEqual(entry.tokenizerProfiles.alpha, model('alpha').tokenizer);

  for (const modelName of ['alpha', 'beta', 'gamma']) {
    const counts = entry.measurements[modelName];
    assert.ok(counts);
    assert.deepEqual(
      [counts.natural.profile, counts.safe.profile, counts.short.profile, counts.tight.profile],
      ['natural', 'safe', 'short', 'tight'],
    );
    assert.ok(counts.natural.tokenCount > 0);
    assert.ok(counts.safe.tokenCount > 0);
    assert.ok(counts.short.tokenCount > 0);
    assert.ok(counts.tight.tokenCount > 0);
    assert.ok(counts.short.tokenCount <= counts.safe.tokenCount, `${modelName}: short must not exceed safe`);
    assert.ok(counts.tight.tokenCount <= counts.short.tokenCount, `${modelName}: tight must not exceed short`);
  }
});

test('natural-language comparison remains empirical and can show profile overhead', () => {
  const entry = atlas().measure(createMockRecord('x'));
  const counts = entry.measurements.alpha!;
  assert.ok(counts.safe.tokenCount > counts.natural.tokenCount);
  assert.ok(counts.short.tokenCount > counts.natural.tokenCount);
  assert.ok(counts.tight.tokenCount > counts.natural.tokenCount);
});

test('measureBatch, report, accessors, and clear preserve measured evidence', () => {
  const measured = atlas();
  const entries = measured.measureBatch([
    createMockRecord('First measured record.', 'first'),
    createMockRecord('Second measured record with more words.', 'second'),
  ]);
  assert.equal(entries.length, 2);
  assert.equal(measured.getRecordCount(), 2);

  const report = measured.report({ title: 'Renderer Atlas' });
  assert.equal(report.title, 'Renderer Atlas');
  assert.deepEqual(report.models, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(report.profiles, ['natural', 'safe', 'short', 'tight']);
  assert.equal(report.totalRecords, 2);
  assert.equal(report.entries.length, 2);
  assert.ok(report.generatedAt > 0);
  for (const modelName of report.models) {
    const aggregate = report.aggregates[modelName];
    assert.ok(aggregate);
    for (const profile of report.profiles) {
      assert.ok(profile in aggregate.averages);
      assert.ok(profile in aggregate.medians);
      assert.ok(profile in aggregate.stdDevs);
      assert.ok(profile in aggregate.ranges);
    }
  }

  const copy = measured.getEntries();
  copy.length = 0;
  assert.equal(measured.getRecordCount(), 2);
  measured.clear();
  assert.equal(measured.getRecordCount(), 0);
});

test('measure preserves existing renderings while measuring generated profile codes', () => {
  const record = createMockRecord('Record with an existing rendering.');
  record.renderings.en = { code: 'Existing natural rendering.', profile: 'natural/en', tokens: 4 };
  const entry = atlas().measure(record);
  assert.deepEqual(entry.record.renderings.en, record.renderings.en);
  assert.ok(entry.measurements.alpha?.safe.tokenCount);
});

test('verified optimization binds every result to current fingerprints and exact tokenizer profiles', () => {
  const measured = atlas();
  const entries = measured.measureBatch([createMockRecord('A complete measured record.')]);
  const verified = runVerifiedTokenizerOptimizationPass(entries, {
    modelProfiles: measured.getModels(),
    sourceRendererProfile: 'renderer-profiles/0.1',
  });

  assert.equal(verified.allSemanticsPreserved, true);
  assert.equal(verified.artifacts.length, 3);
  for (const artifact of verified.artifacts) {
    assert.equal(artifact.valid, true);
    assert.equal(artifact.expectedRecordCount, 1);
    assert.equal(artifact.verifiedRecordCount, 1);
    assert.deepEqual(artifact.tokenizer, entries[0]!.tokenizerProfiles[artifact.modelName]);
    assert.equal(artifact.selections[0]?.recordFingerprint, entries[0]!.fingerprint);
  }
});

test('compatibility optimization entry point delegates to the verified path', () => {
  const entries = atlas().measureBatch([createMockRecord('Compatibility entry point.')]);
  const result = runTokenizerOptimizationPass(entries);
  assert.equal(result.allSemanticsPreserved, true);
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every((entry) => entry.originalFingerprint === entries[0]!.fingerprint));
});

test('optimization fails closed for stale attached fingerprints', () => {
  const measured = atlas();
  const entry = measured.measure(createMockRecord('Stale fingerprint test.'));
  entry.fingerprint = 'lfp:0.1:sha256:stale-attached-value';

  const result = runVerifiedTokenizerOptimizationPass([entry], { modelProfiles: measured.getModels() });
  assert.equal(result.allSemanticsPreserved, false);
  assert.equal(result.results.length, 0);
  assert.match(result.warnings.join('\n'), /attached fingerprint is stale or inconsistent/u);
});

test('invalid token measurements fail closed', () => {
  const measured = atlas();
  const entry = measured.measure(createMockRecord('Invalid count test.'));
  const counts = entry.measurements.alpha as AtlasProfileMeasures;
  counts.tight.tokenCount = 0;

  const result = runVerifiedTokenizerOptimizationPass([entry], { modelProfiles: measured.getModels() });
  assert.equal(result.allSemanticsPreserved, false);
  assert.match(result.warnings.join('\n'), /tokenCount must be a positive safe integer/u);
});
