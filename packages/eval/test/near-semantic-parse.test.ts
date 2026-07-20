import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runParseExperiment } from '../src/parse-experiment.js';
import { sha256File } from '../src/io.js';

const goldSem = {
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

async function runCase(modelSem: unknown): Promise<{
  report: Awaited<ReturnType<typeof runParseExperiment>>['report'];
  result: { exact?: boolean; nearSemantic?: boolean; nearSemanticScore?: number };
}> {
  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelSem) } }] }));
      return;
    }
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'mock-local' }] }));
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-near-parse-'));
  try {
    const datasetPath = path.join(temp, 'dataset.jsonl');
    await writeFile(datasetPath, `${JSON.stringify({
      id: 'near-en',
      sourceLanguage: 'en',
      sourceText: 'The user prefers concise answers.',
      goldSem
    })}\n`, 'utf8');

    const profilePath = path.join(temp, 'profile.json');
    await writeFile(profilePath, JSON.stringify({
      schema: 'openlunum-model-profile/0.1',
      id: 'mock',
      provider: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: 'mock-local',
      temperature: 0,
      timeoutMs: 5000
    }), 'utf8');

    const outputDirectory = path.join(temp, 'reports');
    const manifestPath = path.join(temp, 'experiment.json');
    await writeFile(manifestPath, JSON.stringify({
      schema: 'openlunum-experiment/0.1',
      id: 'near-semantic-parse',
      area: 'multilingual-parse',
      task: 'parse',
      hypothesis: 'Near-semantic scoring remains separate from exact scoring',
      baselineCommit: 'test',
      dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
      modelProfile: profilePath,
      limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
      gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
      outputDirectory
    }), 'utf8');

    const { report, outputDirectory: runDirectory } = await runParseExperiment(manifestPath);
    const resultText = await readFile(path.join(runDirectory, 'parse-results-en.jsonl'), 'utf8');
    return {
      report,
      result: JSON.parse(resultText.trim()) as { exact?: boolean; nearSemantic?: boolean; nearSemanticScore?: number }
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(temp, { recursive: true, force: true });
  }
}

test('parse experiment reports a non-exact near-semantic identifier match', async () => {
  const modelSem = {
    ...goldSem,
    clauses: [{
      ...goldSem.clauses[0],
      roles: {
        ...goldSem.clauses[0]!.roles,
        experiencer: { type: 'actor', id: 'customer' }
      }
    }]
  };

  const { report, result } = await runCase(modelSem);
  assert.equal(report.overallExactRate, 0);
  assert.equal(report.overallNearSemanticRate, 1);
  assert.equal(report.languageMetrics.find((entry) => entry.language === 'en')?.nearSemanticRate, 1);
  assert.equal(result.exact, false);
  assert.equal(result.nearSemantic, true);
  assert.ok((result.nearSemanticScore ?? 0) >= 0.8);
});

test('exact matches are not double-counted as near-semantic-only', async () => {
  const { report, result } = await runCase(goldSem);
  assert.equal(report.overallExactRate, 1);
  assert.equal(report.overallNearSemanticRate, 0);
  assert.equal(result.exact, true);
  assert.equal(result.nearSemantic, false);
  assert.equal(result.nearSemanticScore, 1);
});
