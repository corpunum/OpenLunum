// Tests for the R14.2 cold-weight preflight disambiguation added to
// verify-audit-endpoints.sh. Uses a local mock HTTP server standing in for the
// model router - never a live model - so `absent` / `cold` / `error` / `pass`
// can each be reproduced deterministically and quickly (no real 30s timeout wait
// is needed: a destroyed socket makes curl return an empty response immediately,
// which is indistinguishable from a timeout to the script - exactly the ambiguity
// R14.2 exists to label as "likely cold, not necessarily broken").
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'verify-audit-endpoints.sh');

async function startMockRouter() {
  // Model presence: pass-model / cold-model / error-model are "present"; absent-model
  // is deliberately left out of /v1/models to exercise the `absent` state.
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: [{ id: 'pass-model' }, { id: 'cold-model' }, { id: 'error-model' }]
      }));
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/props') {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.model === 'pass-model') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
          return;
        }
        if (parsed.model === 'error-model') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ malformed: true }));
          return;
        }
        if (parsed.model === 'cold-model') {
          // Simulate weights still loading / a crashed worker: accept the
          // connection then destroy it without ever writing a response. curl
          // reports this the same way it would report a genuine timeout: no
          // output. That ambiguity at the transport layer is exactly why R14.2
          // exists - the script must not assume this means "broken forever".
          request.socket.destroy();
          return;
        }
        response.writeHead(404).end();
      });
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return { server, port: address.port };
}

async function withFixtures(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-verify-audit-'));
  try {
    const weightsPath = path.join(dir, 'weights.bin');
    await writeFile(weightsPath, 'dummy-weights');

    const presetPath = path.join(dir, 'models-preset.ini');
    const models = ['pass-model', 'cold-model', 'error-model', 'absent-model'];
    const iniContent = models.map(id => `[${id}]\nmodel = ${weightsPath}\n`).join('\n');
    await writeFile(presetPath, iniContent);

    await run({ dir, weightsPath, presetPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeProfile(dir, name, model, port) {
  const profilePath = path.join(dir, `${name}.json`);
  await writeFile(profilePath, JSON.stringify({ baseUrl: `http://127.0.0.1:${port}/v1`, model }));
  return profilePath;
}

// Runs the script with an async child process rather than spawnSync. The mock router in
// this file lives in the *same* Node process as the test, so its event loop must stay free
// to accept/respond to the script's curl calls while the script runs; spawnSync blocks that
// event loop for the whole child lifetime and deadlocks every probe into a timeout.
function runScript(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('verify-audit-endpoints.sh reports distinct absent/cold/error/pass preflight states', async () => {
  const { server, port } = await startMockRouter();
  try {
    await withFixtures(async ({ dir, presetPath }) => {
      const passProfile = await writeProfile(dir, 'pass', 'pass-model', port);
      const coldProfile = await writeProfile(dir, 'cold', 'cold-model', port);
      const errorProfile = await writeProfile(dir, 'error', 'error-model', port);
      const absentProfile = await writeProfile(dir, 'absent', 'absent-model', port);
      const reportPath = path.join(dir, 'report.md');

      const result = await runScript(
        [SCRIPT, '--out', reportPath, passProfile, coldProfile, errorProfile, absentProfile],
        { ...process.env, REPO: REPO_ROOT, MODELS_PRESET: presetPath }
      );

      // Exit-code contract (R14.2 constraint): still non-zero whenever any
      // profile is not a clean PASS - the new states are additive detail only.
      assert.notEqual(result.status, 0, `expected non-zero exit; stderr:\n${result.stderr}`);

      const report = await readFile(reportPath, 'utf8');

      assert.match(report, /### pass\.json[\s\S]*?Preflight State\*\*: .*pass \(probe responded and validated\)/u);
      assert.match(report, /### pass\.json[\s\S]*?Status\*\*: .*PASS/u);

      assert.match(report, /### cold\.json[\s\S]*?Preflight State\*\*: .*cold \(model present in \/v1\/models, but the probe request failed\/timed out/u);
      assert.match(report, /### cold\.json[\s\S]*?Status\*\*: .*FAIL/u);

      assert.match(report, /### error\.json[\s\S]*?Preflight State\*\*: .*error \(model id was present and the probe returned promptly/u);
      assert.match(report, /### error\.json[\s\S]*?Status\*\*: .*FAIL/u);

      assert.match(report, /### absent\.json[\s\S]*?Preflight State\*\*: .*absent \(model id was not present in \/v1\/models at all\)/u);
      assert.match(report, /### absent\.json[\s\S]*?Status\*\*: .*FAIL/u);

      assert.match(report, /Failure breakdown\*\*: 1 cold, 1 absent, 1 error, 0 other/u);
      assert.match(report, /OVERALL: FAIL/u);

      // Never collapse the three failure reasons into a single generic message.
      const failureLines = report.match(/Preflight State\*\*: .*/gu) ?? [];
      const distinctStates = new Set(failureLines);
      assert.ok(distinctStates.size >= 4, `expected 4 distinct preflight-state lines, got: ${[...distinctStates].join(' | ')}`);
    });
  } finally {
    await new Promise(resolve => server.close(() => resolve()));
  }
});

test('verify-audit-endpoints.sh still reports a clean PASS and zero exit code when every profile is healthy', async () => {
  const { server, port } = await startMockRouter();
  try {
    await withFixtures(async ({ dir, presetPath }) => {
      const passProfile = await writeProfile(dir, 'pass-only', 'pass-model', port);
      const reportPath = path.join(dir, 'report.md');

      const result = await runScript(
        [SCRIPT, '--out', reportPath, passProfile],
        { ...process.env, REPO: REPO_ROOT, MODELS_PRESET: presetPath }
      );

      assert.equal(result.status, 0, `expected zero exit for an all-pass run; stderr:\n${result.stderr}`);

      const report = await readFile(reportPath, 'utf8');
      assert.match(report, /OVERALL: PASS/u);
      assert.doesNotMatch(report, /Failure breakdown/u);
    });
  } finally {
    await new Promise(resolve => server.close(() => resolve()));
  }
});
