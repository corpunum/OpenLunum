import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_CONTRACT_VERSION,
  MCP_TOOLS,
  MCP_DEFAULT_RATE_LIMIT,
  MCP_MAX_INPUT_BYTES,
  MCP_DEFAULT_TIMEOUT_MS,
  getMcpContractManifest,
} from '../src/mcp-contract.js';

describe('MCP contract', () => {
  it('contract version is semver', () => {
    assert.match(MCP_CONTRACT_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('MCP_TOOLS includes expected tools', () => {
    const names = MCP_TOOLS.map(t => t.name);
    for (const expected of ['lunum_parse', 'lunum_realize', 'lunum_render', 'lunum_retrieve', 'lunum_validate', 'lunum_context']) {
      assert.ok(names.includes(expected), `missing tool: ${expected}`);
    }
  });

  it('tool names are unique', () => {
    const names = MCP_TOOLS.map(t => t.name);
    assert.strictEqual(new Set(names).size, names.length);
  });

  it('each tool has name, description, rateLimit, maxInputBytes, timeoutMs', () => {
    for (const tool of MCP_TOOLS) {
      assert.ok(tool.name.length > 0);
      assert.ok(tool.description.length > 0);
      assert.ok(tool.rateLimit.windowMs > 0);
      assert.ok(tool.rateLimit.maxRequests > 0);
      assert.ok(tool.maxInputBytes > 0);
      assert.ok(tool.timeoutMs > 0);
    }
  });

  it('lunum_validate does not require auth', () => {
    const validate = MCP_TOOLS.find(t => t.name === 'lunum_validate')!;
    assert.strictEqual(validate.requiresAuth, false);
  });

  it('mutation tools require auth', () => {
    for (const name of ['lunum_parse', 'lunum_realize', 'lunum_render', 'lunum_retrieve']) {
      const tool = MCP_TOOLS.find(t => t.name === name)!;
      assert.strictEqual(tool.requiresAuth, true, `${name} should require auth`);
    }
  });

  it('retrieve has stricter rate limit', () => {
    const retrieve = MCP_TOOLS.find(t => t.name === 'lunum_retrieve')!;
    assert.ok(retrieve.rateLimit.maxRequests < MCP_DEFAULT_RATE_LIMIT.maxRequests);
  });

  it('default constants are reasonable', () => {
    assert.strictEqual(MCP_MAX_INPUT_BYTES, 524_288);
    assert.strictEqual(MCP_DEFAULT_TIMEOUT_MS, 30_000);
    assert.strictEqual(MCP_DEFAULT_RATE_LIMIT.maxRequests, 30);
  });
});

describe('getMcpContractManifest', () => {
  it('returns version and tools', () => {
    const manifest = getMcpContractManifest();
    assert.strictEqual(manifest.version, MCP_CONTRACT_VERSION);
    assert.ok(manifest.tools.length >= 6);
  });
});
