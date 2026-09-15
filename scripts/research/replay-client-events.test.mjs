import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseJsonLines, replaySession } from './replay-client-events.mjs';

test('public instruction package exposes frozen scoring conventions without gold', () => {
  const packagePath = 'experiments/natural-development-v8/extraction/public-instruction-package-v1.json';
  const value = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash('experiments/natural-development-v8/task-contract.json'), value.artifacts.taskContract.sha256);
  assert.equal(hash('experiments/natural-development-v8/extraction/source-only-contract.json'), value.artifacts.coreContract.sha256);
  assert.equal(hash('scripts/research/score-natural-source-only-extraction.mjs'), value.artifacts.scorer.sha256);
  assert.deepEqual(value.input, ['opaque handle', 'source text', 'source language', 'task contract', 'core extraction contract']);
  assert.ok(value.conventions.modality.includes('distinct'));
  assert.ok(value.conventions.termTypes.parcel.includes('object'));
  assert.equal(Object.hasOwn(value, 'gold'), false);

  const next = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v2.json', 'utf8'));
  assert.equal(next.status, 'frozen-for-next-source-only-run');
  assert.equal(next.freeze.coreContractVersion, 'lunum-agent/0.3');
  assert.equal(next.freeze.coreContractHash, 'e17e3f702eb1a0b459b02ea0cb169ef92c9b27fe287d70d5d340a0b92c30d782');
  assert.equal(next.freeze.schemaHash, '8aef5fdfa6feccd1b8bc22ec41df64d0c363b537df3df7b03e61a8e7663ed593');
  assert.equal(next.freeze.frameRegistryHash, '5391eaa4a7a49bb5ee1c7e13d7e61c30e8ddc5edd609c92b07b19ee1db9e2377');
  assert.equal(next.freeze.protocolRegistryHash, '116e90d37bbb2b769e6d6727b02a5518d28742fa7c34f1c07cbdaa91eeeca289');
  assert.equal(hash('packages/core/dist/src/agent-native.js'), next.freeze.coreArtifactSha256);
  assert.equal(hash('packages/mcp/dist/bin/lunum-mcp.js'), next.freeze.mcpArtifactSha256);
  assert.equal(hash('packages/mcp/dist/src/tools.js'), next.freeze.toolImplementationSha256);
  assert.equal(Object.hasOwn(next, 'gold'), false);
});

const request = { handle: 'x', sourceText: 'Dana allows Mira.', sourceSha256: 'placeholder' };
const result = (sem) => ({ content: [{ type: 'text', text: JSON.stringify({ success: true, submission: { source: { text: 'Dana allows Mira.' }, sem } }) }] });
const codex = (submitArgs, submitResult, buildResult = null) => [
  { type: 'item.started', item: { id: 'b', type: 'mcp_tool_call', tool: 'lunum_build_candidate', status: 'in_progress' } },
  { type: 'item.completed', item: { id: 'b', type: 'mcp_tool_call', tool: 'lunum_build_candidate', status: buildResult ? 'failed' : 'completed', result: { content: [{ type: 'text', text: JSON.stringify(buildResult ?? { success: true }) }] } } },
  { type: 'item.started', item: { id: 's', type: 'mcp_tool_call', tool: 'lunum_submit_candidate', arguments: submitArgs, status: 'in_progress' } },
  { type: 'item.completed', item: { id: 's', type: 'mcp_tool_call', tool: 'lunum_submit_candidate', arguments: submitArgs, result: submitResult, status: 'completed' } }
];

test('deduplicates started/completed and preserves rejected non-null submission', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [] };
  const row = replaySession(codex({ sourceText: request.sourceText, candidateSem: sem }, result(null)), request, { status: 'abstain' });
  assert.deepEqual(row.eventIds, ['b', 's']);
  assert.equal(row.agentAction, 'non-null-submission');
  assert.equal(row.validation, 'rejected');
  assert.equal(row.oldClassification, 'abstain');
});

