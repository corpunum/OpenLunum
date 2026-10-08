import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InMemoryLocator } from '../dist/index.js';
import { handleMessage, locatorFromEnv } from '../dist/mcp.js';

const locator = new InMemoryLocator([{ id: 'repo/src/a.ts', text: 'export const knownSymbol = 1;' }]);

test('initialize, tools/list and notifications', async () => {
  const init = await handleMessage(locator, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.serverInfo.name, 'lunum-locator-mcp');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(await handleMessage(locator, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await handleMessage(locator, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['lunum_ground']);
  assert.equal((await handleMessage(null, { jsonrpc: '2.0', id: 3, method: 'tools/list' })).result.tools.length, 0);
  assert.equal((await handleMessage(locator, { jsonrpc: '2.0', id: 4, method: 'nope' })).error.code, -32601);
});

test('lunum_ground flags unverified references and keeps provenance', async () => {
  const res = await handleMessage(locator, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'lunum_ground', arguments: { text: 'Use knownSymbol from src/a.ts, not inventedHelper().' } } });
  const body = JSON.parse(res.result.content[0].text);
  assert.equal(body.success, true);
  assert.equal(body.diagnosticOnly, true);
  const byText = Object.fromEntries(body.references.map((r) => [r.text, r]));
  assert.equal(byText.knownSymbol.status, 'grounded');
  assert.deepEqual(byText.knownSymbol.locations[0], { file: 'repo/src/a.ts', line: 1, text: 'export const knownSymbol = 1;' });
  assert.equal(byText.inventedHelper.flag, 'unverified reference');
  const flagged = await handleMessage(locator, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'lunum_ground', arguments: { text: 'knownSymbol and inventedHelper()', includeGrounded: false } } });
  assert.deepEqual(JSON.parse(flagged.result.content[0].text).references.map((r) => r.text), ['inventedHelper']);
  const bad = await handleMessage(locator, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'lunum_ground', arguments: {} } });
  assert.equal(bad.result.isError, true);
});

test('locatorFromEnv: unumsearch by default, null for an unknown backend', () => {
  assert.ok(locatorFromEnv({}));
  assert.equal(locatorFromEnv({ LUNUM_LOCATOR: 'none' }), null);
});

test('stdio server: a dead daemon yields unavailable, never unverified', async () => {
  const bin = fileURLToPath(new URL('../dist/mcp.js', import.meta.url));
  const child = spawn(process.execPath, [bin], { env: { ...process.env, LUNUM_LOCATOR_URL: 'http://127.0.0.1:1', LUNUM_LOCATOR_TIMEOUT_MS: '300' }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  let buf = '';
  const done = new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); if (lines.length === 3) resolve(); }
    });
  });
  for (const m of [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lunum_ground', arguments: { text: 'inventedHelperName() in src/x/y.ts' } } },
  ]) child.stdin.write(`${JSON.stringify(m)}\n`);
  await done;
  child.kill();
  const body = JSON.parse(lines[2].result.content[0].text);
  assert.equal(body.counts.unverified, 0);
  assert.equal(body.counts.unavailable, 2);
});
