// Provider-specific evaluation gates. No semantic-core changes or provider calls.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { stableStringify } from '../../packages/core/dist/src/index.js';
import { observedExtractionContracts } from './replay-client-events.mjs';

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = value => /^[a-f0-9]{64}$/u.test(value ?? '');
const artifacts = {
  coreArtifactSha256: 'packages/core/dist/src/agent-native.js',
  frameValidatorArtifactSha256: 'packages/core/dist/src/frame-registry.js',
  toolImplementationSha256: 'packages/mcp/dist/src/tools.js',
  mcpArtifactSha256: 'packages/mcp/dist/bin/lunum-mcp.js',
  literalRetentionArtifactSha256: 'packages/core/dist/src/literal-retention.js',
  builderArtifactSha256: 'packages/core/dist/src/agent-builder.js',
  transportValidatorArtifactSha256: 'packages/core/dist/src/semantic-transport.js',
  transportSchemaArtifactSha256: 'packages/core/dist/src/semantic-transport-schema.js',
  launcherSha256: 'scripts/lunum-mcp-launch.mjs',
};
export const SERVED_RUNTIME_ROOTS = Object.freeze([
  'packages/core/dist/src', 'packages/mcp/dist/src', 'packages/mcp/dist/bin',
]);

/** Closed inventory of repository-owned executable artifacts, not host attestation. */
export function captureServedRuntimeManifest(root) {
  root = fs.realpathSync(root);
  const records = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('served_runtime_symlink');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.js')) records.push({ path: path.relative(root, inside(root, file)).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(file)) });
    }
  };
  for (const relative of SERVED_RUNTIME_ROOTS) {
    const directory = path.join(root, relative);
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('served_runtime_root_invalid');
    const before = records.length;
    visit(inside(root, directory));
    if (records.length === before) throw new Error('served_runtime_root_empty');
  }
  records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { format: 'openlunum-served-runtime-manifest/1', roots: [...SERVED_RUNTIME_ROOTS], artifacts: records };
}

export function validateServedRuntimeManifest(root, manifest) {
  try {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
        Object.keys(manifest).sort().join(',') !== 'artifacts,format,roots' ||
        manifest.format !== 'openlunum-served-runtime-manifest/1' ||
        !Array.isArray(manifest.roots) || JSON.stringify(manifest.roots) !== JSON.stringify(SERVED_RUNTIME_ROOTS) ||
        !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('served_runtime_manifest_invalid');
    const entries = new Map();
    for (const row of manifest.artifacts) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'path,sha256' ||
          typeof row.path !== 'string' || !row.path.endsWith('.js') || !hash(row.sha256) ||
          !SERVED_RUNTIME_ROOTS.some(prefix => row.path.startsWith(`${prefix}/`)) ||
          row.path.split('/').some(part => !part || part === '.' || part === '..') || row.path.includes('\\') ||
          entries.has(row.path)) throw new Error('served_runtime_manifest_artifact_invalid');
      entries.set(row.path, row.sha256);
    }
    const current = captureServedRuntimeManifest(root);
    const errors = [];
    for (const row of current.artifacts) {
      if (!entries.has(row.path)) errors.push(`served_runtime_unlisted:${row.path}`);
      else if (entries.get(row.path) !== row.sha256) errors.push(`served_runtime_changed:${row.path}`);
      entries.delete(row.path);
    }
    for (const relative of entries.keys()) errors.push(`served_runtime_missing:${relative}`);
    return { match: errors.length === 0, errors, artifactCount: current.artifacts.length };
  } catch (error) {
    return { match: false, errors: [error.message], artifactCount: 0 };
  }
}

function inside(root, file) {
  const resolved = path.resolve(file);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('binding_outside_repository');
  // Existing inputs must not reach another checkout through symlinks either.
  const real = fs.realpathSync(resolved);
  if (!real.startsWith(`${fs.realpathSync(root)}${path.sep}`)) throw new Error('binding_outside_repository');
  return resolved;
}

