import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getExtractionContract } from '../../packages/core/dist/src/index.js';
import { artifactBinding, captureServedRuntimeManifest, validateServedRuntimeManifest, checkServedContract, checkObservedContracts, checkSessionIntegrity, contradictoryAbstention, budgetPlan, validateRequests, evidenceFailures, runCaptured, sha256 } from './source-only-run-gates.mjs';

const root = process.cwd();
const packageDirectory = path.join(root, 'experiments/natural-development-v8/extraction');
const packagePath = path.join(packageDirectory, 'public-instruction-package-v21.json');
const pkg = JSON.parse(fs.readFileSync(packagePath));
const legacyPackagePath = path.join(packageDirectory, 'public-instruction-package-v14.json');
const legacyPkg = JSON.parse(fs.readFileSync(legacyPackagePath));
const profilePath = path.resolve(path.dirname(packagePath), pkg.freeze.taskProfilePath);
const contract = getExtractionContract();
const plan = budgetPlan({ model: 'claude-test-exact-20261002', totalUsd: '0.20', itemUsd: '0.10', count: 2, concurrency: 1, timeoutMs: 1000 });
const binding = () => artifactBinding(root, packagePath, profilePath, pkg);
// Scratch space inside git metadata: `.git` is a file in a linked worktree, so
// resolve the real git directory instead of assuming `<root>/.git/`.
const gitScratch = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).stdout.trim() || path.join(root, '.git');

test('v21 binds every current artifact, dependency and served runtime manifest', () => {
  const result = binding();
  assert.equal(result.match, true);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  const manifestPath = path.resolve(packageDirectory, pkg.freeze.servedRuntimeManifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(runtimeCheck.actual, sha256(fs.readFileSync(manifestPath)));
  assert.equal(runtimeCheck.runtime.match, true);
  assert.equal(runtimeCheck.runtime.artifactCount, manifest.artifacts.length);
  assert.equal(runtimeCheck.match, true);
  for (const check of result.checks) {
    const mutant = structuredClone(pkg);
    if (check.key === 'transportValidatorDependency') mutant.freeze[check.key].lockfileSha256 = '0'.repeat(64);
    else mutant.freeze[check.key] = '0'.repeat(64);
    assert.equal(artifactBinding(root, packagePath, profilePath, mutant).match, false, check.key);
    delete mutant.freeze[check.key];
    assert.equal(artifactBinding(root, packagePath, profilePath, mutant).match, false, `missing ${check.key}`);
  }
  for (const key of ['servedRuntimeManifestPath', 'servedRuntimeManifestSha256']) {
    const mutant = structuredClone(pkg);
    delete mutant.freeze[key];
    assert.equal(artifactBinding(root, packagePath, profilePath, mutant).match, false, `missing ${key}`);
  }
  const changedManifestHash = structuredClone(pkg);
  changedManifestHash.freeze.servedRuntimeManifestSha256 = '0'.repeat(64);
  assert.equal(artifactBinding(root, packagePath, profilePath, changedManifestHash).match, false, 'manifest content hash');
  const missingManifest = structuredClone(pkg);
  missingManifest.freeze.servedRuntimeManifestPath = 'missing-manifest.json';
  assert.equal(artifactBinding(root, packagePath, profilePath, missingManifest).match, false, 'missing manifest file');
  assert.equal(artifactBinding(root, packagePath, path.join(root, 'experiments/natural-development-v8/extraction/public-task-profile-iteration2.json'), pkg).match, false);
  const newDependency = structuredClone(pkg); newDependency.freeze.forgottenArtifactSha256 = '0'.repeat(64);
  assert.throws(() => artifactBinding(root, packagePath, profilePath, newDependency), /unhandled_freeze_binding/);
});

test('legacy v14 has no live served-runtime binding', () => {
  const legacyProfilePath = path.resolve(path.dirname(legacyPackagePath), legacyPkg.freeze.taskProfilePath);
  assert.equal(artifactBinding(root, legacyPackagePath, legacyProfilePath, legacyPkg).match, false);
});

test('v15 remains frozen historical binding and cannot certify current contract0.14', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v15.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  assert.equal(artifactBinding(root, historicalPath, profile, historical).match, false);
  assert.equal(checkServedContract(contract, historical).match, false);
});

