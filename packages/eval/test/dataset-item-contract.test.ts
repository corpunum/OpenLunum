import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildExtractionSchema, runParseExperiment, validateEvaluationGold } from '../src/parse-experiment.js';
import { findWorkspaceRoot, sha256File } from '../src/io.js';
import type { DatasetItem, ExperimentManifest, ModelProfile } from '../src/types.js';
import type { LunumSem } from '@corpunum/lunum';

const goldSem: LunumSem = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [{
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'user' },
      theme: { type: 'concept', id: 'concise_answers' }
    },
    negated: false
  }]
};

const sharedMetadata = {
  id: 'contract-fixture',
  sourceLanguage: 'en',
  sourceText: 'The user prefers concise answers.'
};

const parseItem: DatasetItem = { ...sharedMetadata, expectedOutcome: 'parse', goldSem };
const legacyParseItem: DatasetItem = { ...sharedMetadata, id: 'legacy-parse', goldSem };
const abstainItem: DatasetItem = { ...sharedMetadata, id: 'abstention', expectedOutcome: 'abstain', goldSem: null };

// @ts-expect-error parse outcomes require a nonnull gold Sem.
const parseWithNullGold: DatasetItem = { ...sharedMetadata, expectedOutcome: 'parse', goldSem: null };
// @ts-expect-error an omitted outcome is the legacy parse outcome and requires gold.
const legacyParseWithNullGold: DatasetItem = { ...sharedMetadata, goldSem: null };
// @ts-expect-error abstention outcomes require null gold.
const abstainWithGold: DatasetItem = { ...sharedMetadata, expectedOutcome: 'abstain', goldSem };

void [parseWithNullGold, legacyParseWithNullGold, abstainWithGold];

async function extractionSchema(): Promise<Record<string, unknown>> {
  const workspaceRoot = await findWorkspaceRoot();
  const semSchema = JSON.parse(await readFile(path.join(workspaceRoot, 'schemas/lunum-sem.schema.json'), 'utf8')) as Record<string, unknown>;
  return buildExtractionSchema(semSchema);
}

test('DatasetItem outcome assignments agree with runtime gold preflight', async () => {
  const schema = await extractionSchema();
  const valid = validateEvaluationGold([parseItem, legacyParseItem, abstainItem], schema);
  assert.deepEqual(valid.invalid, []);
  assert.equal(valid.abstentionCases, 1);

  // Raw JSON simulates persisted input that bypassed TypeScript's assignment checks.
  const invalidRows = JSON.parse(`[${[
    JSON.stringify({ ...sharedMetadata, expectedOutcome: 'parse', goldSem: null }),
    JSON.stringify({ ...sharedMetadata, id: 'legacy-null', goldSem: null })
  ].join(',')}]`) as DatasetItem[];
  const invalid = validateEvaluationGold(invalidRows, schema);
  assert.equal(invalid.invalid.length, 2);
  assert.ok(invalid.invalid.every((row) => row.stages.includes('metadata')));
});

test('invalid persisted outcome/gold metadata fails before provider requests', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'must-not-be-requested' }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'lunum-dataset-item-contract-'));

  try {
    const datasetPath = path.join(temporaryDirectory, 'dataset.jsonl');
    const invalidItem = { ...sharedMetadata, goldSem: null };
    await writeFile(datasetPath, `${JSON.stringify(invalidItem)}\n`, 'utf8');

    const profilePath = path.join(temporaryDirectory, 'profile.json');
    const profile: ModelProfile = {
      schema: 'openlunum-model-profile/0.1',
      id: 'no-call-profile',
      provider: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: 'must-not-be-requested',
      temperature: 0,
      timeoutMs: 2000
    };
    await writeFile(profilePath, JSON.stringify(profile), 'utf8');

    const manifest: ExperimentManifest = {
      schema: 'openlunum-experiment/0.1',
      id: 'dataset-item-contract-preflight',
      area: 'multilingual-parse',
      task: 'parse',
      hypothesis: 'invalid dataset outcome metadata is rejected before provider requests',
      baselineCommit: 'test',
      dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
      modelProfile: profilePath,
      limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
      gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
      outputDirectory: path.join(temporaryDirectory, 'reports')
    };
    const manifestPath = path.join(temporaryDirectory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

    await assert.rejects(runParseExperiment(manifestPath), /complete preflight gate/u);
    assert.deepEqual(requests, []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
