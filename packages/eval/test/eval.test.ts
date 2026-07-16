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

import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import { once } from 'node:events';
import { runExperiment } from '../src/runner.js';
import { sha256File } from '../src/io.js';
import { classifyEligibility, compileContext, renderSem } from '@corpunum/lunum';
import type { ContextMessage } from '@corpunum/lunum';
import { evaluateContextSelection, runContextExperiment, writeContextReport } from '../src/context-runner.js';

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

// Regression test: verify task success is computed independently
test('runner computes task success independently of model status', async () => {
  const fs = await import('node:fs');
  const runnerSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'runner.ts'), 'utf8');
  
  // For non-parse/realize tasks, status should be computed from output content
  // NOT from result.status
  assert.ok(runnerSrc.includes('hasOutput'), 'Must compute hasOutput from rawOutput');
  assert.ok(runnerSrc.includes('resultIsValid'), 'Must validate result object');
});

// Regression test: verify reports are written inside timestamped run directory
test('reports are written inside timestamped run directory', async () => {
  const fs = await import('node:fs');
  const runnerSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'runner.ts'), 'utf8');
  
  // runDeterministicTask should accept outputDir parameter
  assert.ok(runnerSrc.includes('runDeterministicTask(manifest, root, output)'), 
    'Must pass outputDir to runDeterministicTask');
  // Reports should be written to outputDir, not manifest.outputDirectory
  assert.ok(runnerSrc.includes('writeRenderReport(renderResult.results, outputDir)') || runnerSrc.includes('writeRenderReport(renderResult.results, output)'),
    'Must write render reports to outputDir');
  assert.ok(runnerSrc.includes('writeContextReport(ctxResult.results, outputDir)') || runnerSrc.includes('writeContextReport(ctxResult.results, output)'),
    'Must write context reports to outputDir');
});

// ---- Behavioral tests: evaluateContextSelection ----

test('behavioral: eligible preference compacts and passes', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise' } }, negated: false }],
    annotations: { sourceText: 'The user prefers concise answers.', sourceLanguage: 'en' }
  };
  const rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });
  const policy = classifyEligibility({ category: sem.kind, risk: 'low', confidence: 0.95, sourceText: sem.annotations.sourceText, semantic: true });
  assert.ok(policy.eligible, 'preference should be eligible');

  const message: ContextMessage = { role: 'user', source: { text: 'prefers-concise' }, lunumCode: rendered.code, lunumMeta: policy };
  const compilation = compileContext([message], { mode: 'mixed' });

  const result = evaluateContextSelection(true, compilation);
  assert.deepStrictEqual(result, { status: 'passed' });
});

test('behavioral: ineligible conditional_instruction falls back to natural and passes', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction',
    clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' }, theme: { type: 'action', id: 'retry' } }, conditions: [] }],
    annotations: { sourceText: 'If error, retry up to 3 times.', sourceLanguage: 'en' }
  };
  const rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });
  const policy = classifyEligibility({ category: sem.kind, risk: 'low', confidence: 0.95, sourceText: sem.annotations.sourceText, semantic: true });
  assert.ok(!policy.eligible, 'conditional_instruction should be ineligible');

  const message: ContextMessage = { role: 'user', source: { text: sem.annotations.sourceText }, lunumCode: rendered.code, lunumMeta: policy };
  const compilation = compileContext([message], { mode: 'mixed' });

  const result = evaluateContextSelection(false, compilation);
  assert.deepStrictEqual(result, { status: 'passed' });
});