test('v17 remains frozen historical binding and cannot certify current contract0.18', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v17.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  const result = artifactBinding(root, historicalPath, profile, historical);
  assert.equal(result.match, false);
  // The artifacts changed by decisions/0020-0022 drift; the rest of v17 still
  // binds the current bytes, and its manifest file is unaltered.
  const drifted = result.checks.filter(check => !check.match).map(check => check.key).sort();
  assert.deepEqual(drifted, ['coreArtifactSha256', 'frameValidatorArtifactSha256', 'literalRetentionArtifactSha256', 'servedRuntimeManifestSha256', 'toolImplementationSha256']);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  assert.equal(runtimeCheck.actual, historical.freeze.servedRuntimeManifestSha256);
  assert.equal(runtimeCheck.runtime.match, false);
  // The added discourse module is reported as unlisted, the changed modules as changed.
  assert.ok(runtimeCheck.runtime.errors.includes('served_runtime_unlisted:packages/core/dist/src/discourse.js'));
  const served = checkServedContract(contract, historical);
  assert.equal(served.match, false);
  assert.deepEqual(served.mismatches.sort(), ['coreContractHash', 'coreContractJsonSerializationSha256', 'coreContractVersion', 'frameRegistryHash', 'frameRegistryVersion', 'instructionHash', 'instructionVersion', 'protocolRegistryHash', 'protocolVersion']);
  assert.equal(checkServedContract(contract, pkg).match, true);
});

test('v20 remains frozen historical binding; only the served discourse module drifts', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v20.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  const result = artifactBinding(root, historicalPath, profile, historical);
  assert.equal(result.match, false);
  // ambient-discourse-v2 changes discourse.js (path literals) and nothing else:
  // the contract, frames, tools and literal retention still bind v20's bytes.
  const drifted = result.checks.filter(check => !check.match).map(check => check.key).sort();
  assert.deepEqual(drifted, ['servedRuntimeManifestSha256']);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  assert.equal(runtimeCheck.actual, historical.freeze.servedRuntimeManifestSha256);
  assert.deepEqual(runtimeCheck.runtime.errors, ['served_runtime_changed:packages/core/dist/src/discourse.js']);
  // Same contract: v20 still certifies the served contract, only not the runtime bytes.
  assert.equal(checkServedContract(contract, historical).match, true);
  assert.equal(checkServedContract(contract, pkg).match, true);
});

test('v19 remains frozen historical binding and cannot certify current contract0.18', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v19.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  const result = artifactBinding(root, historicalPath, profile, historical);
  assert.equal(result.match, false);
  // Exactly the artifacts changed by decisions/0023 (contract and frame
  // registry) drift; protocol vocabulary, literal retention and tools still bind.
  const drifted = result.checks.filter(check => !check.match).map(check => check.key).sort();
  assert.deepEqual(drifted, ['coreArtifactSha256', 'frameValidatorArtifactSha256', 'servedRuntimeManifestSha256']);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  assert.equal(runtimeCheck.actual, historical.freeze.servedRuntimeManifestSha256);
  assert.deepEqual(runtimeCheck.runtime.errors.sort(), [
    'served_runtime_changed:packages/core/dist/src/agent-native.js',
    'served_runtime_changed:packages/core/dist/src/discourse.js',
    'served_runtime_changed:packages/core/dist/src/frame-registry.js'
  ]);
  const served = checkServedContract(contract, historical);
  assert.equal(served.match, false);
  assert.deepEqual(served.mismatches.sort(), ['coreContractHash', 'coreContractJsonSerializationSha256', 'coreContractVersion', 'frameRegistryHash', 'frameRegistryVersion', 'instructionHash', 'instructionVersion']);
  assert.equal(checkServedContract(contract, pkg).match, true);
});

test('v18 remains frozen historical binding and cannot certify current contract0.18', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v18.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  const result = artifactBinding(root, historicalPath, profile, historical);
  assert.equal(result.match, false);
  // Exactly the artifacts changed by decisions/0022 (contract, protocol and
  // frame registries) drift; literal retention, tools and the rest still bind.
  const drifted = result.checks.filter(check => !check.match).map(check => check.key).sort();
  assert.deepEqual(drifted, ['coreArtifactSha256', 'frameValidatorArtifactSha256', 'servedRuntimeManifestSha256']);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  assert.equal(runtimeCheck.actual, historical.freeze.servedRuntimeManifestSha256);
  assert.deepEqual(runtimeCheck.runtime.errors.sort(), [
    'served_runtime_changed:packages/core/dist/src/agent-native.js',
    'served_runtime_changed:packages/core/dist/src/discourse.js',
    'served_runtime_changed:packages/core/dist/src/frame-registry.js',
    'served_runtime_changed:packages/core/dist/src/semantic-registry.js'
  ]);
  const served = checkServedContract(contract, historical);
  assert.equal(served.match, false);
  assert.deepEqual(served.mismatches.sort(), ['coreContractHash', 'coreContractJsonSerializationSha256', 'coreContractVersion', 'frameRegistryHash', 'frameRegistryVersion', 'instructionHash', 'instructionVersion', 'protocolRegistryHash', 'protocolVersion']);
});

