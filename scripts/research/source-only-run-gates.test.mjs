import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getExtractionContract } from '../../packages/core/dist/src/index.js';
import { artifactBinding, checkServedContract, checkObservedContracts, checkSessionIntegrity, contradictoryAbstention, budgetPlan, validateRequests, evidenceFailures, runCaptured, sha256 } from './source-only-run-gates.mjs';

const root = process.cwd();
const packagePath = path.join(root, 'experiments/natural-development-v8/extraction/public-instruction-package-v14.json');
const pkg = JSON.parse(fs.readFileSync(packagePath));
const profilePath = path.resolve(path.dirname(packagePath), pkg.freeze.taskProfilePath);
const contract = getExtractionContract();
const plan = budgetPlan({ model: 'claude-test-exact-20261002', totalUsd: '0.20', itemUsd: '0.10', count: 2, concurrency: 1, timeoutMs: 1000 });
const binding = () => artifactBinding(root, packagePath, profilePath, pkg);

test('v14 binds every current artifact and dependency, not just the old five', () => {
  assert.equal(binding().match, true);
  for (const check of binding().checks) {
    const mutant = structuredClone(pkg);
    if (check.key === 'transportValidatorDependency') mutant.freeze[check.key].lockfileSha256 = '0'.repeat(64);
    else mutant.freeze[check.key] = '0'.repeat(64);
    assert.equal(artifactBinding(root, packagePath, profilePath, mutant).match, false, check.key);
    delete mutant.freeze[check.key];
    assert.equal(artifactBinding(root, packagePath, profilePath, mutant).match, false, `missing ${check.key}`);
  }
  assert.equal(artifactBinding(root, packagePath, path.join(root, 'experiments/natural-development-v8/extraction/public-task-profile-iteration2.json'), pkg).match, false);
  const newDependency = structuredClone(pkg); newDependency.freeze.forgottenArtifactSha256 = '0'.repeat(64);
  assert.throws(() => artifactBinding(root, packagePath, profilePath, newDependency), /unhandled_freeze_binding/);
});

test('missing or mutated served contracts fail, including non-version fields', () => {
  assert.equal(checkServedContract(contract, pkg).match, true);
  assert.equal(checkServedContract(null, pkg).match, false);
  for (const field of ['coreContractVersion', 'coreContractHash', 'coreContractJsonSerializationSha256', 'instructionVersion', 'instructionHash', 'schemaHash', 'frameRegistryVersion', 'frameRegistryHash', 'protocolVersion', 'protocolRegistryHash']) {
    const mutant = structuredClone(pkg); mutant.freeze[field] = 'wrong';
    assert.equal(checkServedContract(contract, mutant).match, false, field);
  }
  const events = [
    { message: { content: [{ type: 'tool_use', id: 'contract-1', name: 'mcp__lunum__lunum_get_extraction_contract', input: {} }] } },
    { message: { content: [{ type: 'tool_result', tool_use_id: 'contract-1', content: [{ type: 'text', text: JSON.stringify({ success: true, contract }) }] }] } },
  ];
  assert.equal(checkObservedContracts(events, pkg).match, true);
  assert.equal(checkObservedContracts([], pkg).match, false);
  assert.equal(checkObservedContracts([...events, events[1]], pkg).match, false);
});

test('explicit spending reservations and timeouts fail before launching', () => {
  for (const change of [{ model: 'sonnet' }, { model: undefined }, { totalUsd: undefined }, { totalUsd: '-1' }, { itemUsd: '0.001' }, { totalUsd: '0.19' }, { count: 0 }, { timeoutMs: NaN }, { concurrency: 4 }]) {
    assert.throws(() => budgetPlan({ ...plan, count: 2, ...change }));
  }
  assert.equal(plan.requestedReservationUsd, 0.2);
});

