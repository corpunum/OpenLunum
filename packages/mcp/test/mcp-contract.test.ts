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
    for (const expected of ['lunum_derive', 'lunum_get_extraction_contract', 'lunum_submit_candidate', 'lunum_compile_context', 'lunum_fingerprint', 'lunum_validate', 'lunum_render', 'lunum_compare', 'lunum_classify']) {
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

  it('candidate submission has the strictest rate limit', () => {
    for (const name of ['lunum_submit_candidate']) {
      const tool = MCP_TOOLS.find(t => t.name === name)!;
      assert.ok(tool.rateLimit.maxRequests < MCP_DEFAULT_RATE_LIMIT.maxRequests, `${name} should be rate limited`);
    }
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
