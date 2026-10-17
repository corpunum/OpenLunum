import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromEvents, codexArgs, isQuotaError } from './run-codex-source-only.mjs';
import { classify } from './run-openai-compatible-source-only.mjs';

const ev = (item) => JSON.stringify({ type: 'item.completed', item });
const mcp = (tool, args, payload, status = 'completed') => ev({ type: 'mcp_tool_call', server: 'lunum', tool, arguments: JSON.stringify(args), status, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } });

test('Lunum MCP calls and the final message are recovered from codex --json events', () => {
  const out = fromEvents([JSON.stringify({ type: 'turn.started' }), mcp('lunum_get_extraction_contract', {}, { success: true, contract: { contractVersion: 'x' } }),
    ev({ type: 'agent_message', text: 'done\n{"status":"abstain","reason":"unsupported"}' }), JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 5 } })]);
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].name, 'lunum_get_extraction_contract');
  assert.equal(out.calls[0].result.contract.contractVersion, 'x');
  assert.match(out.finalText, /abstain/u);
  assert.deepEqual(out.usage, [{ input_tokens: 5 }]);
});

test('a shell command, web search or other MCP server makes the item invalid', () => {
  for (const item of [{ type: 'command_execution', command: 'cat x' }, { type: 'web_search', query: 'q' }, { type: 'mcp_tool_call', server: 'unumsearch', tool: 'search', arguments: '{}', status: 'completed' }]) {
    const { calls, finalText } = fromEvents([ev(item), ev({ type: 'agent_message', text: '{"status":"abstain","reason":"unsupported"}' })]);
    const row = classify({ request: { handle: 'h', sourceLanguage: 'en', sourceText: 'X.' }, calls, finalText, failure: null, pkg: { freeze: {} }, model: 'm', reportedModels: ['m'] });
    assert.ok(row.evidenceFailures.includes('DISALLOWED_TOOL'), item.type);
  }
});

test('the CLI switches off shell, web search and the user\'s other MCP servers, and enables only four Lunum tools', () => {
  const a = codexArgs({ model: 'gpt-6-luna', effort: 'low', launcher: '/x/launch.mjs' }).join(' ');
  for (const s of ['--disable shell_tool', 'web_search="disabled"', 'mcp_servers.unumsearch.enabled=false', '-s read-only', '--ephemeral']) assert.ok(a.includes(s), s);
  assert.match(a, /enabled_tools=\["lunum_get_extraction_contract","lunum_build_candidate","lunum_submit_candidate","lunum_validate"\]/u);
});

test('client warning items are diagnostics, not tool calls (pilot 3 harness bug)', () => {
  const out = fromEvents([ev({ type: 'error', message: 'Codex is ignoring 1 unrecognized configuration setting.' }), ev({ type: 'agent_message', text: '{"status":"parse"}' })]);
  assert.equal(out.calls.length, 0);
  assert.equal(out.diagnostics.length, 1);
});

test('a usage-limit event on stdout is recognised as quota exhaustion (gate run 2026-10-17)', () => {
  const stdout = '{"type":"error","message":"You\u2019ve hit your usage limit. Upgrade to Pro ... or try again at 2:49 PM."}';
  assert.equal(isQuotaError(stdout), true);
  assert.equal(isQuotaError('{"type":"turn.completed"}'), false);
});