test('source-only requests reject gold, changed source hashes, contract drift and unsafe handles', () => {
  const row = { handle: 'probe1', sourceText: 'Restart test-server.', sourceLanguage: 'en', sourceSha256: sha256('Restart test-server.'), contractHash: pkg.freeze.coreContractHash };
  validateRequests([row], pkg);
  for (const change of [{ goldSem: {} }, { expectedOutcome: 'parse' }, { sourceText: 'Changed.' }, { handle: '../escape' }, { contractHash: '0'.repeat(64) }]) {
    assert.throws(() => validateRequests([{ ...row, ...change }], pkg));
  }
  assert.throws(() => validateRequests([row, row], pkg));
});

test('successful outcome does not excuse unknown cost, model, exit, contract or timeout', () => {
  const row = { status: 'parse', exitCode: 0, failure: null, observedContractBinding: { match: true }, sessionIntegrity: { match: true }, model: { initModel: plan.model, reported: [plan.model] }, costUsd: 0.05 };
  assert.deepEqual(evidenceFailures(row, pkg, plan.model, plan), []);
  for (const change of [{ exitCode: 1 }, { timedOut: true }, { interrupted: true }, { costUsd: null }, { costUsd: 0.11 }, { observedContractBinding: { match: false } }, { sessionIntegrity: null }, { model: { initModel: 'sonnet', reported: [] } }, { failure: 'SOURCE_MISMATCH' }, { status: null }]) {
    assert.ok(evidenceFailures({ ...row, ...change }, pkg, plan.model, plan).length);
  }
});

test('subprocess bytes checkpoint before close and timeout preserves partial evidence', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-run-gates-'));
  try {
    const stdoutPath = path.join(temp, 'stdout'); const stderrPath = path.join(temp, 'stderr');
    let beforeClose = false;
    const result = await runCaptured({ executable: process.execPath, args: ['-e', 'process.stdout.write("checkpoint\\n");setInterval(()=>{},1000);'], cwd: temp, stdoutPath, stderrPath, timeoutMs: 200,
      onCheckpoint: () => { beforeClose = fs.readFileSync(stdoutPath, 'utf8') === 'checkpoint\n'; } });
    assert.equal(beforeClose, true); assert.equal(result.timedOut, true);
    assert.equal(fs.readFileSync(stdoutPath, 'utf8'), 'checkpoint\n');
    await assert.rejects(runCaptured({ executable: process.execPath, args: [], cwd: temp, stdoutPath, stderrPath, timeoutMs: 1000 }), /EEXIST/);
  } finally { fs.rmSync(temp, { recursive: true }); }
});