export function artifactBinding(root, packagePath, profilePath, pkg) {
  const freeze = pkg.freeze ?? {};
  const directory = path.dirname(packagePath);
  const files = { ...artifacts,
    taskContractSha256: path.resolve(directory, freeze.taskContractPath ?? 'MISSING'),
    scorerSha256: path.resolve(directory, freeze.scorerPath ?? 'MISSING'),
    taskProfileSha256: profilePath,
    servedRuntimeManifestSha256: path.resolve(directory, freeze.servedRuntimeManifestPath ?? 'MISSING'),
  };
  const contractHashes = new Set(['coreContractJsonSerializationSha256']);
  for (const key of Object.keys(freeze)) {
    if (key.endsWith('Sha256') && !Object.hasOwn(files, key) && !contractHashes.has(key)) throw new Error(`unhandled_freeze_binding:${key}`);
  }
  const checks = Object.entries(files).map(([key, file]) => {
    const expected = freeze[key] ?? null;
    let actual = null;
    try { actual = sha256(fs.readFileSync(inside(root, path.resolve(root, file)))); } catch { /* missing or outside is a failure */ }
    const check = { key, file: path.relative(root, file.startsWith('/') ? file : path.join(root, file)), expected, actual, match: hash(expected) && actual === expected };
    if (key === 'servedRuntimeManifestSha256') {
      let runtime;
      try { runtime = validateServedRuntimeManifest(root, JSON.parse(fs.readFileSync(inside(root, path.resolve(root, file)), 'utf8'))); }
      catch (error) { runtime = { match: false, errors: [error.message], artifactCount: 0 }; }
      check.match &&= runtime.match;
      check.runtime = runtime;
    }
    return check;
  });
  const dependency = freeze.transportValidatorDependency;
  let installedVersion = null;
  let lockfileHash = null;
  try {
    const require = createRequire(path.join(root, 'packages/core/package.json'));
    installedVersion = require('ajv/package.json').version;
    lockfileHash = sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml')));
  } catch { /* fail closed */ }
  checks.push({ key: 'transportValidatorDependency', file: 'pnpm-lock.yaml', expected: dependency ?? null,
    actual: { name: 'ajv', version: installedVersion, lockfileSha256: lockfileHash },
    match: dependency?.name === 'ajv' && dependency.version === installedVersion && hash(dependency.lockfileSha256) && dependency.lockfileSha256 === lockfileHash });
  return { match: checks.every(check => check.match), checks };
}

export function checkServedContract(contract, pkg) {
  if (!contract) return { match: false, mismatches: ['missing_contract'] };
  const f = pkg.freeze ?? {};
  const values = {
    coreContractVersion: contract.contractVersion,
    coreContractHash: sha256(stableStringify(contract)),
    coreContractJsonSerializationSha256: sha256(JSON.stringify(contract)),
    instructionVersion: contract.instructions?.version,
    instructionHash: contract.instructions?.hash,
    schemaHash: contract.transport?.schemaHash,
    frameRegistryVersion: contract.frames?.version,
    frameRegistryHash: contract.frames?.registryHash,
    protocolVersion: contract.protocol?.version,
    protocolRegistryHash: contract.protocol?.registryHash,
  };
  const mismatches = Object.entries(values).filter(([key, value]) => !f[key] || f[key] !== value).map(([key]) => key);
  return { match: mismatches.length === 0, mismatches };
}

export function checkObservedContracts(events, pkg) {
  try {
    const observed = observedExtractionContracts(events);
    if (!observed.length) return { match: false, mismatches: ['missing_contract'] };
    const checks = observed.map(row => checkServedContract(row.contract, pkg));
    return { match: checks.every(check => check.match), mismatches: checks.flatMap(check => check.mismatches) };
  } catch (error) { return { match: false, mismatches: [error.message] }; }
}

function cents(value, name) {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(String(value ?? ''))) throw new Error(`explicit_positive_${name}_required`);
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`explicit_positive_${name}_required`);
  return n;
}

