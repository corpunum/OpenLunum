import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeProfileSem, stableStringify } from '@corpunum/lunum';
import {
  CURRENT_SCHEMA_COMPACTION_FIXTURES,
} from '../src/current-schema-compaction-fixtures.js';
import {
  runCurrentSchemaCompactionBenchmark,
} from '../src/current-schema-compaction-benchmark.js';

test('current-schema compaction benchmark uses accepted live schema and real profile renderers', () => {
  const report = runCurrentSchemaCompactionBenchmark(CURRENT_SCHEMA_COMPACTION_FIXTURES, {
    codeCommit: 'test-commit',
    startedAt: '2026-09-01T00:00:00.000Z',
  });

  assert.equal(report.provenance.liveModel, 'NOT_RUN');
  assert.deepEqual(report.provenance.schemaVersions, ['lunum-sem/0.1-draft']);
  assert.ok(report.fixtures.every((fixture) => fixture.schemaValid));
  assert.equal(report.measurements.length, CURRENT_SCHEMA_COMPACTION_FIXTURES.length * 5);
  assert.equal(report.byMode['lunum-safe'].semanticRoundTrips.failed, 0);
  assert.equal(report.byMode['lunum-short'].semanticRoundTrips.failed, 0);
  assert.equal(report.byMode['lunum-tight'].semanticRoundTrips.failed, 0);
  assert.equal(report.byMode.mixed.taskAccuracy, null);
  assert.equal(report.byMode.mixed.tokensPerSuccessfulTask, null);
  assert.ok(report.measurements.every((row) => row.tokens === null));

  const short = report.measurements.find((row) => row.fixtureId === 'rate-limit-fact' && row.mode === 'lunum-short')!;
  assert.ok(short.content.startsWith('LUNUM-SHORT/0.1:'));
  assert.notEqual(short.content, JSON.stringify(CURRENT_SCHEMA_COMPACTION_FIXTURES[0]!.sem));
});

test('mixed context follows computed policy rather than a forced eligible flag', () => {
  const report = runCurrentSchemaCompactionBenchmark(CURRENT_SCHEMA_COMPACTION_FIXTURES, {
    startedAt: '2026-09-01T00:00:00.000Z',
  });
  const safeFixture = CURRENT_SCHEMA_COMPACTION_FIXTURES.find((fixture) => fixture.id === 'safety-constraint-fallback')!;
  const commandFixture = CURRENT_SCHEMA_COMPACTION_FIXTURES.find((fixture) => fixture.id === 'executable-text-fallback')!;
  const eligibleFixture = CURRENT_SCHEMA_COMPACTION_FIXTURES.find((fixture) => fixture.id === 'rate-limit-fact')!;

  for (const fixture of [safeFixture, commandFixture]) {
    const policy = report.fixtures.find((row) => row.id === fixture.id)!;
    const mixed = report.measurements.find((row) => row.fixtureId === fixture.id && row.mode === 'mixed')!;
    assert.equal(policy.policy.eligible, false);
    assert.equal(mixed.policySelected, false);
    assert.equal(mixed.content, fixture.sourceText);
  }

  const eligible = report.measurements.find((row) => row.fixtureId === eligibleFixture.id && row.mode === 'mixed')!;
  assert.equal(eligible.policySelected, true);
  assert.ok(eligible.content.startsWith('LUNUM-SHORT/0.1:'));
});

test('renderer integrity check catches a schema-valid but semantically changed profile payload', () => {
  const report = runCurrentSchemaCompactionBenchmark([CURRENT_SCHEMA_COMPACTION_FIXTURES[0]!], {
    startedAt: '2026-09-01T00:00:00.000Z',
  });
  const rendered = report.measurements.find((row) => row.mode === 'lunum-short')!.content;
  const mutated = rendered.replace('1000', '999');
  const decoded = decodeProfileSem(mutated, 'short');
  assert.notEqual(
    stableStringify(decoded),
    stableStringify(CURRENT_SCHEMA_COMPACTION_FIXTURES[0]!.sem),
    'the round-trip comparator must reject a valid encoding whose literal changed',
  );
});

test('benchmark rejects the obsolete legacy compaction schema instead of silently measuring it', () => {
  const legacy = {
    ...CURRENT_SCHEMA_COMPACTION_FIXTURES[0]!,
    sem: { ...CURRENT_SCHEMA_COMPACTION_FIXTURES[0]!.sem, schema: 'lunum/1.0' },
  };
  assert.throws(
    () => runCurrentSchemaCompactionBenchmark([legacy]),
    /Current-schema compaction fixtures must all pass live validateSem/,
  );
});