test('launch failure is recorded, and provider reasoning is removed rather than parsed or stored', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-run-gates-'));
  try {
    const failed = await runCaptured({ executable: path.join(temp, 'does-not-exist'), args: [], cwd: temp, stdoutPath: path.join(temp, 'missing-out'), stderrPath: path.join(temp, 'missing-err'), timeoutMs: 1000 });
    assert.ok(failed.launchError); assert.notEqual(failed.exitCode, 0);
    const event = { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'private-reasoning-secret' }, { type: 'tool_use', id: '1', name: 'tool', input: {} }] } };
    const result = await runCaptured({ executable: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(event) + '\n')});`], cwd: temp, stdoutPath: path.join(temp, 'out'), stderrPath: path.join(temp, 'err'), timeoutMs: 1000, publicJsonEvents: true });
    assert.equal(result.stdout.includes('private-reasoning-secret'), false);
    assert.equal(JSON.parse(result.stdout).message.content[0].type, 'tool_use');
    assert.equal(JSON.parse(result.stdout).providerReasoningRemoved, true);
    assert.equal(fs.readFileSync(path.join(temp, 'out'), 'utf8'), result.stdout);
  } finally { fs.rmSync(temp, { recursive: true }); }
});

test('real CLI refuses missing model/budget before writing output or launching provider', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-run-gates-'));
  try {
    const out = path.join(temp, 'must-not-exist');
    const cli = spawnSync(process.execPath, ['scripts/research/run-claude-code-source-only.mjs', out, '--requests', 'experiments/natural-development-v8/extraction/source-only-request.jsonl', '--package', packagePath], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(cli.status, 0); assert.match(cli.stderr, /explicit_resolved_model_required/);
    assert.equal(fs.existsSync(out), false);
  } finally { fs.rmSync(temp, { recursive: true }); }
});

test('event integrity rejects swapped source/language, unmatched calls, early extraction and duplicates', () => {
  const request = { sourceText: 'Restart test-server.', sourceLanguage: 'en' };
  const use = (id, name, input = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__lunum__${name}`, input }] } });
  const response = (id, value) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: JSON.stringify(value) }] } });
  const events = [ { type: 'system', subtype: 'init' }, use('c', 'lunum_get_extraction_contract'), response('c', { success: true, contract }),
    use('s', 'lunum_submit_candidate', request), response('s', { success: false, error: 'semantic rejection' }), { type: 'result' } ];
  assert.equal(checkSessionIntegrity(events, request).match, true, 'observed semantic rejection is not fabricated/corrupt evidence');
  assert.equal(checkSessionIntegrity(events, { ...request, sourceLanguage: 'el' }).match, false);
  assert.equal(checkSessionIntegrity(events, { ...request, sourceText: 'Changed.' }).match, false);
  assert.equal(checkSessionIntegrity(events.filter((_, i) => i !== 4), request).match, false);
  assert.equal(checkSessionIntegrity([...events, events[4]], request).match, false);
  assert.equal(checkSessionIntegrity([events[0], events[3], events[4], events[1], events[2], events[5]], request).match, false);
  assert.equal(checkSessionIntegrity([...events, events[5]], request).match, false);
  assert.equal(checkSessionIntegrity([...events, events[1], events[2]], request).match, false);
  const badPayload = structuredClone(events); badPayload[4] = response('s', { success: true });
  assert.equal(checkSessionIntegrity(badPayload, request).match, false);
  const malformed = structuredClone(events); malformed[4].message.content[0].content = [null];
  assert.equal(checkSessionIntegrity(malformed, request).match, false);
});

test('split UTF-8 provider chunks preserve Greek source exactly', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-run-gates-'));
  try {
    const source = 'Επανεκκίνησε τον διακομιστή.';
    const event = JSON.stringify({ type: 'assistant', sourceText: source }) + '\n';
    const split = Buffer.byteLength(event.slice(0, event.indexOf('Ε'))) + 1;
    const result = await runCaptured({ executable: process.execPath, args: ['-e', `const b=Buffer.from(${JSON.stringify(event)});process.stdout.write(b.subarray(0,${split}));setTimeout(()=>process.stdout.write(b.subarray(${split})),40);`], cwd: temp,
      stdoutPath: path.join(temp, 'out'), stderrPath: path.join(temp, 'err'), timeoutMs: 1000, publicJsonEvents: true });
    assert.equal(result.exitCode, 0); assert.equal(JSON.parse(result.stdout).sourceText, source);
  } finally { fs.rmSync(temp, { recursive: true }); }
});

test('handled parent interruption stops the owned child and cannot yield valid evidence', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-run-gates-'));
  try {
    let sent = false;
    const result = await runCaptured({ executable: process.execPath, args: ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000);'], cwd: temp,
      stdoutPath: path.join(temp, 'out'), stderrPath: path.join(temp, 'err'), timeoutMs: 2000, onCheckpoint: () => { if (!sent) { sent = true; process.emit('SIGINT'); } } });
    assert.equal(result.interrupted, true); assert.notEqual(result.exitCode, 0);
    assert.equal(result.stdout, 'ready\n');
  } finally { fs.rmSync(temp, { recursive: true }); }
});

test('prose abstention cannot erase canonical submission; explicit withdrawal and rejection differ', () => {
  const accepted = { input: { candidateSem: {} }, result: { success: true, submission: { candidateIdentityAvailable: true } } };
  assert.equal(contradictoryAbstention('abstain', [accepted]), true);
  assert.equal(contradictoryAbstention('parse', [accepted]), false);
  assert.equal(contradictoryAbstention('abstain', [{ ...accepted, result: { success: true, submission: { candidateIdentityAvailable: false } } }]), false);
  assert.equal(contradictoryAbstention('abstain', [accepted, { input: { candidateSem: null }, result: { success: true } }]), false);
});
