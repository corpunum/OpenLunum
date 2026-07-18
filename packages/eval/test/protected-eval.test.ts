import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import {
  validateProtectedManifest,
  resolveDatasetPath,
  validateDataset,
  createRedactedReport,
  isWorkerRole,
  verifyNoProtectedLeakage,
  type ProtectedEvalManifest,
  type ProtectedDataset
} from '../src/protected-eval.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function makeManifest(overrides?: Partial<ProtectedEvalManifest>): ProtectedEvalManifest {
  return {
    schema: 'openlunum-protected-eval/0.1',
    id: 'test-protected-eval',
    version: 'v1.0.0',
    datasetId: 'test-dataset-1',
    dataset: {
      path: '/tmp/test-protected.jsonl',
      sha256: 'a'.repeat(64),
      license: 'MIT'
    },
    instructions: 'Evaluate protected examples for parse accuracy and semantic preservation.',
    coverage: {
      tasks: ['parse', 'realize'],
      languages: ['en', 'el'],
      categories: ['preference', 'requirement']
    },
    ...overrides
  };
}

// ---- Schema and validation tests ----

test('valid protected-eval manifest passes validation', () => {
  const manifest = makeManifest();
  assert.doesNotThrow(() => validateProtectedManifest(manifest));
});

test('invalid schema is rejected', () => {
  assert.throws(
    () => validateProtectedManifest(makeManifest({ schema: 'openlunum-protected-eval/0.2' as any })),
    { message: /Unsupported protected-eval schema/ }
  );
});

test('missing datasetId is rejected', () => {
  const manifest = makeManifest();
  delete (manifest as any).datasetId;
  assert.throws(() => validateProtectedManifest(manifest), { message: /datasetId is required/ });
});

test('invalid version format is rejected', () => {
  assert.throws(
    () => validateProtectedManifest(makeManifest({ version: '1.0.0' })),
    { message: /Invalid version format/ }
  );
});

test('missing license is rejected', () => {
  assert.throws(
    () => validateProtectedManifest(makeManifest({ dataset: { path: '/tmp/x', sha256: 'b'.repeat(64), license: '' } })),
    { message: /Dataset license is required/ }
  );
});

test('short instructions are rejected', () => {
  assert.throws(
    () => validateProtectedManifest(makeManifest({ instructions: 'Short' })),
    { message: /at least 10 characters/ }
  );
});

test('missing coverage is rejected', () => {
  assert.throws(
    () => validateProtectedManifest(makeManifest({ coverage: undefined as any })),
    { message: /Coverage must include/ }
  );
});

// ---- Dataset resolution tests ----