test('v16 remains frozen historical binding and cannot certify current contract0.18', () => {
  const historicalPath = path.join(packageDirectory, 'public-instruction-package-v16.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath));
  const profile = path.resolve(path.dirname(historicalPath), historical.freeze.taskProfilePath);
  const result = artifactBinding(root, historicalPath, profile, historical);
  assert.equal(result.match, false);
  // The artifacts changed since v16 (decisions/0019-0022, #713) drift; the rest
  // of v16 still binds the current bytes, and its manifest file is unaltered.
  const drifted = result.checks.filter(check => !check.match).map(check => check.key).sort();
  assert.deepEqual(drifted, ['coreArtifactSha256', 'frameValidatorArtifactSha256', 'literalRetentionArtifactSha256', 'servedRuntimeManifestSha256', 'toolImplementationSha256']);
  const runtimeCheck = result.checks.find(check => check.key === 'servedRuntimeManifestSha256');
  assert.equal(runtimeCheck.actual, historical.freeze.servedRuntimeManifestSha256);
  assert.equal(runtimeCheck.runtime.match, false);
  const served = checkServedContract(contract, historical);
  assert.equal(served.match, false);
  assert.deepEqual(served.mismatches.sort(), ['coreContractHash', 'coreContractJsonSerializationSha256', 'coreContractVersion', 'frameRegistryHash', 'frameRegistryVersion', 'instructionHash', 'instructionVersion', 'protocolRegistryHash', 'protocolVersion']);
  assert.equal(checkServedContract(contract, pkg).match, true);
});

test('served runtime manifest detects unlisted dependency drift and rejects malformed trees', () => {
  const temp = fs.mkdtempSync(path.join(gitScratch, 'served-runtime-test-'));
  const outsideTemp = fs.mkdtempSync(path.join(gitScratch, 'served-runtime-outside-'));
  const outsideFile = path.join(outsideTemp, 'outside.js');
  const runtimeRoots = ['packages/core/dist/src', 'packages/mcp/dist/src', 'packages/mcp/dist/bin'];
  const writeRuntime = () => {
    for (const [index, runtimeRoot] of runtimeRoots.entries()) {
      const directory = path.join(temp, runtimeRoot);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `entry-${index}.js`), `export const entry${index} = ${index};\n`);
    }
  };
  try {
    writeRuntime();
    const manifest = captureServedRuntimeManifest(temp);
    assert.equal(manifest.format, 'openlunum-served-runtime-manifest/1');
    assert.deepEqual(manifest.roots, runtimeRoots);
    assert.deepEqual(manifest.artifacts.map(row => row.path), [...manifest.artifacts.map(row => row.path)].sort());
    assert.ok(manifest.artifacts.every(row => /^[a-f0-9]{64}$/u.test(row.sha256)));
    assert.deepEqual(validateServedRuntimeManifest(temp, manifest), { match: true, errors: [], artifactCount: 3 });

    // Recreate v14's selected-check mechanism with an explicitly counterfactual
    // freeze of current bytes. This is not certification of frozen v14. Named
    // checks still miss an unlisted dependency; the closed inventory rejects it.
    const counterfactualRoot = path.join(temp, 'v14-counterfactual');
    const legacyProfilePath = path.resolve(path.dirname(legacyPackagePath), legacyPkg.freeze.taskProfilePath);
    const v14Checks = artifactBinding(root, legacyPackagePath, legacyProfilePath, legacyPkg).checks
      .filter(check => check.key !== 'servedRuntimeManifestSha256');
    const counterfactualPkg = structuredClone(legacyPkg);
    for (const check of v14Checks) {
      const destination = path.join(counterfactualRoot, check.file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, check.file), destination);
      if (check.key !== 'transportValidatorDependency') counterfactualPkg.freeze[check.key] = check.actual;
    }
    const counterfactualPackagePath = path.join(counterfactualRoot, 'experiments/natural-development-v8/extraction/public-instruction-package-v14.json');
    fs.mkdirSync(path.dirname(counterfactualPackagePath), { recursive: true });
    fs.writeFileSync(counterfactualPackagePath, JSON.stringify(counterfactualPkg));
    fs.mkdirSync(path.join(counterfactualRoot, 'packages/core/node_modules/ajv'), { recursive: true });
    fs.writeFileSync(path.join(counterfactualRoot, 'packages/core/node_modules/ajv/package.json'), JSON.stringify({ name: 'ajv', version: legacyPkg.freeze.transportValidatorDependency.version }));
    for (const runtimeRoot of runtimeRoots) fs.mkdirSync(path.join(counterfactualRoot, runtimeRoot), { recursive: true });
    const counterfactualProfilePath = path.resolve(path.dirname(counterfactualPackagePath), legacyPkg.freeze.taskProfilePath);
    const oldNamedChecks = () => artifactBinding(counterfactualRoot, counterfactualPackagePath, counterfactualProfilePath, counterfactualPkg).checks
      .filter(check => check.key !== 'servedRuntimeManifestSha256');
    assert.ok(oldNamedChecks().every(check => check.match), 'v14 named checks pass before mutation');
    const counterfactualManifest = captureServedRuntimeManifest(counterfactualRoot);
    const extraDependency = path.join(counterfactualRoot, 'packages/core/dist/src/policy-dependency.js');
    fs.writeFileSync(extraDependency, 'export const policy = "changed dependency";\n');
    assert.ok(oldNamedChecks().every(check => check.match), 'v14 named checks miss the extra dependency');
    assert.equal(validateServedRuntimeManifest(counterfactualRoot, counterfactualManifest).match, false);

    const changedPath = path.join(temp, runtimeRoots[0], 'entry-0.js');
    const original = fs.readFileSync(changedPath);
    fs.writeFileSync(changedPath, 'export const entry0 = "changed";\n');
    assert.equal(validateServedRuntimeManifest(temp, manifest).match, false, 'changed JavaScript');
    fs.writeFileSync(changedPath, original);

    const addedPath = path.join(temp, runtimeRoots[1], 'added.js');
    fs.writeFileSync(addedPath, 'export {};\n');
    assert.equal(validateServedRuntimeManifest(temp, manifest).match, false, 'added JavaScript');
    fs.unlinkSync(addedPath);
    const removedPath = path.join(temp, runtimeRoots[2], 'entry-2.js');
    const removedBytes = fs.readFileSync(removedPath);
    fs.unlinkSync(removedPath);
    assert.equal(validateServedRuntimeManifest(temp, manifest).match, false, 'removed JavaScript');
    fs.writeFileSync(removedPath, removedBytes);

    for (const malformed of [
      null,
      {},
      { ...manifest, format: 'corrupt' },
      { ...manifest, artifacts: [] },
      { ...manifest, artifacts: [...manifest.artifacts, structuredClone(manifest.artifacts[0])] },
      { ...manifest, artifacts: [...manifest.artifacts, { path: '../outside.js', sha256: '0'.repeat(64) }] },
      { ...manifest, artifacts: [{ ...manifest.artifacts[0], sha256: 'not-a-hash' }, ...manifest.artifacts.slice(1)] },
      { ...manifest, roots: ['packages/core/dist/src', 'packages/mcp/dist/src'] },
      { ...manifest, roots: [...manifest.roots, 'packages/other/dist/src'] },
    ]) {
      const result = validateServedRuntimeManifest(temp, malformed);
      assert.equal(result.match, false, JSON.stringify(malformed));
      assert.ok(result.errors.length > 0);
    }

    // Declaration metadata is deliberately outside the executable manifest.
    fs.writeFileSync(path.join(temp, runtimeRoots[0], 'types.d.ts'), 'export type Policy = string;\n');
    assert.equal(validateServedRuntimeManifest(temp, manifest).match, true, 'metadata-only declaration change');

    fs.writeFileSync(outsideFile, 'export const escaped = true;\n');
    const symlinkPath = path.join(temp, runtimeRoots[0], 'escaped.js');
    fs.symlinkSync(outsideFile, symlinkPath);
    assert.equal(validateServedRuntimeManifest(temp, manifest).match, false, 'symlink artifact escaping runtime root');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(outsideTemp, { recursive: true, force: true });
  }
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

test('final status: last JSON line wins over leading prose; conflicting declarations are refused', async () => {
  const { parseFinalStatus } = await import('./source-only-run-gates.mjs');
  assert.deepEqual(parseFinalStatus('{"status":"parse"}'), { status: 'parse' });
  assert.deepEqual(parseFinalStatus('Submission succeeded with a valid candidate.\n\n{"status":"parse"}'), { status: 'parse' });
  assert.deepEqual(parseFinalStatus('No predicate fits.\n{"status":"abstain","reason":"unsupported"}'), { status: 'abstain', reason: 'unsupported' });
  assert.equal(parseFinalStatus('{"status":"parse"}\n{"status":"abstain","reason":"ambiguous"}'), null);
  assert.equal(parseFinalStatus('{"status":"parse"} and done'), null);
  assert.equal(parseFinalStatus('{"status":"parse"}\nthat is all'), null);
  assert.equal(parseFinalStatus('{"status":"maybe"}'), null);
  assert.equal(parseFinalStatus(''), null);
  assert.equal(parseFinalStatus(undefined), null);
});
