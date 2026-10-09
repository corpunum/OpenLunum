#!/usr/bin/env node
// Live source-only extraction through Claude Code and the Lunum MCP server.
//
// Each request gets a fresh `claude -p` process in an empty temporary
// directory: no repository files, no built-in tools (Read/Bash/etc. are
// disabled), and only the contract/build/submit/validate MCP tools. The
// extractor sees the opaque handle, source text/language, the public task
// profile and the public conventions -- never targets, groups or reviews.
//
// The ledger records the candidate from the last *successful*
// lunum_submit_candidate call as observed in the raw stream, not what the
// model claims in prose. Raw streams are persisted per item.
//
// See scripts/research/SOURCE_ONLY_RUNNER.md for explicit budgets and preflight.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { artifactBinding as bindArtifacts, checkServedContract, checkObservedContracts, checkSessionIntegrity, contradictoryAbstention, budgetPlan, validateRequests, evidenceFailures, runCaptured, parseFinalStatus } from './source-only-run-gates.mjs';
import { replaySession, parseJsonLines } from './replay-client-events.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V8 = path.join(root, 'experiments/natural-development-v8');
const ALLOWED_TOOLS = ['lunum_get_extraction_contract', 'lunum_build_candidate', 'lunum_submit_candidate', 'lunum_validate'].map((name) => `mcp__lunum__${name}`);

export async function main(args = process.argv.slice(2)) {
const flag = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const outDir = path.resolve(args[0] ?? '');
if (!args[0] || args[0].startsWith('--')) throw new Error('usage: runner <new-outDir> --preflight-only OR --requests f --model exact-id --total-budget-usd N --item-budget-usd N --timeout-ms N; replay: --rederive --from oldDir');
const model = flag('model', null);
const concurrency = Number(flag('concurrency', '1'));
const limit = Number(flag('limit', '0'));
const rederive = args.includes('--rederive');
const preflightOnly = args.includes('--preflight-only');
if (args.includes('--allow-unbound')) throw new Error('unbound_live_evidence_not_allowed');
if (!rederive && !preflightOnly && !flag('requests', null)) throw new Error('explicit_source_requests_required');
if (!rederive && !preflightOnly && !flag('package', null)) throw new Error('explicit_public_package_required');
if (rederive && (!flag('from', null) || path.resolve(flag('from')) === outDir)) throw new Error('rederive_requires_distinct_from_directory');
// Historical replays keep historical inputs; live/preflight selects the frozen v20 profile.
const REQUESTS = path.resolve(root, flag('requests', path.join(V8, 'extraction/source-only-request.jsonl')));
const PACKAGE = path.resolve(root, flag('package', path.join(V8, `extraction/public-instruction-package-${rederive ? 'v3' : 'v20'}.json`)));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requests = fs.readFileSync(REQUESTS, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
const PROFILE = path.resolve(root, flag('profile', rederive ? path.join(V8, 'extraction/public-task-profile-iteration2.json') : path.resolve(path.dirname(PACKAGE), pkg.freeze.taskProfilePath)));
const profileText = fs.readFileSync(PROFILE, 'utf8');
if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('invalid_limit');
const selected = limit > 0 ? requests.slice(0, limit) : requests;
const plan = rederive || preflightOnly ? null : budgetPlan({ model, totalUsd: flag('total-budget-usd'), itemUsd: flag('item-budget-usd'), timeoutMs: Number(flag('timeout-ms')), count: selected.length, concurrency });
if (!rederive && !preflightOnly) validateRequests(requests, pkg);

// Record source state before any model call; the tree may change later.
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const gitDirtyAtStart = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '';
if (!rederive && !preflightOnly && gitDirtyAtStart) throw new Error('live_run_requires_frozen_clean_checkout');
const claudeVersionResult = rederive || preflightOnly ? null : spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 10000 });
if (claudeVersionResult && (claudeVersionResult.status !== 0 || !claudeVersionResult.stdout.trim())) throw new Error('client_version_unverified');
const startedAt = new Date().toISOString();

// Build once so parallel launches do not race on dist/.
if (!rederive) {
  const build = spawnSync('pnpm', ['--filter', '@corpunum/lunum-mcp...', 'build'], { cwd: root, stdio: ['ignore', process.stderr, process.stderr] });
  if (build.status !== 0) process.exit(1);
}

