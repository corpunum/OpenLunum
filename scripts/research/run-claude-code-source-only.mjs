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
// Usage:
//   node scripts/research/run-claude-code-source-only.mjs <outDir> [--model sonnet] [--concurrency 4] [--limit N]
//   node scripts/research/run-claude-code-source-only.mjs <outDir> --rederive   # rebuild ledgers from <outDir>/raw, no model calls
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V8 = path.join(root, 'experiments/natural-development-v8');
const REQUESTS = path.join(V8, 'extraction/source-only-request.jsonl');
const PROFILE = path.join(V8, 'extraction/public-task-profile-iteration2.json');
const PACKAGE = path.join(V8, 'extraction/public-instruction-package-v3.json');
const ALLOWED_TOOLS = ['lunum_get_extraction_contract', 'lunum_build_candidate', 'lunum_submit_candidate', 'lunum_validate'].map((name) => `mcp__lunum__${name}`);

const args = process.argv.slice(2);
const flag = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const outDir = path.resolve(args[0] ?? '');
if (!args[0] || args[0].startsWith('--')) { console.error('usage: run-claude-code-source-only.mjs <outDir> [--model sonnet] [--concurrency 4] [--limit N]'); process.exit(2); }
const model = flag('model', 'sonnet');
const concurrency = Number(flag('concurrency', '4'));
const limit = Number(flag('limit', '0'));
const rederive = args.includes('--rederive');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requests = fs.readFileSync(REQUESTS, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const selected = limit > 0 ? requests.slice(0, limit) : requests;
const profileText = fs.readFileSync(PROFILE, 'utf8');
const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));

// Record source state before any model call; the tree may change later.
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const gitDirtyAtStart = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '';

// Build once so parallel launches do not race on dist/.
if (!rederive) {
  const build = spawnSync('pnpm', ['--filter', '@corpunum/lunum-mcp...', 'build'], { cwd: root, stdio: ['ignore', process.stderr, process.stderr] });
  if (build.status !== 0) process.exit(1);
}

fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
const mcpConfigPath = path.join(outDir, 'mcp-config.json');
fs.writeFileSync(mcpConfigPath, `${JSON.stringify({ mcpServers: { lunum: { command: 'node', args: [path.join(root, 'scripts/lunum-mcp-launch.mjs')], env: { LUNUM_MCP_SKIP_BUILD: '1', LUNUM_COMPACTION: 'off', LUNUM_MULTILINGUAL: 'on', LUNUM_CONTEXT_MODE: 'mixed' } } } }, null, 2)}\n`);

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
      if (block.type === 'tool_use') calls.set(block.id, { name: block.name, input: block.input, result: null, isError: null });
      if (block.type === 'tool_result' && calls.has(block.tool_use_id)) {
        const text = Array.isArray(block.content) ? block.content.map((part) => part.text ?? '').join('') : String(block.content ?? '');
        let parsed = null; try { parsed = JSON.parse(text); } catch { /* keep raw */ }
        Object.assign(calls.get(block.tool_use_id), { result: parsed ?? text, isError: Boolean(block.is_error) });
      }
    }
  }
  return [...calls.values()];
}

function finalStatus(text) {
  const lines = String(text ?? '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
  try { const value = JSON.parse(lines.at(-1)); return ['parse', 'abstain'].includes(value?.status) ? value : null; } catch { return null; }
}

function runOne(request) {
  return new Promise((resolve) => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-extract-'));
    const cli = ['-p', prompt(request), '--model', model, '--output-format', 'stream-json', '--verbose',
      '--strict-mcp-config', '--mcp-config', mcpConfigPath, '--tools', '', '--allowedTools', ...ALLOWED_TOOLS,
      '--permission-mode', 'dontAsk', '--no-session-persistence', '--max-budget-usd', '1'];
    const child = spawn('claude', cli, { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      fs.rmSync(workdir, { recursive: true, force: true });
      fs.writeFileSync(path.join(outDir, 'raw', `${request.handle}.jsonl`), stdout);
      resolve(classify(request, stdout, code, stderr));
    });
  });
}

