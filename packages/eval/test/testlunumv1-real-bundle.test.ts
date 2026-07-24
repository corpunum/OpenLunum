import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';

import { generateTestLunumV1RealBundle, NOT_AVAILABLE } from '../src/testlunumv1-real-bundle.js';
import { TESTLUNUMV1_AUDIT_RECORD_SCHEMA, type TestLunumV1AuditRecord } from '../src/testlunumv1-audit-records.js';

// --- Fixture builder: hand-built TestLunumV1AuditRecord shapes, exactly    ---
// --- matching the #314 adapter's real output contract. No target-model    ---
// --- calls anywhere in this file.                                         ---

const RUN_ID = 'fixture-real-run-001';
const DATASET_PATH = 'packages/eval/test-fixtures/testlunumv1/canonical-dataset.json';
const DATASET_SHA256 = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const GENERATED_AT = '2026-07-24T00:00:00.000Z';

function makeRecord(overrides: Partial<TestLunumV1AuditRecord> & Pick<TestLunumV1AuditRecord, 'executionId' | 'suiteId' | 'itemId' | 'sourceLanguage' | 'modelSlotId' | 'targetModelProfileId' | 'targetModelProfileSha256' | 'status' | 'latencyMs'>): TestLunumV1AuditRecord {
  const errorClass = overrides.status === 'passed'
    ? 'none'
    : overrides.status === 'error'
      ? 'transport_error'
      : 'unknown_failure';
  return {
    schema: TESTLUNUMV1_AUDIT_RECORD_SCHEMA,
    runId: RUN_ID,
    piWorkerId: 'audit-instrumentation',
    piWorkerModel: 'openai/gpt-5.4-mini',
    cliPath: 'parse-experiment',
    stage: 1,
    stageName: 'parse',
    repeatLabel: 'official',
    attempt: 1,
    datasetPath: DATASET_PATH,
    datasetSha256: DATASET_SHA256,
    rawOutput: overrides.status === 'error' ? null : '{"kind":"preference"}',
    extractedPayload: overrides.status === 'error' ? null : { kind: 'preference' },
    parsedSem: overrides.status === 'error' ? null : { kind: 'preference' },
    goldSem: overrides.suiteId === 'canonical' ? { kind: 'preference' } : null,
    exact: overrides.status === 'passed' && overrides.suiteId === 'canonical',
    nearSemanticOnly: false,
    usage: null,
    finishReason: null,
    systemPromptSha256: null,
    userPromptSha256: null,
    errorClass,
    errorMessage: overrides.status === 'passed' ? null : `synthetic ${overrides.status} for fixture`,
    generatedAt: GENERATED_AT,
    ...overrides
  };
}

function buildFixtureRecords(): TestLunumV1AuditRecord[] {
  return [
    makeRecord({ executionId: 'canonical:item-1:slot-a:stage-1:repeat-official', suiteId: 'canonical', itemId: 'item-1', sourceLanguage: 'en', modelSlotId: 'slot-a', targetModelProfileId: 'model-a', targetModelProfileSha256: 'aaaa...', status: 'passed', latencyMs: 10 }),
    makeRecord({ executionId: 'canonical:item-2:slot-a:stage-1:repeat-official', suiteId: 'canonical', itemId: 'item-2', sourceLanguage: 'el', modelSlotId: 'slot-a', targetModelProfileId: 'model-a', targetModelProfileSha256: 'aaaa...', status: 'passed', latencyMs: 15 }),
    makeRecord({ executionId: 'canonical:item-3:slot-b:stage-1:repeat-official', suiteId: 'canonical', itemId: 'item-3', sourceLanguage: 'es', modelSlotId: 'slot-b', targetModelProfileId: 'model-b', targetModelProfileSha256: 'bbbb...', status: 'failed', latencyMs: 22 }),
    makeRecord({ executionId: 'canonical:item-4:slot-b:stage-1:repeat-official', suiteId: 'canonical', itemId: 'item-4', sourceLanguage: 'en', modelSlotId: 'slot-b', targetModelProfileId: 'model-b', targetModelProfileSha256: 'bbbb...', status: 'error', latencyMs: 5 }),
    makeRecord({ executionId: 'mutation:negation:slot-a:stage-1:repeat-official', suiteId: 'mutation', itemId: 'negation', sourceLanguage: 'en', modelSlotId: 'slot-a', targetModelProfileId: 'model-a', targetModelProfileSha256: 'aaaa...', status: 'passed', latencyMs: 30, cliPath: 'retention', stageName: 'realization' }),
    makeRecord({ executionId: 'mutation:negation:slot-a:stage-1:repeat-official', suiteId: 'mutation', itemId: 'negation', sourceLanguage: 'en', modelSlotId: 'slot-a', targetModelProfileId: 'model-a', targetModelProfileSha256: 'aaaa...', status: 'passed', latencyMs: 35, cliPath: 'retention', stageName: 'parse-back' }),
    makeRecord({ executionId: 'mutation:modality:slot-b:stage-1:repeat-official', suiteId: 'mutation', itemId: 'modality', sourceLanguage: 'el', modelSlotId: 'slot-b', targetModelProfileId: 'model-b', targetModelProfileSha256: 'bbbb...', status: 'failed', latencyMs: 40, cliPath: 'retention', stageName: 'realization', errorClass: 'realization_empty_output' }),
    makeRecord({ executionId: 'robustness:fenced-json:slot-a:stage-1:repeat-official', suiteId: 'robustness', itemId: 'fenced-json', sourceLanguage: 'es', modelSlotId: 'slot-a', targetModelProfileId: 'model-a', targetModelProfileSha256: 'aaaa...', status: 'passed', latencyMs: 8 }),
    makeRecord({ executionId: 'robustness:http-errors:slot-b:stage-1:repeat-official', suiteId: 'robustness', itemId: 'http-errors', sourceLanguage: 'id', modelSlotId: 'slot-b', targetModelProfileId: 'model-b', targetModelProfileSha256: 'bbbb...', status: 'error', latencyMs: 3 })
  ];
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(resolved));
    } else {
      files.push(resolved);
    }
  }
  return files;
}