// Served-artifact binding: the dist files the MCP server will load must match
// the package freeze, checked before the run and again after it. dist/ is
// untracked, so the git clean-tree check cannot see it.
const artifactBinding = () => bindArtifacts(root, PACKAGE, PROFILE, pkg);
const bindingAtStart = rederive ? null : artifactBinding();
if (bindingAtStart && !bindingAtStart.match) {
  console.error(`served artifacts do not match ${path.basename(PACKAGE)}: ${bindingAtStart.checks.filter((check) => !check.match).map((check) => check.file).join(', ')}`);
  process.exit(3);
}

fs.mkdirSync(outDir); // Exclusive fresh output: never re-label or overwrite a recorded run.
fs.mkdirSync(path.join(outDir, 'raw'));
const mcpConfigPath = path.join(outDir, 'mcp-config.json');
fs.writeFileSync(mcpConfigPath, `${JSON.stringify({ mcpServers: { lunum: { command: 'node', args: [path.join(root, 'scripts/lunum-mcp-launch.mjs')], env: { LUNUM_MCP_SKIP_BUILD: '1', LUNUM_COMPACTION: 'off', LUNUM_MULTILINGUAL: 'on', LUNUM_CONTEXT_MODE: 'mixed' } } } }, null, 2)}\n`);

let preflight = null;
if (!rederive) {
  const require = createRequire(path.join(root, 'packages/mcp/package.json'));
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
  const client = new Client({ name: 'openlunum-source-only-preflight', version: '0.2' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'scripts/lunum-mcp-launch.mjs')], env: { ...process.env, LUNUM_MCP_SKIP_BUILD: '1', LUNUM_COMPACTION: 'off' }, stderr: 'inherit' });
  try {
    await client.connect(transport, { timeout: 10000 });
    const request = { name: 'lunum_get_extraction_contract', arguments: {} };
    const response = await client.callTool(request, undefined, { timeout: 10000 });
    const result = JSON.parse(response.content?.find(part => part.type === 'text')?.text ?? 'null');
    const binding = checkServedContract(result?.success === true ? result.contract : null, pkg);
    preflight = { request, response, binding, startedAt, codeCommit: gitHead, workingTreeClean: !gitDirtyAtStart, providerCalls: 0,
      runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), gateSha256: sha256(fs.readFileSync(path.join(root, 'scripts/research/source-only-run-gates.mjs'))), artifactBinding: bindingAtStart };
    fs.writeFileSync(path.join(outDir, 'preflight.json'), JSON.stringify(preflight, null, 2) + '\n', { flag: 'wx' });
    if (!binding.match) throw new Error(`served_contract_preflight_mismatch:${binding.mismatches.join(',')}`);
  } finally { await client.close(); }
  if (preflightOnly) { console.log(JSON.stringify({ providerCalls: 0, artifactBinding: bindingAtStart.match, servedContract: preflight.binding.match })); return; }
}

function prompt(request) {
  return [
    'You are a source-only semantic extractor for OpenLunum. You have only the Lunum MCP tools.',
    '',
    'Steps:',
    '1. Call lunum_get_extraction_contract once.',
    '2. Decide whether the source sentence below is answerable under the contract and the task profile.',
    '3. If answerable: call lunum_build_candidate with world, kind, predicate and roles (nested conditions/consequences as the profile says), then call lunum_submit_candidate with sourceText, sourceLanguage, the returned candidate as candidateSem, and provenance {"extractorType":"agent"}. If a tool returns an error, fix the arguments and retry (at most 3 attempts per tool).',
    '4. If the meaning is unsupported, ambiguous, or missing a required frame argument: do not submit; abstain.',
    '5. End with exactly one line of JSON and nothing else: {"status":"parse"} or {"status":"abstain","reason":"unsupported|ambiguous|unresolved"}.',
    '',
    'Use only evidence visible in the source. Do not invent identifiers.',
    '',
    `Public conventions (${path.basename(PACKAGE)}):`,
    JSON.stringify(pkg.conventions, null, 2),
    '',
    'Public task profile:',
    profileText,
    '',
    'Item:',
    JSON.stringify({ handle: request.handle, sourceLanguage: request.sourceLanguage, sourceText: request.sourceText }),
  ].join('\n');
}

function toolUses(events) {
  // Pair assistant tool_use blocks with their tool_result by id.
  const calls = new Map();
  for (const event of events) {
    for (const block of event?.message?.content ?? []) {
      if (block?.type === 'tool_use') calls.set(block.id, { name: block.name, input: block.input, result: null, isError: null });
      if (block?.type === 'tool_result' && calls.has(block.tool_use_id)) {
        const text = Array.isArray(block.content) ? block.content.map((part) => part?.text ?? '').join('') : String(block.content ?? '');
        let parsed = null; try { parsed = JSON.parse(text); } catch { /* keep raw */ }
        Object.assign(calls.get(block.tool_use_id), { result: parsed ?? text, isError: Boolean(block.is_error) });
      }
    }
  }
  return [...calls.values()];
}