export function budgetPlan({ model, totalUsd, itemUsd, timeoutMs, count, concurrency }) {
  if (typeof model !== 'string' || !/^claude-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(model) || /(?:^|-)(latest|default|auto)(?:-|$)/u.test(model)) throw new Error('explicit_resolved_model_required');
  const total = cents(totalUsd, 'total_budget');
  const item = cents(itemUsd, 'item_budget');
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('nonempty_population_required');
  if (concurrency !== 1) throw new Error('bounded_runner_requires_serial_concurrency');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new Error('timeout_between_1000_and_900000_required');
  if (item * count > total) throw new Error('reserved_item_budgets_exceed_total');
  return { model, totalUsd: total / 100, itemUsd: item / 100, timeoutMs, count, concurrency,
    requestedReservationUsd: item * count / 100,
    enforcement: 'Serial launches; CLI requested per-item ceilings reserved in advance. Billing is provider-controlled, not a hard financial guarantee; unknown or over-ceiling reported cost stops remaining launches and invalidates evidence.' };
}

export function validateRequests(requests, pkg) {
  const handles = new Set();
  const allowed = new Set(['handle', 'sourceText', 'sourceLanguage', 'sourceSha256', 'contractHash']);
  for (const row of requests) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(row.handle ?? '') || handles.has(row.handle)) throw new Error('invalid_or_duplicate_handle');
    handles.add(row.handle);
    if (Object.keys(row).some(key => !allowed.has(key))) throw new Error(`source_only_input_leakage:${row.handle}`);
    if (typeof row.sourceText !== 'string' || !row.sourceText.trim() || typeof row.sourceLanguage !== 'string' || !row.sourceLanguage.trim()
      || sha256(row.sourceText) !== row.sourceSha256) throw new Error(`source_binding_invalid:${row.handle}`);
    if (row.contractHash !== pkg.freeze?.coreContractHash) throw new Error(`request_contract_mismatch:${row.handle}`);
  }
}

/** Validate public event pairing and source binding, not whether a Sem is correct. */
export function checkSessionIntegrity(events, request) {
  const failures = [];
  const calls = new Map(); let receivedContract = false; let init = 0; let result = 0; let terminal = false;
  const allowed = new Set(['lunum_get_extraction_contract', 'lunum_build_candidate', 'lunum_submit_candidate', 'lunum_validate'].map(name => `mcp__lunum__${name}`));
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || event.type === 'invalid_provider_json') { failures.push('MALFORMED_PROVIDER_EVENT'); continue; }
    if (terminal) failures.push('EVENT_AFTER_TERMINAL_RESULT');
    if (event.type === 'system' && event.subtype === 'init') init += 1;
    if (event.type === 'result') { result += 1; terminal = true; }
    if (event.message?.content !== undefined && !Array.isArray(event.message.content)) { failures.push('MALFORMED_MESSAGE_CONTENT'); continue; }
    for (const block of event.message?.content ?? []) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) { failures.push('MALFORMED_MESSAGE_BLOCK'); continue; }
      if (block.type === 'tool_use') {
        if (!block.id || calls.has(block.id) || !allowed.has(block.name) || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) { failures.push('MALFORMED_OR_DUPLICATE_TOOL_USE'); continue; }
        if (block.name !== 'mcp__lunum__lunum_get_extraction_contract' && !receivedContract) failures.push('EXTRACTION_BEFORE_CONTRACT');
        if (block.name === 'mcp__lunum__lunum_submit_candidate' && (block.input.sourceText !== request.sourceText || block.input.sourceLanguage !== request.sourceLanguage)) failures.push('SUBMITTED_SOURCE_MISMATCH');
        calls.set(block.id, { name: block.name, completed: false });
      } else if (block.type === 'tool_result') {
        const call = calls.get(block.tool_use_id);
        if (!call || call.completed) { failures.push('UNPAIRED_OR_DUPLICATE_TOOL_RESULT'); continue; }
        call.completed = true;
        if (Array.isArray(block.content) && block.content.some(part => !part || typeof part.text !== 'string')) { failures.push('MALFORMED_TOOL_RESPONSE'); continue; }
        const text = Array.isArray(block.content) ? block.content.map(part => part.text).join('') : String(block.content ?? '');
        let value; try { value = JSON.parse(text); } catch { failures.push('MALFORMED_TOOL_RESPONSE'); continue; }
        if (typeof value?.success !== 'boolean') failures.push('MALFORMED_TOOL_RESPONSE');
        if (value?.success === false && typeof value.error !== 'string') failures.push('MALFORMED_TOOL_RESPONSE');
        if (value?.success === true) {
          if (call.name === 'mcp__lunum__lunum_get_extraction_contract' && !value.contract) failures.push('MALFORMED_TOOL_RESPONSE');
          if (call.name === 'mcp__lunum__lunum_build_candidate' && (!value.candidate || typeof value.candidate.schema !== 'string' || !Array.isArray(value.candidate.clauses))) failures.push('MALFORMED_TOOL_RESPONSE');
          if (call.name === 'mcp__lunum__lunum_validate' && (typeof value.valid !== 'boolean' || !Array.isArray(value.errors))) failures.push('MALFORMED_TOOL_RESPONSE');
          if (call.name === 'mcp__lunum__lunum_submit_candidate') {
            const s = value.submission;
            if (!s || typeof s.candidateIdentityAvailable !== 'boolean' || !Object.hasOwn(s, 'sem') || (s.sem !== null && (typeof s.sem !== 'object' || Array.isArray(s.sem)))) failures.push('MALFORMED_TOOL_RESPONSE');
            if (s?.source?.text !== request.sourceText || s?.source?.language !== request.sourceLanguage) failures.push('RETURNED_SOURCE_MISMATCH');
          }
        }
        // A paired semantic validation rejection is an observed model failure,
        // not corrupt provenance. Retrying it is part of the unchanged prompt.
        if (call.name === 'mcp__lunum__lunum_get_extraction_contract' && !block.is_error && value.success === true && value.contract) receivedContract = true;
      }
    }
  }
  if (init !== 1 || result !== 1) failures.push('INIT_OR_RESULT_EVENT_COUNT');
  if ([...calls.values()].some(call => !call.completed)) failures.push('UNFINISHED_TOOL_CALL');
  return { match: failures.length === 0, mismatches: [...new Set(failures)] };
}

