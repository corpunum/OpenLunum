import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'node:child_process';
import { runParseExperiment } from '../src/parse-experiment.js';
import { PARSE_LANGUAGE_LABELS, PARSE_LANGUAGES } from '../src/parse-experiment.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { sha256File } from '../src/io.js';
import { parsePrompt } from '../src/prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('parse experiment defines four languages', () => {
  assert.deepStrictEqual(PARSE_LANGUAGES, ['en', 'el', 'es', 'id']);
  assert.strictEqual(PARSE_LANGUAGE_LABELS.en, 'English');
  assert.strictEqual(PARSE_LANGUAGE_LABELS.el, 'Greek');
  assert.strictEqual(PARSE_LANGUAGE_LABELS.es, 'Spanish');
  assert.strictEqual(PARSE_LANGUAGE_LABELS.id, 'Indonesian');
});

test('parse experiment runner records passing results for all four languages', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [
      {
        predicate: 'prefer',
        roles: {
          experiencer: { type: 'actor', id: 'user' },
          theme: { type: 'concept', id: 'concise_answers' }
        },
        negated: false
      }
    ]
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

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-parse-'));
  try {
    // Create dataset with items for all four languages
    const items = [
      { id: 'pref-en', sourceLanguage: 'en', sourceText: 'The user prefers concise answers.', goldSem: sem },
      { id: 'pref-el', sourceLanguage: 'el', sourceText: 'Ο χρήστης προτιμά σύντομες απαντήσεις.', goldSem: sem },
      { id: 'pref-es', sourceLanguage: 'es', sourceText: 'El usuario prefiere respuestas concisas.', goldSem: sem },
      { id: 'pref-id', sourceLanguage: 'id', sourceText: 'Pengguna lebih menyukai jawaban yang ringkas.', goldSem: sem }
    ];

    const datasetPath = path.join(temp, 'dataset.jsonl');
    await writeFile(datasetPath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const profilePath = path.join(temp, 'profile.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        schema: 'openlunum-model-profile/0.1',
        id: 'mock',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: 'mock-local',
        temperature: 0,
        timeoutMs: 5000
      }),
      'utf8'
    );

    const manifestPath = path.join(temp, 'experiment.json');
    const outputDir = path.join(temp, 'reports');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema: 'openlunum-experiment/0.1',
        id: 'parse-multilingual',
        area: 'multilingual-parse',
        task: 'parse',
        hypothesis: 'Mock model returns gold Sem for all languages',
        baselineCommit: 'test',
        dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
        modelProfile: profilePath,
        limits: { maxItems: 4, maxAttemptsPerItem: 1, maxModelCalls: 4 },
        gates: { minimumFeatureRecall: 1, minimumExactRate: 1, requireProtectedLiteralCoverage: false },
        outputDirectory: outputDir
      }),
      'utf8'
    );

    const { report, outputDirectory } = await runParseExperiment(manifestPath);

    // Verify report structure
    assert.strictEqual(report.experimentId, 'parse-multilingual');
    assert.strictEqual(report.runId.length > 0, true);
    assert.strictEqual(report.totalItems, 4);
    assert.strictEqual(report.totalPassed, 4);
    assert.strictEqual(report.totalFailed, 0);
    assert.strictEqual(report.totalErrors, 0);

    // Verify per-language metrics
    assert.strictEqual(report.languageMetrics.length, 4);
    for (const langMetrics of report.languageMetrics) {
      assert.ok(langMetrics.totalItems > 0);
      assert.strictEqual(langMetrics.passedItems, langMetrics.totalItems);
      assert.strictEqual(langMetrics.exactRate, 1);
      assert.strictEqual(langMetrics.featureRecall, 1);
      assert.strictEqual(langMetrics.featurePrecision, 1);
    }

    // Verify cross-language comparison
    assert.strictEqual(report.crossLanguageComparison.languagesIncluded.length, 4);
    assert.ok(report.crossLanguageComparison.bestExactLanguage);
    assert.ok(report.crossLanguageComparison.bestRecallLanguage);
    assert.ok(report.crossLanguageComparison.fastestLanguage);
    assert.strictEqual(report.crossLanguageComparison.consistencyScore, 1);

    // Verify output files exist
    for (const lang of ['en', 'el', 'es', 'id']) {
      const resultFile = path.join(outputDirectory, `parse-results-${lang}.jsonl`);
      const content = await readFile(resultFile, 'utf8');
      assert.ok(content.length > 0, `Results for ${lang} should not be empty`);

      const reportFile = path.join(outputDirectory, `report-${lang}.md`);
      const reportContent = await readFile(reportFile, 'utf8');
      assert.ok(reportContent.includes(langMetricsLabel(lang)), `${lang} report should include language label`);
    }

    // Verify cross-language report exists
    const crossReport = await readFile(path.join(outputDirectory, 'cross-language-report.md'), 'utf8');
    assert.ok(crossReport.includes('English'));
    assert.ok(crossReport.includes('Greek'));
    assert.ok(crossReport.includes('Spanish'));
    assert.ok(crossReport.includes('Indonesian'));

    // Verify summary
    const summary = JSON.parse(await readFile(path.join(outputDirectory, 'parse-summary.json'), 'utf8'));
    assert.strictEqual(summary.totalItems, 4);
    assert.strictEqual(summary.totalPassed, 4);
  } finally {
    server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

function langMetricsLabel(lang: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    id: 'Indonesian'
  };
  return labels[lang] ?? lang;
}