// Live and rederive read the same way: the last line is the status and no
// earlier line may declare a second one (see parseFinalStatus).
const finalStatus = parseFinalStatus;

async function runOne(request) {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-extract-'));
    const cli = ['-p', prompt(request), '--model', model, '--output-format', 'stream-json', '--verbose',
      '--strict-mcp-config', '--mcp-config', mcpConfigPath, '--tools', '', '--allowedTools', ...ALLOWED_TOOLS,
      '--permission-mode', 'dontAsk', '--no-session-persistence', '--max-budget-usd', String(plan.itemUsd)];
    fs.writeFileSync(path.join(outDir, 'raw', `${request.handle}.request.json`), JSON.stringify({ request, prompt: prompt(request), promptSha256: sha256(prompt(request)), model, clientVersion: claudeVersionResult.stdout.trim(), itemBudgetUsd: plan.itemUsd, timeoutMs: plan.timeoutMs }, null, 2) + '\n', { flag: 'wx' });
    try {
      const captured = await runCaptured({ executable: 'claude', args: cli, cwd: workdir, stdoutPath: path.join(outDir, 'raw', `${request.handle}.jsonl`), stderrPath: path.join(outDir, 'raw', `${request.handle}.stderr`), timeoutMs: plan.timeoutMs, publicJsonEvents: true });
      let row;
      try { row = classify(request, captured.stdout, captured.exitCode, captured.stderr); }
      catch (error) {
        const events = parseJsonLines(captured.stdout).events;
        const result = events.findLast(event => event?.type === 'result');
        const init = events.find(event => event?.type === 'system' && event?.subtype === 'init');
        row = { handle: request.handle, sourceLanguage: request.sourceLanguage, status: null, exitCode: captured.exitCode,
          failure: 'CLASSIFICATION_ERROR', classificationError: error.message, observedContractBinding: { match: false }, sessionIntegrity: { match: false },
          model: { requested: model, initModel: init?.model ?? null, reported: Object.keys(result?.modelUsage ?? {}) }, costUsd: result?.total_cost_usd ?? null,
          calls: [], rawStream: `raw/${request.handle}.jsonl`, rawStreamSha256: sha256(captured.stdout) };
      }
      row.timedOut = captured.timedOut; row.interrupted = captured.interrupted; row.signal = captured.signal;
      if (captured.launchError) row.failure = captured.launchError;
      row.evidenceFailures = evidenceFailures(row, pkg, model, plan);
      row.evidenceValid = row.evidenceFailures.length === 0;
      return row;
    } finally { fs.rmSync(workdir, { recursive: true, force: true }); }
}