test('keeps explicit null distinct and records builder fallback', () => {
  const row = replaySession(codex({ sourceText: request.sourceText, candidateSem: null }, result(null), { success: false, error: 'builder_failed' }), request);
  assert.equal(row.agentAction, 'explicit-null');
  assert.equal(row.execution, 'completed-after-builder-failure');
  assert.equal(row.fallback, 'after-builder-failure');
  assert.equal(row.validation, 'not-reached');
});

test('retains actual submitted source hash mismatch', () => {
  const row = replaySession(codex({ sourceText: `${request.sourceText}!`, candidateSem: {} }, result({})), request);
  assert.equal(row.sourceBinding.matched, false);
  assert.notEqual(row.submittedSource.sha256, row.requestedSource.sha256);
  assert.ok(row.diagnostics.includes('submitted_source_hash_mismatch'));
});

test('missing submission is not abstention', () => {
  const row = replaySession([], request);
  assert.equal(row.agentAction, 'no-submission');
  assert.equal(row.execution, 'missing');
  assert.equal(row.validation, 'not-reached');
});

test('started submission without a terminal result is missing execution', () => {
  const row = replaySession([{ type: 'item.started', item: { id: 's', type: 'mcp_tool_call', tool: 'lunum_submit_candidate', arguments: { sourceText: request.sourceText, candidateSem: {} }, status: 'in_progress' } }], request);
  assert.equal(row.agentAction, 'non-null-submission');
  assert.equal(row.execution, 'missing');
  assert.equal(row.validation, 'not-reached');
  assert.ok(row.diagnostics.includes('submission_result_missing_or_unparseable'));
});

test('reports malformed, duplicate, conflicting, and multiple native events', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [] };
  const args = { sourceText: request.sourceText, candidateSem: sem };
  const events = codex(args, result(sem));
  events.push({ type: 'item.completed', item: { id: 's', type: 'mcp_tool_call', tool: 'lunum_submit_candidate', arguments: args, result: result(null), status: 'completed' } });
  events.push({ type: 'item.completed', item: { id: 's2', type: 'mcp_tool_call', tool: 'lunum_submit_candidate', arguments: { ...args, candidateSem: null }, result: result(null), status: 'completed' } });
  const row = replaySession(events, request);
  assert.equal(row.multipleSubmissionAttempts, true);
  assert.ok(row.diagnostics.includes('multiple_submission_attempts'));
  assert.ok(row.diagnostics.includes('conflicting_duplicate_events'));
  const parsed = parseJsonLines('{"ok":true}\nnot-json\n', 'synthetic');
  assert.equal(parsed.events.length, 1);
  assert.deepEqual(parsed.diagnostics, ['invalid_jsonl:synthetic:2']);
});

test('a truncated stream is reported before replay rather than invented', () => {
  const parsed = parseJsonLines('{"type":"item.started","item":{"id":"s"}}\n{"type":', 'truncated');
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.diagnostics.length, 1);
});

test('Claude native tool_use and tool_result join by tool id', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [] };
  const events = [
    { message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu-1', name: 'mcp__lunum__lunum_submit_candidate', input: { sourceText: request.sourceText, candidateSem: sem } }] } },
    { message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu-1', content: [{ type: 'text', text: JSON.stringify({ submission: { source: { text: request.sourceText }, sem } }) }] }] } }
  ];
  const row = replaySession(events, request);
  assert.equal(row.submissionEventId, 'toolu-1');
  assert.equal(row.validation, 'accepted');
});

test('conflicting Claude results are retained as a conflict, not silently accepted', () => {
  const use = { type: 'tool_use', id: 'toolu-conflict', name: 'mcp__lunum__lunum_submit_candidate', input: { sourceText: request.sourceText, candidateSem: {} } };
  const event = (text) => ({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: [{ type: 'text', text }] }] } });
  const row = replaySession([{ message: { role: 'assistant', content: [use] } }, event('{"submission":{"source":{"text":"Dana allows Mira."},"sem":{}}}'), event('{"submission":{"source":{"text":"Dana allows Mira."},"sem":null}}')], request);
  assert.ok(row.diagnostics.includes('conflicting_duplicate_events'));
  assert.ok(row.duplicateOrConflictingEvents.includes('toolu-conflict'));
  assert.equal(row.conflictingResultEvents.length, 2);
});
