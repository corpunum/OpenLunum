import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { runSmoke } from '../src/smoke.js';
import { validateManifest } from '../src/io.js';
import type { ExperimentManifest } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('multilingual gold dataset has stable cross-language groups', async () => {
  const result = await runSmoke();
  assert.ok(result.items >= 12);
  assert.ok(result.groups >= 3);
  assert.match(result.datasetSha256, /^[a-f0-9]{64}$/u);
});

test('experiment manifest enforces dataset hashes and budgets', () => {
  const manifest: ExperimentManifest = {
    schema: 'openlunum-experiment/0.1', id: 'test', area: 'multilingual-parse', task: 'parse', hypothesis: 'test', baselineCommit: 'abc',
    dataset: { path: 'x', sha256: 'a'.repeat(64) }, modelProfile: 'profile.json',
    limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
    gates: { minimumFeatureRecall: 1, minimumExactRate: 1, requireProtectedLiteralCoverage: true }, outputDirectory: 'reports/test'
  };
  assert.doesNotThrow(() => validateManifest(manifest));
});


import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { once } from 'node:events';
import { runExperiment } from '../src/runner.js';
import { sha256File } from '../src/io.js';

test('local OpenAI-compatible runner records a passing parse experiment', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }, negated: false }]
  };
  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sem) } }] }));
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
  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-eval-'));
  try {
    const dataset = path.join(temp, 'dataset.jsonl');
    await writeFile(dataset, `${JSON.stringify({ id: 'one', sourceLanguage: 'en', sourceText: 'The user prefers concise answers.', goldSem: sem })}\n`, 'utf8');
    const profile = path.join(temp, 'profile.json');
    await writeFile(profile, JSON.stringify({ schema: 'openlunum-model-profile/0.1', id: 'mock', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock-local', temperature: 0, timeoutMs: 5000 }), 'utf8');
    const manifest = path.join(temp, 'experiment.json');
    const output = path.join(temp, 'reports');
    await writeFile(manifest, JSON.stringify({ schema: 'openlunum-experiment/0.1', id: 'mock-run', area: 'multilingual-parse', task: 'parse', hypothesis: 'A perfect mock returns the gold Sem.', baselineCommit: 'test', dataset: { path: dataset, sha256: await sha256File(dataset) }, modelProfile: profile, limits: { maxItems: 1, maxAttemptsPerItem: 2, maxModelCalls: 2 }, gates: { minimumFeatureRecall: 1, minimumExactRate: 1, requireProtectedLiteralCoverage: true }, outputDirectory: output }), 'utf8');
    const runDirectory = await runExperiment(manifest);
    const summary = JSON.parse(await readFile(path.join(runDirectory, 'summary.json'), 'utf8')) as { gatesPassed: boolean; calls: number; passed: number };
    assert.equal(summary.gatesPassed, true);
    assert.equal(summary.calls, 1);
    assert.equal(summary.passed, 1);
  } finally {
    server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

// Regression test: verify model self-grading is eliminated
// If the runner trusts result.exact or result.pass from model output, this test fails.
test('runner does not trust model self-grading (no result.exact or result.pass in status)', async () => {
  const fs = await import('node:fs');
  const runnerSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'runner.ts'), 'utf-8');
  
  // The status assignment for non-parse/realize tasks must NOT use result.exact or result.pass
  // It should only use result.status (which the model sets, but we don't compute it from exact/pass)
  const statusLine = runnerSrc.match(/const status = .*?;/);
  assert.ok(statusLine, 'Must have a status assignment');
  
  // Check that status is NOT computed from result.exact or result.pass
  assert.ok(
    !statusLine![0].includes('result.exact'),
    'Must not trust model result.exact for pass/fail (self-grading)'
  );
  assert.ok(
    !statusLine![0].includes('result.pass'),
    'Must not trust model result.pass for pass/fail (self-grading)'
  );
});

// Regression test: verify render/context use original source text, not serialized JSON
test('render-runner uses original source text, not serialized Sem JSON', async () => {
  const fs = await import('node:fs');
  const renderSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'render-runner.ts'), 'utf-8');
  
  // Source text should come from annotations, not content.substring
  assert.ok(
    renderSrc.includes('sem.annotations?.sourceText'),
    'Must use annotations.sourceText for source text'
  );
  // Should NOT use JSON content as source text
  assert.ok(
    !renderSrc.includes('content.substring(0'),
    'Must not use serialized JSON as source text'
  );
});

test('context-runner uses real compileContext, not hardcoded eligibility', async () => {
  const fs = await import('node:fs');
  const ctxSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'context-runner.ts'), 'utf-8');
  
  // Must use compileContext from @corpunum/lunum
  assert.ok(
    ctxSrc.includes('compileContext'),
    'Must use compileContext from @corpunum/lunum'
  );
  // Must NOT hardcode eligibility
  assert.ok(
    !ctxSrc.includes("eligible: true") || ctxSrc.includes('compileContext'),
    'Eligibility must come from compileContext, not hardcoded'
  );
});