function classify(request, stdout, code, stderr) {
      const rawPath = path.join(rederive ? path.resolve(flag('from')) : outDir, 'raw', `${request.handle}.jsonl`);
      const parsed = parseJsonLines(stdout);
      const events = parsed.events;
      const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
      const result = events.findLast((event) => event.type === 'result');
      const calls = toolUses(events);
      const contractCall = calls.find((call) => call.name === 'mcp__lunum__lunum_get_extraction_contract' && call.result?.contract);
      const observedContractVersion = contractCall?.result?.contract?.contractVersion ?? null;
      const submits = calls.filter((call) => call.name === 'mcp__lunum__lunum_submit_candidate');
      // A submit with candidateSem null is core's explicit abstention, not a parse.
      const succeeded = submits.filter((call) => !call.isError && call.result?.success === true);
      const accepted = succeeded.filter((call) => call.input?.candidateSem != null);
      const declared = finalStatus(result?.result);
      const lastAccepted = accepted.at(-1) ?? null;
      let status; let candidateSem; let failure = null;
      if (declared?.status === 'abstain' && (!rederive || !lastAccepted)) { status = 'abstain'; candidateSem = null; }
      else if (declared?.status === 'parse' && lastAccepted) { status = 'parse'; candidateSem = lastAccepted.input.candidateSem; }
      else { status = null; candidateSem = undefined; failure = !result ? 'no_result_event' : !declared ? 'unparseable_final_status' : declared.status === 'parse' ? 'parse_claimed_without_accepted_submission' : 'abstain_after_accepted_submission'; }
      const replay = replaySession(events, request);
      if (!rederive) {
        if (parsed.diagnostics.length || events.some(event => event.type === 'invalid_provider_json')) failure = 'INVALID_PROVIDER_EVENT_STREAM';
        else if (result?.is_error) failure = 'PROVIDER_ERROR';
        else if (replay.duplicateOrConflictingEvents.length) failure = 'CONFLICTING_TOOL_EVENTS';
        else if (replay.submissionAttempts.some(attempt => attempt.sourceText !== request.sourceText)) failure = 'SUBMITTED_SOURCE_MISMATCH';
        else if (status === 'parse' && JSON.stringify(replay.proposedCandidateSem) !== JSON.stringify(candidateSem)) failure = 'FINAL_SUBMISSION_MISMATCH';
        else if (contradictoryAbstention(status, submits)) failure = 'ABSTAIN_AFTER_CANONICAL_SUBMISSION';
      }
      return {
        handle: request.handle, sourceLanguage: request.sourceLanguage, exitCode: code, failure,
        observedContractVersion, observedContractMatchesPackage: observedContractVersion === null ? null : observedContractVersion === pkg.freeze.coreContractVersion,
        observedContractBinding: checkObservedContracts(events, pkg),
        sessionIntegrity: checkSessionIntegrity(events, request),
        status, candidateSem, declared,
        submissionAttempts: replay.submissionAttempts,
        model: { requested: model, reported: Object.keys(result?.modelUsage ?? {}), initModel: init?.model ?? null },
        mcpServers: init?.mcp_servers ?? null, toolsOffered: init?.tools ?? null,
        calls: calls.map((call) => ({ name: call.name.replace('mcp__lunum__', ''), isError: call.isError, error: call.isError || call.result?.success === false ? (call.result?.error ?? call.result) : undefined })),
        usage: result?.usage ?? null, costUsd: result?.total_cost_usd ?? null, numTurns: result?.num_turns ?? null,
        abstentionSubmitted: succeeded.some((call) => call.input?.candidateSem == null),
        // What core concluded about the last non-null submission, accepted or not.
        lastSubmission: (() => { const last = submits.filter((call) => call.input?.candidateSem != null).at(-1); const sub = last?.result?.submission; return sub ? { frameValid: sub.frameValid, candidateIdentityAvailable: sub.candidateIdentityAvailable, failureClass: sub.failureClass, diagnostics: sub.diagnostics } : null; })(),
        rawStream: path.relative(outDir, rawPath), rawStreamSha256: sha256(stdout), stderrTail: stderr?.slice(-500) || undefined,
      };
}