test('parse experiment handles mixed pass/fail correctly', async () => {
  let callCount = 0;
  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      callCount += 1;
      const isGood = callCount % 2 === 1;
      const content = isGood
        ? JSON.stringify({ schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] })
        : JSON.stringify({ schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'unknown', clauses: [] });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-parse-mixed-'));
  try {
    const items = [
      { id: 'test-en-1', sourceLanguage: 'en', sourceText: 'Test 1.', goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [] } }
    ];

    const datasetPath = path.join(temp, 'dataset.jsonl');
    await writeFile(datasetPath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const profilePath = path.join(temp, 'profile.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        schema: 'openlunum-model-profile/0.1',
        id: 'mock',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: 'mock-local',
        temperature: 0,
        timeoutMs: 5000
      }),
      'utf8'
    );

    const manifestPath = path.join(temp, 'experiment.json');
    const outputDir = path.join(temp, 'reports');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema: 'openlunum-experiment/0.1',
        id: 'parse-mixed',
        area: 'multilingual-parse',
        task: 'parse',
        hypothesis: 'Mixed results across languages',
        baselineCommit: 'test',
        dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
        modelProfile: profilePath,
        limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
        gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
        outputDirectory: outputDir
      }),
      'utf8'
    );

    const { report } = await runParseExperiment(manifestPath);

    // Should have exactly one language with results
    assert.strictEqual(report.totalItems, 1);
    assert.strictEqual(report.languageMetrics.filter(m => m.totalItems > 0).length, 1);
  } finally {
    server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('parse experiment skips languages with no items', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: []
  };

  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sem) } }] }));
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-parse-sparse-'));
  try {
    // Only English and Greek items
    const items = [
      { id: 'en-1', sourceLanguage: 'en', sourceText: 'Test.', goldSem: sem },
      { id: 'el-1', sourceLanguage: 'el', sourceText: 'Δοκιμή.', goldSem: sem }
    ];

    const datasetPath = path.join(temp, 'dataset.jsonl');
    await writeFile(datasetPath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const profilePath = path.join(temp, 'profile.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        schema: 'openlunum-model-profile/0.1',
        id: 'mock',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: 'mock-local',
        temperature: 0,
        timeoutMs: 5000
      }),
      'utf8'
    );

    const manifestPath = path.join(temp, 'experiment.json');
    const outputDir = path.join(temp, 'reports');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema: 'openlunum-experiment/0.1',
        id: 'parse-sparse',
        area: 'multilingual-parse',
        task: 'parse',
        hypothesis: 'Only EN/EL items',
        baselineCommit: 'test',
        dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
        modelProfile: profilePath,
        limits: { maxItems: 2, maxAttemptsPerItem: 1, maxModelCalls: 2 },
        gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
        outputDirectory: outputDir
      }),
      'utf8'
    );

    const { report } = await runParseExperiment(manifestPath);

    // Should have exactly 2 languages with results (EN and EL only)
    assert.strictEqual(report.totalItems, 2);
    assert.strictEqual(report.languageMetrics.filter(m => m.totalItems > 0).length, 2);

    // ES and ID should have 0 items
    const esMetrics = report.languageMetrics.find(m => m.language === 'es');
    const idMetrics = report.languageMetrics.find(m => m.language === 'id');
    assert.strictEqual(esMetrics?.totalItems, 0);
    assert.strictEqual(idMetrics?.totalItems, 0);
  } finally {
    server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('parse-experiment CLI arg: argv[3] is the manifest, not argv[2]', async () => {
  // Regression: runParseExperimentCli read argv[2] which is the subcommand name
  // when invoked via `node cli.js parse-experiment <manifest>`, causing ENOENT.
  // The fix moves the manifest read to argv[3].
  // This test spawns the real CLI process to prove the fix works end-to-end.
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: []
  };

  let serverPort = 0;
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
  serverPort = address.port;

  const temp = await mkdtemp(path.join(os.tmpdir(), 'openlunum-cli-arg-'));
  try {
    const items = [
      { id: 'cli-test', sourceLanguage: 'en', sourceText: 'Test CLI arg fix.', goldSem: sem }
    ];

    const datasetPath = path.join(temp, 'dataset.jsonl');
    await writeFile(datasetPath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const profilePath = path.join(temp, 'profile.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        schema: 'openlunum-model-profile/0.1',
        id: 'mock',
        provider: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${serverPort}/v1`,
        model: 'mock-local',
        temperature: 0,
        timeoutMs: 5000
      }),
      'utf8'
    );

    const manifestPath = path.join(temp, 'experiment.json');
    const outputDir = path.join(temp, 'reports');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema: 'openlunum-experiment/0.1',
        id: 'cli-arg-regression',
        area: 'multilingual-parse',
        task: 'parse',
        hypothesis: 'CLI correctly resolves manifest from argv[3]',
        baselineCommit: 'test',
        dataset: { path: datasetPath, sha256: await sha256File(datasetPath) },
        modelProfile: profilePath,
        limits: { maxItems: 1, maxAttemptsPerItem: 1, maxModelCalls: 1 },
        gates: { minimumFeatureRecall: 0, minimumExactRate: 0, requireProtectedLiteralCoverage: false },
        outputDirectory: outputDir
      }),
      'utf8'
    );

    // Invoke the real CLI: node cli.js parse-experiment <manifest>
    const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      execFile('node', [cliPath, 'parse-experiment', manifestPath], { timeout: 15000 }, (err, stdout, stderr) => {
        const code = err?.code != null ? Number(err.code) : 0;
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), code });
      });
    });

    assert.strictEqual(result.code, 0, `CLI exit code should be 0, got ${result.code}. stderr: ${result.stderr}`);
    // stdout should be the output directory path, not an error
    assert.ok(result.stdout.trim().length > 0, 'CLI should output the result directory path');
    assert.ok(result.stdout.includes('reports'), 'Output path should include "reports"');
    assert.ok(!result.stderr.includes('ENOENT'), `stderr should not contain ENOENT, got: ${result.stderr}`);
    assert.ok(!result.stderr.includes('parse-experiment'), `stderr should not reference subcommand as manifest path, got: ${result.stderr}`);
  } finally {
    server.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('parsePrompt includes schema shape and one-shot example', () => {
  // The live test campaign showed validity improved 0/16 → 14/16 when the
  // schema shape and one-shot example were embedded in parsePrompt.
  const item = {
    id: 'test',
    sourceLanguage: 'en',
    sourceText: 'The user prefers concise answers.',
    goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }, negated: false }] }
  } as any;

  const prompt = parsePrompt(item);

  // Verify schema shape is present in the system prompt
  assert.ok(prompt.system.includes('lunum-sem/0.1-draft'), 'system should mention schema version');
  assert.ok(prompt.system.includes('"schema"'), 'system should show schema field name');
  assert.ok(prompt.system.includes('"world"'), 'system should show world field name');
  assert.ok(prompt.system.includes('"kind"'), 'system should show kind field name');
  assert.ok(prompt.system.includes('"clauses"'), 'system should show clauses field name');
  assert.ok(prompt.system.includes('"predicate"'), 'system should show predicate field name');
  assert.ok(prompt.system.includes('"roles"'), 'system should show roles field name');
  assert.ok(prompt.system.includes('"negated"'), 'system should show negated field name');

  // Verify one-shot example is present
  assert.ok(prompt.system.includes('"prefer"'), 'example should contain a concrete predicate');
  assert.ok(prompt.system.includes('"experiencer"'), 'example should show an experiencer role');
  assert.ok(prompt.system.includes('"concept"'), 'example should show a concept type');

  // Verify example output is parseable as valid Lunum-Sem
  // Extract the JSON example (the last JSON object in the prompt)
  const jsonMatch = prompt.system.match(/\{"schema"[\s\S]*\}$/);
  assert.ok(jsonMatch, 'system should end with a JSON example');
  const parsed = JSON.parse(jsonMatch![0]);
  assert.strictEqual(parsed.schema, 'lunum-sem/0.1-draft');
  assert.strictEqual(parsed.world, 'real');
  assert.strictEqual(parsed.kind, 'preference');
  assert.ok(Array.isArray(parsed.clauses));
  assert.strictEqual(parsed.clauses[0].predicate, 'prefer');
});

test('default gate thresholds are recalibrated for free-vocabulary models', async () => {
  // The v5 live test (2026-07-20) showed that historical thresholds of
  // 0.95 feature recall / 0.75 exact were unreachable for free-vocabulary
  // models on local endpoints. Recalibrated values: 0.70 / 0.50.
  // Read the workspace-level cli source (not dist/src/cli.ts which is compiled JS).
  const cliSource = await readFile(path.join(WORKSPACE_ROOT, 'packages', 'eval', 'src', 'cli.ts'), 'utf8');

  assert.ok(cliSource.includes('minimumFeatureRecall: 0.70'), 'default feature recall gate should be 0.70');
  assert.ok(cliSource.includes('minimumExactRate: 0.50'), 'default exact rate gate should be 0.50');

  const gatesMatch = cliSource.match(/gates:\s*\{[^}]+\}/);
  assert.ok(gatesMatch, 'cli should have a gates definition');
  assert.ok(gatesMatch[0].includes('0.70'), 'gates definition must contain 0.70');
  assert.ok(gatesMatch[0].includes('0.50'), 'gates definition must contain 0.50');
  assert.ok(!gatesMatch[0].includes('0.95'), 'gates default should not be old 0.95 recall');
});