test('behavioral: missing mixed, shorter/longer mixed, role mismatch, content mismatch', () => {
  const lunumContent = 'R prefer user concise';
  const naturalContent = 'The user prefers concise answers.';

  // Missing mixed
  assert.deepStrictEqual(
    evaluateContextSelection(true, { mixedMessages: undefined, naturalMessages: [], lunumMessages: [] }),
    { status: 'failed', failureReason: 'missing-mixed' }
  );

  // Empty mixed
  assert.deepStrictEqual(
    evaluateContextSelection(true, { mixedMessages: [], naturalMessages: [], lunumMessages: [] }),
    { status: 'failed', failureReason: 'missing-mixed' }
  );

  // Missing expected (no lunum)
  assert.deepStrictEqual(
    evaluateContextSelection(true, { mixedMessages: [{ role: 'user', content: lunumContent }], naturalMessages: [], lunumMessages: undefined }),
    { status: 'failed', failureReason: 'missing-lunum' }
  );

  // Missing expected (no natural)
  assert.deepStrictEqual(
    evaluateContextSelection(false, { mixedMessages: [{ role: 'user', content: naturalContent }], naturalMessages: undefined, lunumMessages: [] }),
    { status: 'failed', failureReason: 'missing-natural' }
  );

  // Mixed shorter than expected
  assert.deepStrictEqual(
    evaluateContextSelection(true, {
      mixedMessages: [{ role: 'user', content: lunumContent }],
      naturalMessages: [],
      lunumMessages: [
        { role: 'user', content: lunumContent },
        { role: 'user', content: 'extra-lunum' }
      ]
    }),
    { status: 'failed', failureReason: 'mixed-shorter' }
  );

  // Mixed longer than expected
  assert.deepStrictEqual(
    evaluateContextSelection(true, {
      mixedMessages: [
        { role: 'user', content: lunumContent },
        { role: 'user', content: 'extra-mixed' }
      ],
      naturalMessages: [],
      lunumMessages: [{ role: 'user', content: lunumContent }]
    }),
    { status: 'failed', failureReason: 'mixed-longer' }
  );

  // Role-only mismatch
  assert.deepStrictEqual(
    evaluateContextSelection(true, {
      mixedMessages: [{ role: 'assistant', content: lunumContent }],
      naturalMessages: [],
      lunumMessages: [{ role: 'user', content: lunumContent }]
    }),
    { status: 'failed', failureReason: 'eligible mixed[0] role mismatch' }
  );

  // Content mismatch
  assert.deepStrictEqual(
    evaluateContextSelection(true, {
      mixedMessages: [{ role: 'user', content: 'wrong-content' }],
      naturalMessages: [],
      lunumMessages: [{ role: 'user', content: lunumContent }]
    }),
    { status: 'failed', failureReason: 'eligible mixed[0] differs from lunum compact output' }
  );
});

test('behavioral: full pipeline passes eligible and ineligible reports', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pr10-integration-'));
  try {
    const examplesDir = path.join(temp, 'examples');
    await mkdir(examplesDir, { recursive: true });

    // Eligible preference
    const eligible = {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise' } }, negated: false }],
      annotations: { sourceText: 'The user prefers concise answers.', sourceLanguage: 'en' }
    };
    await writeFile(path.join(examplesDir, 'eligible-preference.sem.json'), JSON.stringify(eligible), 'utf8');

    // Ineligible conditional_instruction
    const ineligible = {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction',
      clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'a' }, theme: { type: 'action', id: 'b' } }, conditions: [] }],
      annotations: { sourceText: 'If error, retry up to 3 times.', sourceLanguage: 'en' }
    };
    await writeFile(path.join(examplesDir, 'ineligible-conditional.sem.json'), JSON.stringify(ineligible), 'utf8');

    const manifest: ExperimentManifest = {
      schema: 'openlunum-experiment/0.1', id: 'pr10-integration', area: 'context', task: 'context', hypothesis: 'both eligibility modes pass',
      baselineCommit: 'e9c6fd0',
      dataset: { path: '', sha256: '0'.repeat(64) }, modelProfile: 'test',
      limits: { maxItems: 10, maxAttemptsPerItem: 1, maxModelCalls: 0 },
      gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
      outputDirectory: temp
    };

    const { results } = await runContextExperiment(manifest, temp);
    assert.equal(results.length, 2);

    const eligibleReport = results.find(r => r.id === 'eligible-preference.sem.json');
    const ineligibleReport = results.find(r => r.id === 'ineligible-conditional.sem.json');
    assert.ok(eligibleReport, 'eligible-preference.sem.json should exist in results');
    assert.ok(ineligibleReport, 'ineligible-conditional.sem.json should exist in results');
    assert.strictEqual(eligibleReport?.eligibility.eligible, true, 'eligible-preference should be eligible');
    assert.strictEqual(eligibleReport?.status, 'passed', 'eligible-preference status should be passed');
    assert.strictEqual(eligibleReport?.failureReason, undefined, 'eligible-preference should have no failureReason');
    assert.strictEqual(ineligibleReport?.eligibility.eligible, false, 'ineligible-conditional should not be eligible');
    assert.strictEqual(ineligibleReport?.status, 'passed', 'ineligible-conditional status should be passed');
    assert.strictEqual(ineligibleReport?.failureReason, undefined, 'ineligible-conditional should have no failureReason');

    await writeContextReport(results, path.join(temp, 'reports'));
    const summaryRaw = await readFile(path.join(temp, 'reports', 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryRaw) as { passed: number; failed: number };
    assert.deepStrictEqual(summary.passed, 2);
    assert.deepStrictEqual(summary.failed, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
