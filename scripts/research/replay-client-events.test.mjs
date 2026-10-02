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

  // v2 is preserved as history: it froze the build whose lunum_build_candidate
  // advertised no top-level properties. Its contract hashes still hold; its
  // tool artifact no longer matches the current build by design.
  const previous = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v2.json', 'utf8'));
  assert.equal(previous.status, 'frozen-for-next-source-only-run');
  assert.equal(previous.freeze.toolImplementationSha256, '9f9b094d5c598959eea0e0f6a565e26fd12abccf75ed78b8a2da76e87c79e1c8');

  // v3 is preserved as history: it froze lunum-agent/0.3, before the
  // placeholder_role rule (decisions/0007). Only its records are checked.
  const v3 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v3.json', 'utf8'));
  assert.equal(v3.supersedes.path, 'public-instruction-package-v2.json');
  assert.equal(v3.freeze.coreContractVersion, 'lunum-agent/0.3');
  assert.equal(v3.freeze.coreContractHash, 'e17e3f702eb1a0b459b02ea0cb169ef92c9b27fe287d70d5d340a0b92c30d782');
  assert.equal(v3.freeze.toolImplementationSha256, '48aa0a0c8ddb9505c7db2767ca89518a20d6ffb20210f1b5ea8d5676a3ab0299');

  // v4 (lunum-agent/0.4) is history; the recorded 2026-09-26 v4 run binds it.
  const v4 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v4.json', 'utf8'));
  assert.equal(v4.supersedes.path, 'public-instruction-package-v3.json');
  assert.equal(v4.freeze.coreContractVersion, 'lunum-agent/0.4');
  assert.equal(v4.freeze.coreContractHash, 'bdb1092d167a2d3ded4d1c18cf3e1eb4d2ae35b4bc3ff5b84a262071e8f3c34c');

  // v5 (lunum-agent/0.5) is history; the recorded v5 runs bind it.
  const v5 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v5.json', 'utf8'));
  assert.equal(v5.freeze.coreContractVersion, 'lunum-agent/0.5');
  assert.equal(v5.freeze.frameRegistryHash, previous.freeze.frameRegistryHash);

  // v6 (frame 0.2) is history; the recorded frame-0.2 runs bind it.
  const v6 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v6.json', 'utf8'));
  assert.equal(v6.freeze.coreContractVersion, 'lunum-agent/0.6');
  assert.equal(v6.freeze.frameRegistryVersion, 'lunum-frame/0.2');
  // decisions/0008 deliberately changed the frame and protocol registries.
  assert.notEqual(v6.freeze.frameRegistryHash, v5.freeze.frameRegistryHash);
  assert.notEqual(v6.freeze.protocolRegistryHash, v5.freeze.protocolRegistryHash);

  const v7 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v7.json', 'utf8'));
  assert.equal(v7.freeze.coreContractVersion, 'lunum-agent/0.7');
  assert.equal(v7.freeze.frameRegistryVersion, 'lunum-frame/0.3');
  assert.equal(v7.freeze.protocolRegistryHash, v6.freeze.protocolRegistryHash, 'decisions/0010 changes frames, not the protocol vocabulary');
  assert.notEqual(v7.freeze.frameRegistryHash, v6.freeze.frameRegistryHash);

  // v8 is history; the recorded contract-0.8 runs bind it.
  const v8 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v8.json', 'utf8'));
  assert.equal(v8.supersedes.path, 'public-instruction-package-v7.json');
  assert.equal(v8.freeze.toolImplementationSha256, '48aa0a0c8ddb9505c7db2767ca89518a20d6ffb20210f1b5ea8d5676a3ab0299');

  const v9 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v9.json', 'utf8'));
  assert.equal(v9.supersedes.path, 'public-instruction-package-v8.json');
  assert.equal(v9.freeze.coreContractHash, v8.freeze.coreContractHash, 'v9 rebinds the build; the contract is unchanged');

  const v10 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v10.json', 'utf8'));
  assert.equal(v10.supersedes.path, 'public-instruction-package-v9.json');
  assert.equal(v10.freeze.coreContractVersion, 'lunum-agent/0.9');
  assert.equal(v10.freeze.frameRegistryHash, v9.freeze.frameRegistryHash, 'amendment 1 changes vocabulary, not frames');

  const v11 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v11.json', 'utf8'));
  assert.equal(v11.freeze.coreContractVersion, 'lunum-agent/0.10');
  assert.equal(v11.freeze.frameRegistryVersion, 'lunum-frame/0.4');
  assert.equal(v11.freeze.protocolRegistryHash, v10.freeze.protocolRegistryHash, 'decisions/0014 changes frames, not vocabulary');

  const v12 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v12.json', 'utf8'));
  assert.equal(v12.freeze.coreContractVersion, 'lunum-agent/0.11');
  assert.equal(v12.freeze.frameRegistryVersion, 'lunum-frame/0.5');

  // v13 is frozen history; v14 binds the authoritative transport enforcement.
  const v13 = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v13.json', 'utf8'));
  assert.equal(v13.freeze.coreContractVersion, 'lunum-agent/0.12');
  assert.equal(v13.freeze.coreContractHash, 'c969f5d01c758c27b9cee71afc4770e422b0a391881ffe3bcff340c39cdcb682');
  const next = JSON.parse(fs.readFileSync('experiments/natural-development-v8/extraction/public-instruction-package-v14.json', 'utf8'));
  assert.equal(next.status, 'frozen-for-next-source-only-run');
  assert.equal(next.supersedes.path, 'public-instruction-package-v13.json');
  assert.equal(next.freeze.coreContractVersion, 'lunum-agent/0.13');
  assert.equal(next.freeze.frameRegistryHash, v12.freeze.frameRegistryHash, 'decisions/0016 changes submission gating, not frames');
  assert.equal(next.freeze.protocolRegistryHash, v12.freeze.protocolRegistryHash, 'decisions/0016 changes submission gating, not vocabulary');
  assert.equal(v8.freeze.coreContractVersion, 'lunum-agent/0.8');
  assert.equal(v8.freeze.protocolVersion, 'lunum-protocol/0.3');
  assert.equal(next.freeze.protocolVersion, 'lunum-protocol/0.4');
  assert.equal(v10.freeze.protocolVersion, 'lunum-protocol/0.4');
  assert.equal(next.freeze.schemaHash, previous.freeze.schemaHash, 'transport schema unchanged since v2');
  assert.notEqual(v8.freeze.protocolRegistryHash, v7.freeze.protocolRegistryHash, 'decisions/0011 extends the predicate aliases');
  assert.match(next.freeze.launcherSha256, /^[0-9a-f]{64}$/u);
  assert.equal(hash('packages/mcp/dist/src/tools.js'), next.freeze.toolImplementationSha256);
  assert.equal(hash('packages/mcp/dist/bin/lunum-mcp.js'), next.freeze.mcpArtifactSha256);
  assert.equal(hash('packages/core/dist/src/agent-native.js'), next.freeze.coreArtifactSha256);
  assert.equal(hash('packages/core/dist/src/frame-registry.js'), next.freeze.frameValidatorArtifactSha256);
  assert.equal(hash('packages/core/dist/src/literal-retention.js'), next.freeze.literalRetentionArtifactSha256);
  assert.equal(hash('packages/core/dist/src/semantic-transport.js'), next.freeze.transportValidatorArtifactSha256);
  assert.equal(hash('packages/core/dist/src/semantic-transport-schema.js'), next.freeze.transportSchemaArtifactSha256);
  assert.equal(hash('packages/core/dist/src/agent-builder.js'), next.freeze.builderArtifactSha256);
  assert.equal(hash('experiments/natural-development-v8/extraction/public-task-profile-iteration6.json'), next.freeze.taskProfileSha256);
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
