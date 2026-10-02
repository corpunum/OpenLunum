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

const canonicalPreference = {
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

const daylightPreference = {
  schema: 'lunum-sem/0.1-draft',
  world: 'real',
  kind: 'preference',
  clauses: [{
    predicate: 'prefer',
    roles: {
      experiencer: { type: 'actor', id: 'Priya' },
      theme: { type: 'concept', id: 'daylight' }
    },
    negated: false
  }]
};

function item(overrides: Record<string, unknown> = {}): DatasetItem {
  return {
    id: 'valid-parse',
    sourceLanguage: 'en',
    sourceText: 'The user prefers concise answers.',
    goldSem: canonicalPreference as DatasetItem['goldSem'],
    ...overrides
  } as DatasetItem;
}

async function extractionSchema(): Promise<Record<string, unknown>> {
  const workspaceRoot = await findWorkspaceRoot();
  const semSchema = JSON.parse(await readFile(path.join(workspaceRoot, 'schemas/lunum-sem.schema.json'), 'utf8')) as Record<string, unknown>;
  return buildExtractionSchema(semSchema);
}

test('gold metadata preflight enforces outcome/gold agreement and required unique source metadata', async () => {
  const schema = await extractionSchema();
  const validParse = validateEvaluationGold([item()], schema);
  assert.deepEqual(validParse.invalid, []);
  assert.equal(validParse.abstentionCases, 0);

  const validAbstention = validateEvaluationGold([item({
    id: 'valid-abstention',
    expectedOutcome: 'abstain',
    goldSem: null
  })], schema);
  assert.deepEqual(validAbstention.invalid, []);
  assert.equal(validAbstention.abstentionCases, 1);

  const emptyCorpus = validateEvaluationGold([], schema);
  assert.equal(emptyCorpus.total, 0);
  assert.deepEqual(emptyCorpus.invalid[0]?.stages, ['metadata']);
  assert.deepEqual(emptyCorpus.invalid[0]?.metadataErrors, ['dataset must contain at least one item']);

  const invalidCases: Array<{ label: string; rows: DatasetItem[] }> = [
    { label: 'parse with null gold', rows: [item({ expectedOutcome: 'parse', goldSem: null })] },
    { label: 'abstain with canonical gold', rows: [item({ expectedOutcome: 'abstain' })] },
    { label: 'abstain without explicit null', rows: [item({ expectedOutcome: 'abstain', goldSem: undefined })] },
    { label: 'unknown outcome', rows: [item({ expectedOutcome: 'review' })] },
    { label: 'null outcome', rows: [item({ expectedOutcome: null })] },
    { label: 'missing gold', rows: [item({ goldSem: undefined })] },
    { label: 'blank id', rows: [item({ id: '  ' })] },
    { label: 'blank source text', rows: [item({ sourceText: '  ' })] },
    { label: 'blank source language', rows: [item({ sourceLanguage: '' })] },
    { label: 'unsupported source language', rows: [item({ sourceLanguage: 'xx' })] },
    { label: 'duplicate ids', rows: [item(), item({ sourceText: 'A second source.' })] },
    { label: 'null row', rows: [null as unknown as DatasetItem] },
    { label: 'primitive row', rows: ['malformed' as unknown as DatasetItem] },
    { label: 'array row', rows: [[] as unknown as DatasetItem] }
  ];

  for (const invalidCase of invalidCases) {
    const report = validateEvaluationGold(invalidCase.rows, schema);
    assert.ok(report.invalid.length > 0, `${invalidCase.label} should be invalid`);
    assert.ok(report.invalid.every((invalid) => invalid.stages.includes('metadata')), `${invalidCase.label} should fail at metadata stage`);
  }
});

test('gold source-literal preflight rejects dropped source numbers and identifiers and reports counts', async () => {
  const schema = await extractionSchema();
  const cases = [
    {
      id: 'dropped-threshold',
      sourceText: 'Priya prefers daylight only above 5.',
      missingNumbers: [5],
      missingIdentifiers: []
    },
    {
      id: 'dropped-identifier',
      sourceText: 'Priya prefers daylight for AC-17.',
      missingNumbers: [],
      missingIdentifiers: ['ac-17']
    }
  ];

  for (const fixture of cases) {
    const report = validateEvaluationGold([item({
      id: fixture.id,
      sourceText: fixture.sourceText,
      goldSem: daylightPreference
    })], schema);
    assert.equal(report.sourceLiteralRetentionChecked, 1);
    assert.equal(report.sourceLiteralRetentionValid, 0);
    assert.ok(report.invalid[0]?.stages.includes('source-literal-retention'));
    assert.ok(report.invalid[0]?.stages.includes('semantic-identity'));
    assert.equal(report.identityValid, 0);
    assert.deepEqual(report.invalid[0]?.sourceLiteralErrors, {
      missingNumbers: fixture.missingNumbers,
      missingIdentifiers: fixture.missingIdentifiers
    });
  }

  // Counterexample to a quality claim: embedding digits in an ID meets this
  // necessary presence floor, but does not prove a faithful quantity/scope.
  const retainedSem = structuredClone(daylightPreference);
  retainedSem.clauses[0]!.roles.theme.id = 'daylight 5 AC-17';
  const retained = validateEvaluationGold([item({
    id: 'retained-literals',
    sourceText: 'Priya prefers daylight 5 for AC-17.',
    goldSem: retainedSem
  })], schema);
  assert.deepEqual(retained.invalid, []);
  assert.equal(retained.sourceLiteralRetentionChecked, 1);
  assert.equal(retained.sourceLiteralRetentionValid, 1);
});

test('runner rejects invalid metadata anywhere in the full dataset before any provider request', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'mock-preflight' }] }));
      return;
    }
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(canonicalPreference) } }] }));
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'lunum-gold-metadata-preflight-'));

  try {
    const profilePath = path.join(temporaryDirectory, 'profile.json');
    const profile: ModelProfile = {
      schema: 'openlunum-model-profile/0.1',
      id: 'mock-profile',
      provider: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: 'mock-preflight',
      temperature: 0,
      timeoutMs: 2000
    };
    await writeFile(profilePath, JSON.stringify(profile), 'utf8');

    const cases: Array<{ name: string; rows: DatasetItem[]; maxItems: number }> = [
      {
        name: 'parse-null-gold',
        rows: [item({ expectedOutcome: 'parse', goldSem: null })],
        maxItems: 1
      },
      {
        name: 'abstain-with-preference-sem-in-tail',
        rows: [item(), item({ id: 'invalid-tail', expectedOutcome: 'abstain' })],
        maxItems: 1
      },
      {
        name: 'source-number-not-retained',
        rows: [item({ sourceText: 'Priya prefers daylight only above 5.', goldSem: daylightPreference })],
        maxItems: 1
      },
      {
        name: 'source-identifier-not-retained',
        rows: [item({ sourceText: 'Priya prefers daylight for AC-17.', goldSem: daylightPreference })],
        maxItems: 1
      },
      {
        name: 'unsupported-language',
        rows: [item({ sourceLanguage: 'xx' })],
        maxItems: 1
      },
      {
        name: 'empty-dataset',
        rows: [],
        maxItems: 1
      }
    ];

    for (const scenario of cases) {
      const datasetPath = path.join(temporaryDirectory, `${scenario.name}.jsonl`);
      await writeFile(datasetPath, `${scenario.rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
      const manifest: ExperimentManifest = {
        schema: 'openlunum-experiment/0.1',
        id: `gold-preflight-${scenario.name}`,
        area: 'multilingual-parse',
        task: 'parse',
        hypothesis: 'invalid gold metadata fails before provider discovery or generation',
        baselineCommit: 'test',
        dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
        modelProfile: profilePath,
        limits: { maxItems: scenario.maxItems, maxAttemptsPerItem: 1, maxModelCalls: 1 },
        gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
        outputDirectory: path.join(temporaryDirectory, 'reports')
      };
      const manifestPath = path.join(temporaryDirectory, `${scenario.name}.json`);
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

      await assert.rejects(runParseExperiment(manifestPath), /complete preflight gate/u, scenario.name);
      assert.deepEqual(requests, [], `${scenario.name} must not call /models or /chat/completions`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