const rows = new Array(selected.length);
const checkpoint = (status = 'INCOMPLETE') => {
  const temp = path.join(outDir, 'checkpoint.json.tmp');
  const fd = fs.openSync(temp, 'w');
  try { fs.writeSync(fd, JSON.stringify({ status, startedAt, selected: selected.map(row => row.handle), completed: rows.filter(Boolean), requestedBudget: plan }, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, path.join(outDir, 'checkpoint.json'));
};
checkpoint();
let next = 0;
await Promise.all(Array.from({ length: rederive ? 1 : Math.min(concurrency, selected.length) }, async () => {
  while (next < selected.length) {
    const index = next++;
    rows[index] = rederive
      ? classify(selected[index], fs.readFileSync(path.join(path.resolve(flag('from')), 'raw', `${selected[index].handle}.jsonl`), 'utf8'), null, null)
      : await runOne(selected[index]);
    const row = rows[index];
    console.error(`${row.handle} ${row.sourceLanguage} -> ${row.status ?? `FAILED(${row.failure})`} calls=${row.calls.map((c) => `${c.name}${c.isError ? '!' : ''}`).join(',')} $${row.costUsd}`);
    fs.writeFileSync(path.join(outDir, 'raw', `${row.handle}.checkpoint.json`), JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
    checkpoint();
    if (!rederive && !row.evidenceValid) break; // Unknown execution/cost cannot authorize another paid launch.
  }
}));

// Scorer-compatible ledger: only rows with an observed outcome. Failed rows
// stay in the raw run ledger and are reported as missing by the scorer.
const requestByHandle = new Map(requests.map((request) => [request.handle, request]));
const completed = rows.filter(Boolean);
const ledger = completed.filter((row) => row.status && (rederive || row.evidenceValid)).map((row) => ({
  handle: row.handle, sourceSha256: requestByHandle.get(row.handle).sourceSha256, contractHash: requestByHandle.get(row.handle).contractHash ?? pkg.freeze.coreContractHash,
  status: row.status, candidateSem: row.candidateSem, extractorType: 'agent', extractorId: `claude-code/${row.model.reported.join('+') || model}`,
}));
const ledgerText = ledger.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
const runText = selected.map((request, index) => JSON.stringify(rows[index] ?? { handle: request.handle, sourceLanguage: request.sourceLanguage, status: null, failure: 'NOT_RUN_AFTER_FAILED_GATE', evidenceValid: false })).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, rederive ? 'diagnostic-candidates.jsonl' : 'candidate-ledger.jsonl'), ledgerText);
fs.writeFileSync(path.join(outDir, 'run-ledger.jsonl'), runText);
const claudeVersion = claudeVersionResult?.stdout.trim() ?? null;
const gitHeadAtEnd = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const trackedDirtyAtEnd = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '';
const summary = {
  format: 'openlunum-client-extraction-run/0.2', client: 'claude-code', clientVersion: claudeVersion, requestedModel: model,
  reportedModels: [...new Set(completed.flatMap((row) => row.model.reported))], ...(rederive ? { classifierCommit: gitHead } : { codeCommit: gitHead }), workingTreeCleanAtStart: !gitDirtyAtStart, mode: rederive ? 'rederived-from-raw-NONCOMPARABLE' : 'live',
  startedAt, endedAt: new Date().toISOString(), requestedBudget: plan,
  codeCommitAtEnd: gitHeadAtEnd, trackedWorkingTreeCleanAtEnd: !trackedDirtyAtEnd,
  decodingSettings: { temperature: 'not exposed by this CLI invocation', seed: 'not exposed by this CLI invocation', outputTokens: 'provider/CLI controlled; not configured by runner' },
  runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), gateSha256: sha256(fs.readFileSync(path.join(root, 'scripts/research/source-only-run-gates.mjs'))),
  rawEventPolicy: 'Provider JSON events with explicit thinking/reasoning blocks removed, never parsed as semantics. Non-JSON lines retained as hashes/byte counts, not prose. Not a byte-exact private-reasoning transcript.',
  package: path.relative(root, PACKAGE), packageSha256: sha256(fs.readFileSync(PACKAGE)), requestsSha256: sha256(fs.readFileSync(REQUESTS)), profileSha256: sha256(fs.readFileSync(PROFILE)),
  isolation: 'fresh claude -p process per item in an empty temp cwd; built-in tools disabled (--tools ""); --strict-mcp-config with only contract/build/submit/validate allowed; prompt-level source-only, not a technical sandbox (the MCP server process runs from the repository checkout)',
  rows: selected.length, completed: completed.length, notRun: selected.length - completed.length,
  parse: completed.filter((row) => row.status === 'parse').length, abstain: completed.filter((row) => row.status === 'abstain').length,
  failed: selected.length - completed.filter(row => rederive ? row.status : row.evidenceValid).length,
  failures: completed.filter(row => !row.status || row.evidenceValid === false).map(row => ({ handle: row.handle, failure: row.failure, evidenceFailures: row.evidenceFailures })),
  toolErrors: completed.reduce((sum, row) => sum + row.calls.filter((call) => call.isError || call.error).length, 0),
  totalCostUsd: completed.every(row => Number.isFinite(row.costUsd)) ? Number(completed.reduce((sum, row) => sum + row.costUsd, 0).toFixed(4)) : null,
  ...(rederive ? { diagnosticCandidatesSha256: sha256(ledgerText) } : { candidateLedgerSha256: sha256(ledgerText) }), runLedgerSha256: sha256(runText),
  servedArtifactBinding: rederive ? 'not-checked (rederive)' : { atStart: bindingAtStart.match, atEnd: artifactBinding().match, checks: bindingAtStart.checks },
  observedContractVersions: [...new Set(completed.map((row) => row.observedContractVersion).filter(Boolean))],
  itemsWithoutObservedContract: completed.filter((row) => !row.observedContractVersion).length,
  evidenceValid: !rederive && completed.length === selected.length && completed.every(row => row.evidenceValid) && artifactBinding().match && gitHeadAtEnd === gitHead && !trackedDirtyAtEnd,
};
fs.writeFileSync(path.join(outDir, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
checkpoint(summary.evidenceValid ? 'COMPLETE_BOUND_EVIDENCE' : 'FINISHED_INVALID_OR_DIAGNOSTIC');
console.log(JSON.stringify(summary, null, 2));
// A binding that broke during the run, or a live server reporting a different
// contract, invalidates the run: record it and fail loudly (round-2 evaluation).
if (!rederive) {
  if (!summary.evidenceValid) {
    console.error('run invalid: inspect run-ledger and summary; no failed rows count as extraction evidence');
    process.exit(4);
  }
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