async function flattenRawFiles(recordsRoot: string): Promise<Array<Record<string, unknown>>> {
  const files = (await collectFiles(recordsRoot)).filter((file) => file.endsWith('.jsonl'));
  const rows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const line of content.split(/\r?\n/u).filter((value) => value.trim())) {
      rows.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  return rows;
}

async function assertFileExists(file: string): Promise<void> {
  const content = await readFile(file, 'utf8');
  assert.ok(content.length > 0, `${file} should not be empty`);
}

function readJson<T>(file: string): Promise<T> {
  return readFile(file, 'utf8').then((content) => JSON.parse(content) as T);
}

test('testLunumv1 real bundle generator rejects empty records, mismatched runId, and mismatched dataset provenance', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-real-'));
  try {
    await assert.rejects(
      generateTestLunumV1RealBundle({ runId: RUN_ID, protocolVersion: '1.0.0', evaluatedSha: 'sha', repositoryStateSha256: 'sha', outputRoot: temp, generatedAt: GENERATED_AT, records: [] }),
      /records must not be empty/
    );

    const records = buildFixtureRecords();
    const badRunId = [{ ...records[0]!, runId: 'wrong-run-id' }];
    await assert.rejects(
      generateTestLunumV1RealBundle({ runId: RUN_ID, protocolVersion: '1.0.0', evaluatedSha: 'sha', repositoryStateSha256: 'sha', outputRoot: temp, generatedAt: GENERATED_AT, records: badRunId }),
      /does not match input runId/
    );

    const badDataset = [records[0]!, { ...records[1]!, datasetSha256: 'different-sha' }];
    await assert.rejects(
      generateTestLunumV1RealBundle({ runId: RUN_ID, protocolVersion: '1.0.0', evaluatedSha: 'sha', repositoryStateSha256: 'sha', outputRoot: temp, generatedAt: GENERATED_AT, records: badDataset }),
      /disagree on datasetSha256/
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('testLunumv1 real bundle generator writes the complete protocol layout and recomputes every aggregate from raw JSONL', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-real-'));
  const outputRoot = path.join(temp, 'reports', 'evaluations', 'testLunumv1');
  try {
    const records = buildFixtureRecords();
    const result = await generateTestLunumV1RealBundle({
      runId: RUN_ID,
      protocolVersion: '1.0.0',
      evaluatedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      repositoryStateSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      outputRoot,
      generatedAt: GENERATED_AT,
      records
    });

    assert.equal(result.summary.totalRecords, records.length);
    assert.equal(result.summary.passedRecords + result.summary.failedRecords + result.summary.errorRecords, records.length);

    const bundleRoot = path.join(outputRoot, RUN_ID);
    for (const file of [
      'README.md',
      'run-manifest.json',
      'environment.md',
      'repository-state.md',
      'dataset-inventory.json',
      'dataset-hashes.txt',
      'prompt-schema-hashes.txt',
      'summary.json',
      'overall-scorecard.md',
      'focus-recommendations.md'
    ]) {
      await assertFileExists(path.join(bundleRoot, file));
    }

    for (const file of [
      'tables/overall.csv',
      'tables/by-suite.csv',
      'tables/by-language.csv',
      'tables/by-model.csv',
      'tables/by-worker.csv',
      'tables/by-model-worker.csv',
      'tables/by-model-slot.csv',
      'tables/latency.csv',
      'tables/tokens.csv',
      'tables/by-error-class.csv',
      'tables/failures.csv'
    ]) {
      await assertFileExists(path.join(bundleRoot, file));
    }

    await assertFileExists(path.join(bundleRoot, 'failure-gallery', 'index.md'));

    // Recompute every aggregate from the raw JSONL and compare to summary.json.
    const rawRecords = await flattenRawFiles(path.join(bundleRoot, 'raw'));
    assert.equal(rawRecords.length, records.length);
    const summary = await readJson<{ totalRecords: number; passedRecords: number; failedRecords: number; errorRecords: number }>(path.join(bundleRoot, 'summary.json'));
    assert.equal(summary.totalRecords, rawRecords.length);
    assert.equal(summary.passedRecords, rawRecords.filter((r) => r.status === 'passed').length);
    assert.equal(summary.failedRecords, rawRecords.filter((r) => r.status === 'failed').length);
    assert.equal(summary.errorRecords, rawRecords.filter((r) => r.status === 'error').length);

    // N/A rendering for unavailable instrumentation.
    const promptHashes = await readFile(path.join(bundleRoot, 'prompt-schema-hashes.txt'), 'utf8');
    assert.match(promptHashes, new RegExp(NOT_AVAILABLE));
    const tokensCsv = await readFile(path.join(bundleRoot, 'tables', 'tokens.csv'), 'utf8');
    assert.match(tokensCsv, new RegExp(NOT_AVAILABLE));
    const runManifest = await readJson<{ promptSchemaSha256: string }>(path.join(bundleRoot, 'run-manifest.json'));
    assert.equal(runManifest.promptSchemaSha256, NOT_AVAILABLE);

    // Exactly three focus recommendations.
    const focus = await readFile(path.join(bundleRoot, 'focus-recommendations.md'), 'utf8');
    const numberedLines = focus.split('\n').filter((line) => /^\d+\./u.test(line));
    assert.equal(numberedLines.length, 3);

    // Failure gallery surfaces every non-passed record with its error class.
    const gallery = await readFile(path.join(bundleRoot, 'failure-gallery', 'index.md'), 'utf8');
    const nonPassed = records.filter((r) => r.status !== 'passed');
    for (const record of nonPassed) {
      assert.ok(gallery.includes(record.errorClass), `gallery should mention error class ${record.errorClass}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('testLunumv1 real bundle generator is deterministic: identical fixture input produces byte-identical output on a second run', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-testlunumv1-real-'));
  try {
    const outputRootA = path.join(temp, 'run-a', 'reports', 'evaluations', 'testLunumv1');
    const outputRootB = path.join(temp, 'run-b', 'reports', 'evaluations', 'testLunumv1');
    const records = buildFixtureRecords();
    const input = {
      runId: RUN_ID,
      protocolVersion: '1.0.0',
      evaluatedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      repositoryStateSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      generatedAt: GENERATED_AT,
      records
    };

    await generateTestLunumV1RealBundle({ ...input, outputRoot: outputRootA });
    // Shuffle the input record order -- the sort key inside the generator must make this a no-op on output.
    await generateTestLunumV1RealBundle({ ...input, outputRoot: outputRootB, records: [...records].reverse() });

    const filesA = (await collectFiles(path.join(outputRootA, RUN_ID))).sort();
    const filesB = (await collectFiles(path.join(outputRootB, RUN_ID))).sort();
    const relativeA = filesA.map((file) => path.relative(outputRootA, file));
    const relativeB = filesB.map((file) => path.relative(outputRootB, file));
    assert.deepEqual(relativeA, relativeB);

    for (let index = 0; index < filesA.length; index += 1) {
      const contentA = await readFile(filesA[index]!, 'utf8');
      const contentB = await readFile(filesB[index]!, 'utf8');
      assert.equal(contentA, contentB, `${relativeA[index]} should be byte-identical across runs`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