function classify(request, stdout, code, stderr) {
      const rawPath = path.join(outDir, 'raw', `${request.handle}.jsonl`);
      const events = stdout.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
      const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
      const result = events.findLast((event) => event.type === 'result');
      const calls = toolUses(events);
      const submits = calls.filter((call) => call.name === 'mcp__lunum__lunum_submit_candidate');
      // A submit with candidateSem null is core's explicit abstention, not a parse.
      const succeeded = submits.filter((call) => !call.isError && call.result?.success === true);
      const accepted = succeeded.filter((call) => call.input?.candidateSem != null);
      const declared = finalStatus(result?.result);
      const lastAccepted = accepted.at(-1) ?? null;
      let status; let candidateSem; let failure = null;
      if (declared?.status === 'abstain' && !lastAccepted) { status = 'abstain'; candidateSem = null; }
      else if (declared?.status === 'parse' && lastAccepted) { status = 'parse'; candidateSem = lastAccepted.input.candidateSem; }
      else { status = null; candidateSem = undefined; failure = !result ? 'no_result_event' : !declared ? 'unparseable_final_status' : declared.status === 'parse' ? 'parse_claimed_without_accepted_submission' : 'abstain_after_accepted_submission'; }
      return {
        handle: request.handle, sourceLanguage: request.sourceLanguage, exitCode: code, failure,
        status, candidateSem, declared,
        model: { requested: model, reported: Object.keys(result?.modelUsage ?? {}), initModel: init?.model ?? null },
        mcpServers: init?.mcp_servers ?? null, toolsOffered: init?.tools ?? null,
        calls: calls.map((call) => ({ name: call.name.replace('mcp__lunum__', ''), isError: call.isError, error: call.isError || call.result?.success === false ? (call.result?.error ?? call.result) : undefined })),
        usage: result?.usage ?? null, costUsd: result?.total_cost_usd ?? null, numTurns: result?.num_turns ?? null,
        abstentionSubmitted: succeeded.some((call) => call.input?.candidateSem == null),
        rawStream: path.relative(outDir, rawPath), rawStreamSha256: sha256(stdout), stderrTail: stderr?.slice(-500) || undefined,
      };
}

const rows = new Array(selected.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
  while (next < selected.length) {
    const index = next++;
    rows[index] = rederive
      ? classify(selected[index], fs.readFileSync(path.join(outDir, 'raw', `${selected[index].handle}.jsonl`), 'utf8'), null, null)
      : await runOne(selected[index]);
    const row = rows[index];
    console.error(`${row.handle} ${row.sourceLanguage} -> ${row.status ?? `FAILED(${row.failure})`} calls=${row.calls.map((c) => `${c.name}${c.isError ? '!' : ''}`).join(',')} $${row.costUsd}`);
  }
}));

// Scorer-compatible ledger: only rows with an observed outcome. Failed rows
// stay in the raw run ledger and are reported as missing by the scorer.
const requestByHandle = new Map(requests.map((request) => [request.handle, request]));
const ledger = rows.filter((row) => row.status).map((row) => ({
  handle: row.handle, sourceSha256: requestByHandle.get(row.handle).sourceSha256, contractHash: requestByHandle.get(row.handle).contractHash,
  status: row.status, candidateSem: row.candidateSem, extractorType: 'agent', extractorId: `claude-code/${row.model.reported.join('+') || model}`,
}));
const ledgerText = ledger.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
const runText = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'candidate-ledger.jsonl'), ledgerText);
fs.writeFileSync(path.join(outDir, 'run-ledger.jsonl'), runText);
const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim();
const summary = {
  format: 'openlunum-client-extraction-run/0.1', client: 'claude-code', clientVersion: claudeVersion, requestedModel: model,
  reportedModels: [...new Set(rows.flatMap((row) => row.model.reported))], ...(rederive ? { classifierCommit: gitHead } : { codeCommit: gitHead }), workingTreeCleanAtStart: !gitDirtyAtStart, mode: rederive ? 'rederived-from-raw' : 'live',
  package: path.relative(root, PACKAGE), packageSha256: sha256(fs.readFileSync(PACKAGE)), requestsSha256: sha256(fs.readFileSync(REQUESTS)), profileSha256: sha256(fs.readFileSync(PROFILE)),
  isolation: 'fresh claude -p process per item in an empty temp cwd; built-in tools disabled (--tools ""); --strict-mcp-config with only contract/build/submit/validate allowed; prompt-level source-only, not a technical sandbox (the MCP server process runs from the repository checkout)',
  rows: rows.length, parse: rows.filter((row) => row.status === 'parse').length, abstain: rows.filter((row) => row.status === 'abstain').length,
  failed: rows.filter((row) => !row.status).length, failures: rows.filter((row) => !row.status).map((row) => ({ handle: row.handle, failure: row.failure })),
  toolErrors: rows.reduce((sum, row) => sum + row.calls.filter((call) => call.isError || call.error).length, 0),
  totalCostUsd: Number(rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0).toFixed(4)),
  candidateLedgerSha256: sha256(ledgerText), runLedgerSha256: sha256(runText),
};
fs.writeFileSync(path.join(outDir, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
