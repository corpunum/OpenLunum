import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const serverPath = path.join(repositoryRoot, 'packages/mcp/dist/bin/lunum-mcp.js');

function startServer() {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repositoryRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LUNUM_COMPACTION: 'off', LUNUM_MULTILINGUAL: 'off', LUNUM_CONTEXT_MODE: 'natural' },
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined) pending.get(message.id)?.(message);
  });
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`stdio MCP response timeout for ${method}`));
    }, 5_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  return { child, request, notify, stderr };
}

function textResult(message) {
  assert.ok(message.result, `expected JSON-RPC result: ${JSON.stringify(message)}`);
  const text = message.result.content?.[0]?.text;
  assert.equal(typeof text, 'string');
  return JSON.parse(text);
}

test('real stdio MCP handshake, discovery, fixture calls, and fail-closed checks', async () => {
  const server = startServer();
  try {
    const initialized = await server.request(1, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'openlunum-stdio-compatibility-test', version: '1.0.0' },
    });
    assert.equal(initialized.jsonrpc, '2.0');
    assert.ok(initialized.result?.protocolVersion);
    server.notify('notifications/initialized');

    const listed = await server.request(2, 'tools/list');
    const tools = listed.result?.tools;
    assert.ok(Array.isArray(tools));
    assert.deepEqual(tools.map((tool) => tool.name), [
      'lunum_derive', 'lunum_get_extraction_contract', 'lunum_submit_candidate',
      'lunum_build_candidate', 'lunum_compile_context', 'lunum_fingerprint',
      'lunum_validate', 'lunum_render', 'lunum_compare', 'lunum_classify',
    ]);
    for (const tool of tools) {
      assert.equal(tool.inputSchema?.type, 'object', `${tool.name} has no object-root schema`);
    }

    const contract = textResult(await server.request(3, 'tools/call', {
      name: 'lunum_get_extraction_contract', arguments: {},
    }));
    assert.equal(contract.success, true);
    assert.equal(contract.contract.contractVersion, 'lunum-agent/0.3');
    assert.match(contract.contract.protocol.registryHash, /^[0-9a-f]{64}$/u);

    const built = textResult(await server.request(4, 'tools/call', {
      name: 'lunum_build_candidate',
      arguments: {
        world: 'real', kind: 'preference', predicate: 'prefer',
        roles: {
          experiencer: { type: 'actor', id: 'maria' },
          theme: { type: 'concept', id: 'quiet_mode' },
        },
      },
    }));
    assert.equal(built.success, true);
    assert.equal(built.candidate.kind, 'preference');

    const submitted = textResult(await server.request(5, 'tools/call', {
      name: 'lunum_submit_candidate',
      arguments: {
        sourceText: 'Maria prefers quiet mode.', sourceLanguage: 'en',
        candidateSem: built.candidate, provenance: { extractorType: 'other' },
      },
    }));
    assert.equal(submitted.success, true);
    assert.equal(submitted.submission.transportValid, true);
    assert.equal(submitted.submission.frameValid, true);
    assert.equal(submitted.submission.candidateIdentityAvailable, true);
    assert.equal(submitted.submission.promotable, false);
    assert.equal(submitted.submission.trust.promoted, false);

    const abstained = textResult(await server.request(6, 'tools/call', {
      name: 'lunum_submit_candidate',
      arguments: { sourceText: 'Unsupported.', sourceLanguage: 'en', candidateSem: null, provenance: { extractorType: 'other' } },
    }));
    assert.equal(abstained.success, true);
    assert.equal(abstained.submission.candidateIdentityAvailable, false);
    assert.equal(abstained.submission.promotable, false);

    const mutated = structuredClone(built.candidate);
    mutated.clauses[0].negated = true;
    const comparison = textResult(await server.request(7, 'tools/call', {
      name: 'lunum_compare', arguments: { expected: built.candidate, actual: mutated },
    }));
    assert.equal(comparison.success, true);
    assert.equal(comparison.comparison.hardMismatch, true);
    assert.ok(comparison.comparison.hardInvariants.some((item) => item.code === 'negation-flip'));

    const forged = await server.request(8, 'tools/call', {
      name: 'lunum_submit_candidate',
      arguments: { sourceText: 'Maria prefers quiet mode.', candidateSem: built.candidate, provenance: { extractorType: 'fabricated' } },
    });
    assert.equal(forged.result?.isError, true);
    assert.match(textResult(forged).error, /extractorType/u);

    const malformed = await server.request(9, 'tools/call', {
      name: 'lunum_submit_candidate',
      arguments: { sourceText: 'Maria prefers quiet mode.', candidateSem: 'not-an-object', provenance: { extractorType: 'other' } },
    });
    assert.equal(malformed.result?.isError, true);
    assert.match(textResult(malformed).error, /candidateSem must be an object/u);
  } finally {
    server.child.stdin.end();
    server.child.kill('SIGTERM');
    await Promise.race([once(server.child, 'exit'), new Promise((resolve) => setTimeout(resolve, 1_000))]);
  }
  assert.equal(server.stderr.join(''), '', 'stdio server must keep protocol stdout/stderr clean');
});