test('dataset path resolves from environment variable', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-protected-'));
  const datasetPath = path.join(temp, 'protected.jsonl');
  await writeFile(datasetPath, 'test data', 'utf8');

  try {
    // Set environment variable
    const origEnv = process.env.TEST_PROTECTED_DS;
    process.env.TEST_PROTECTED_DS = datasetPath;

    const resolved = await resolveDatasetPath(
      {
        path: '$TEST_PROTECTED_DS',
        sha256: '',
        license: 'MIT',
        envVar: 'TEST_PROTECTED_DS'
      },
      WORKSPACE_ROOT
    );

    assert.strictEqual(resolved, datasetPath);

    // Restore environment
    if (origEnv !== undefined) {
      process.env.TEST_PROTECTED_DS = origEnv;
    } else {
      delete process.env.TEST_PROTECTED_DS;
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('dataset path resolves from absolute path', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-protected-'));
  try {
    const datasetPath = path.join(temp, 'protected.jsonl');

    const resolved = await resolveDatasetPath(
      {
        path: datasetPath,
        sha256: '',
        license: 'MIT'
      },
      WORKSPACE_ROOT
    );

    assert.strictEqual(resolved, datasetPath);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('dataset path resolves from relative path', async () => {
  const relativePath = 'datasets/protected/test.jsonl';
  const expectedPath = path.join(WORKSPACE_ROOT, relativePath);

  const resolved = await resolveDatasetPath(
    {
      path: relativePath,
      sha256: '',
      license: 'MIT'
    },
    WORKSPACE_ROOT
  );

  assert.strictEqual(resolved, expectedPath);
});

test('missing environment variable throws error', async () => {
  await assert.rejects(
    resolveDatasetPath(
      {
        path: '$NONEXISTENT_VAR',
        sha256: '',
        license: 'MIT',
        envVar: 'NONEXISTENT_VAR'
      },
      WORKSPACE_ROOT
    ),
    { message: /Missing environment variable: NONEXISTENT_VAR/ }
  );
});

// ---- Dataset validation tests ----

test('valid dataset passes hash validation', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-protected-'));
  try {
    const content = 'test protected data';
    const datasetPath = path.join(temp, 'protected.jsonl');
    await writeFile(datasetPath, content, 'utf8');

    const crypto = await import('node:crypto');
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

    // Should not throw
    await validateDataset(datasetPath, expectedHash);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('hash mismatch is detected', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-protected-'));
  try {
    const datasetPath = path.join(temp, 'protected.jsonl');
    await writeFile(datasetPath, 'test data', 'utf8');

    await assert.rejects(
      validateDataset(datasetPath, '0'.repeat(64)),
      { message: /Dataset hash mismatch/ }
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('missing dataset file throws error', async () => {
  await assert.rejects(
    validateDataset('/nonexistent/protected/dataset.jsonl', 'a'.repeat(64)),
    { message: /Protected dataset not found/ }
  );
});

// ---- Redacted report tests ----

test('redacted report contains aggregate metrics', () => {
  const manifest = makeManifest();

  const results = [
    { status: 'passed' as const, exact: true, featureRecall: 0.9 },
    { status: 'passed' as const, exact: true, featureRecall: 0.8 },
    { status: 'failed' as const, exact: false, featureRecall: 0.5 }
  ];

  const report = createRedactedReport(manifest, results);

  assert.strictEqual(report.experimentId, 'test-protected-eval');
  assert.strictEqual(report.version, 'v1.0.0');
  assert.strictEqual(report.datasetId, 'test-dataset-1');
  assert.strictEqual(report.items, 3);
  assert.strictEqual(report.passed, 2);
  assert.strictEqual(report.failed, 1);
  assert.ok(report.exactRate > 0);
  assert.ok(report.featureRecall > 0);
  assert.ok(report.integrityHash.length > 0);
});

test('redacted report has consistent integrity hash', () => {
  const manifest = makeManifest({ id: 'test-consistent' });

  const report1 = createRedactedReport(manifest, []);
  const report2 = createRedactedReport(manifest, []);

  // Same input should produce same integrity hash
  assert.strictEqual(report1.integrityHash, report2.integrityHash);
});

test('empty results produce zero metrics', () => {
  const manifest = makeManifest();

  const report = createRedactedReport(manifest, []);

  assert.strictEqual(report.items, 0);
  assert.strictEqual(report.passed, 0);
  assert.strictEqual(report.failed, 0);
  assert.strictEqual(report.exactRate, 0);
  assert.strictEqual(report.featureRecall, 0);
});

// ---- Role and leakage tests ----

test('worker role is distinguishable from evaluator', () => {
  assert.strictEqual(isWorkerRole('worker'), true);
  assert.strictEqual(isWorkerRole('agent'), true);
  assert.strictEqual(isWorkerRole('evaluator'), false);
  assert.strictEqual(isWorkerRole('protected-evaluator'), false);
});

test('verifyNoProtectedLeakage does not throw on large manifests', () => {
  const largeManifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'test',
    area: 'parse' as const,
    task: 'parse' as const,
    hypothesis: 'Test hypothesis for large manifest',
    baselineCommit: 'abc123',
    limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 1 },
    gates: { minimumFeatureRecall: 0.5, minimumExactRate: 0.5, requireProtectedLiteralCoverage: false },
    outputDirectory: 'reports/test'
  };

  // Add a large inline object to simulate protected data leakage
  const leakedManifest = { ...largeManifest, protectedData: 'x'.repeat(10001) };

  // Should not throw
  assert.doesNotThrow(() => verifyNoProtectedLeakage(leakedManifest as any));
});