export function evidenceFailures(row, pkg, model, plan) {
  const failures = [];
  if (row.timedOut) failures.push('TIMEOUT');
  if (row.interrupted) failures.push('INTERRUPTED');
  if (row.failure) failures.push(row.failure);
  if (row.exitCode !== 0) failures.push('PROCESS_ERROR');
  if (!row.observedContractBinding?.match) failures.push('CONTRACT_UNBOUND');
  if (!row.sessionIntegrity?.match) failures.push('EVENT_OR_SOURCE_UNBOUND');
  if (row.model?.initModel !== model || !row.model?.reported?.length || row.model.reported.some(id => id !== model)) failures.push('MODEL_UNVERIFIED');
  if (!Number.isFinite(row.costUsd) || row.costUsd < 0) failures.push('COST_UNKNOWN');
  else if (row.costUsd > plan.itemUsd + 0.000001) failures.push('ITEM_BUDGET_EXCEEDED');
  if (!['parse', 'abstain'].includes(row.status)) failures.push('OUTCOME_MISSING');
  return [...new Set(failures)];
}

/**
 * The declared final status of a source-only session. The prompt asks the
 * model to end with one JSON status line; models often put a sentence of prose
 * before it. Accept the LAST non-empty line as the status, but refuse the
 * result when any earlier line also parses as a status object (two
 * declarations are a conflict, not a choice). Returns null when unparseable.
 */
export function parseFinalStatus(text) {
  const lines = String(text ?? '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
  const asStatus = (line) => {
    try { const value = JSON.parse(line); return value && typeof value === 'object' && !Array.isArray(value) && ['parse', 'abstain'].includes(value.status) ? value : null; } catch { return null; }
  };
  const last = lines.length ? asStatus(lines.at(-1)) : null;
  if (!last) return null;
  if (lines.slice(0, -1).some((line) => asStatus(line))) return null;
  return last;
}

export function contradictoryAbstention(status, submissions) {
  if (status !== 'abstain') return false;
  const canonical = submissions.filter(call => !call.isError && call.result?.success === true && call.input?.candidateSem != null && call.result?.submission?.candidateIdentityAvailable === true);
  return canonical.length > 0 && submissions.at(-1)?.input?.candidateSem !== null;
}

/** Durable, bounded subprocess collector. Only a process group launched here is killed. */
export function runCaptured({ executable, args, cwd, stdoutPath, stderrPath, timeoutMs, onCheckpoint = () => {}, publicJsonEvents = false }) {
  return new Promise((resolve, reject) => {
    const out = fs.openSync(stdoutPath, 'wx');
    let err;
    try { err = fs.openSync(stderrPath, 'wx'); } catch (error) { fs.closeSync(out); reject(error); return; }
    let child;
    let stdout = ''; let stderr = ''; let pending = ''; let stdoutBytes = 0; let stderrBytes = 0; let timedOut = false; let interrupted = false; let launchError = null;
    try { child = spawn(executable, args, { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { fs.closeSync(out); fs.closeSync(err); reject(error); return; }
    const stop = signal => {
      if (!child.pid) return;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') launchError = error.message; }
    };
    let killTimer;
    const terminate = () => { stop('SIGTERM'); killTimer ??= setTimeout(() => stop('SIGKILL'), 1000); };
    const interrupt = () => { interrupted = true; terminate(); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const persist = value => {
      const bytes = Buffer.byteLength(value);
      if (stdoutBytes + bytes > 64 * 1024 * 1024) { launchError = 'provider_stream_size_limit'; terminate(); return; }
      fs.writeSync(out, value); fs.fsyncSync(out); stdoutBytes += bytes; stdout += value; onCheckpoint();
    };
    const publicLine = line => {
      let event;
      try { event = JSON.parse(line); } catch { return JSON.stringify({ type: 'invalid_provider_json', sha256: sha256(line), bytes: Buffer.byteLength(line) }) + '\n'; }
      let redacted = false;
      const clean = value => {
        if (Array.isArray(value)) return value.filter(item => {
          if (['thinking', 'redacted_thinking', 'reasoning'].includes(item?.type)) { redacted = true; return false; }
          return true;
        }).map(clean);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => {
          if (['thinking', 'reasoning', 'reasoning_content', 'chain_of_thought'].includes(key)) { redacted = true; return false; }
          return true;
        }).map(([key, item]) => [key, clean(item)]));
      };
      if (!event || typeof event !== 'object' || Array.isArray(event)) return JSON.stringify({ type: 'invalid_provider_json', sha256: sha256(line), bytes: Buffer.byteLength(line) }) + '\n';
      const result = clean(event);
      if (redacted) result.providerReasoningRemoved = true;
      return JSON.stringify(result) + '\n';
    };
    child.stdout.on('data', chunk => {
      if (!publicJsonEvents) { persist(chunk); return; }
      if (launchError?.includes('size_limit')) return;
      if (Buffer.byteLength(pending) + Buffer.byteLength(chunk) > 8 * 1024 * 1024) { launchError = 'provider_stream_size_limit'; pending = ''; terminate(); return; }
      pending += chunk;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) if (line.trim()) persist(publicLine(line));
    });
    child.stderr.on('data', chunk => {
      const bytes = Buffer.byteLength(chunk);
      if (stderrBytes + bytes > 8 * 1024 * 1024) { launchError = 'provider_stderr_size_limit'; terminate(); return; }
      fs.writeSync(err, chunk); fs.fsyncSync(err); stderrBytes += bytes; stderr += chunk;
    });
    child.on('error', error => { launchError = error.message; });
    child.on('close', (exitCode, signal) => {
      if (publicJsonEvents && pending.trim()) persist(publicLine(pending));
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
      clearTimeout(timer); clearTimeout(killTimer); fs.closeSync(out); fs.closeSync(err);
      resolve({ stdout, stderr, exitCode, signal, timedOut, interrupted, launchError });
    });
  });
}
