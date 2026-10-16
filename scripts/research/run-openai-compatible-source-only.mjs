#!/usr/bin/env node
// Live source-only extraction through an OpenAI-compatible chat endpoint (for
// example a local llama.cpp/Halogen server) and the Lunum MCP server.
//
// The sibling of run-claude-code-source-only.mjs for non-Anthropic extractors.
// Same prompt text, same four allowed tools, same package/profile, same served
// artifact binding and request validation. Differences, stated so results are
// not over-read:
//   - the agent loop is this script, not a vendor client: it forwards the
//     model's tool calls to a fresh Lunum MCP server process per item;
//   - the model's reasoning text (reasoning_content) is dropped, never stored;
//   - cost is recorded as 0 (local inference) and there is no budget plan;
//   - the model identity is the endpoint's reported model id, not a weight hash.
//
//   node scripts/research/run-openai-compatible-source-only.mjs <new-outDir> \
//     --requests f.jsonl --package p.json --endpoint http://127.0.0.1:8080/v1 \
//     --model EXACT_REPORTED_ID --timeout-ms 900000 [--limit N] [--max-tokens 8192] [--max-turns 16]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sha256, artifactBinding as bindArtifacts, checkServedContract, validateRequests, parseFinalStatus, contradictoryAbstention } from './source-only-run-gates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED = ['lunum_get_extraction_contract', 'lunum_build_candidate', 'lunum_submit_candidate', 'lunum_validate'];

/** Verbatim prompt of run-claude-code-source-only.mjs (a test pins the equality). */
export function sourceOnlyPrompt(request, packageName, conventions, profileText) {
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
    `Public conventions (${packageName}):`,
    JSON.stringify(conventions, null, 2),
    '',
    'Public task profile:',
    profileText,
    '',
    'Item:',
    JSON.stringify({ handle: request.handle, sourceLanguage: request.sourceLanguage, sourceText: request.sourceText }),
  ].join('\n');
}

/** Ledger row from recorded tool calls; mirrors the Claude runner's classification. */
export function classify({ request, calls, finalText, failure, pkg, model, reportedModels }) {
  const contracts = calls.filter((c) => c.name === 'lunum_get_extraction_contract' && c.result?.contract).map((c) => checkServedContract(c.result.contract, pkg));
  const submits = calls.filter((c) => c.name === 'lunum_submit_candidate');
  const accepted = submits.filter((c) => !c.isError && c.result?.success === true && c.input?.candidateSem != null);
  const declared = parseFinalStatus(finalText);
  const last = accepted.at(-1) ?? null;
  let status = null; let candidateSem; let fail = failure ?? null;
  if (!fail) {
    if (declared?.status === 'abstain' && !last) { status = 'abstain'; candidateSem = null; }
    else if (declared?.status === 'parse' && last) { status = 'parse'; candidateSem = last.input.candidateSem; }
    else fail = !declared ? 'unparseable_final_status' : declared.status === 'parse' ? 'parse_claimed_without_accepted_submission' : 'abstain_after_accepted_submission';
  }
  const failures = [];
  if (fail) failures.push(fail);
  if (!contracts.length || !contracts.every((c) => c.match)) failures.push('CONTRACT_UNBOUND');
  if (submits.some((c) => c.input?.sourceText !== request.sourceText)) failures.push('SUBMITTED_SOURCE_MISMATCH');
  if (contradictoryAbstention(status, submits)) failures.push('ABSTAIN_AFTER_CANONICAL_SUBMISSION');
  if (!reportedModels.length || reportedModels.some((id) => id !== model)) failures.push('MODEL_UNVERIFIED');
  if (calls.some((c) => !ALLOWED.includes(c.name))) failures.push('DISALLOWED_TOOL');
  return {
    handle: request.handle, sourceLanguage: request.sourceLanguage, failure: fail, status, candidateSem, declared,
    model: { requested: model, reported: [...new Set(reportedModels)] },
    calls: calls.map((c) => ({ name: c.name, isError: c.isError, error: c.isError || c.result?.success === false ? (c.result?.error ?? c.result) : undefined })),
    costUsd: 0, evidenceFailures: [...new Set(failures)], evidenceValid: failures.length === 0,
  };
}

async function main(args) {
  const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  const outDir = path.resolve(args[0] ?? '');
  if (!args[0] || args[0].startsWith('--')) throw new Error('usage: runner <new-outDir> --requests f --package p --endpoint url --model id --timeout-ms N');
  for (const k of ['requests', 'package', 'endpoint', 'model', 'timeout-ms']) if (!flag(k, null)) throw new Error(`--${k}_required`);
  const endpoint = flag('endpoint').replace(/\/$/u, '');
  const model = flag('model');
  const timeoutMs = Number(flag('timeout-ms'));
  const maxTokens = Number(flag('max-tokens', '8192'));
  const maxTurns = Number(flag('max-turns', '16'));
  const limit = Number(flag('limit', '0'));
  const PACKAGE = path.resolve(root, flag('package'));
  const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
  const PROFILE = path.resolve(path.dirname(PACKAGE), pkg.freeze.taskProfilePath);
  const profileText = fs.readFileSync(PROFILE, 'utf8');
  const requests = fs.readFileSync(path.resolve(root, flag('requests')), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  validateRequests(requests, pkg);
  const selected = limit > 0 ? requests.slice(0, limit) : requests;

  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();
  const gitHead = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain') !== '') throw new Error('live_run_requires_frozen_clean_checkout');
  const build = spawnSync('pnpm', ['--filter', '@corpunum/lunum-mcp...', 'build'], { cwd: root, stdio: ['ignore', process.stderr, process.stderr] });
  if (build.status !== 0) process.exit(1);
  const binding = () => bindArtifacts(root, PACKAGE, PROFILE, pkg);
  const bindingAtStart = binding();
  if (!bindingAtStart.match) throw new Error('served_artifacts_do_not_match_package');
  const models = await (await fetch(`${endpoint}/models`)).json();
  if (!models.data?.some((m) => m.id === model)) throw new Error(`model_not_served:${model}`);

  const require = createRequire(path.join(root, 'packages/mcp/package.json'));
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
  const openMcp = async () => {
    const client = new Client({ name: 'openlunum-openai-compatible-source-only', version: '0.1' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'scripts/lunum-mcp-launch.mjs')],
      env: { ...process.env, LUNUM_MCP_SKIP_BUILD: '1', LUNUM_COMPACTION: 'off', LUNUM_MULTILINGUAL: 'on', LUNUM_CONTEXT_MODE: 'mixed' }, stderr: 'ignore' }), { timeout: 10000 });
    return client;
  };

  fs.mkdirSync(outDir); fs.mkdirSync(path.join(outDir, 'raw'));
  const startedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'preflight.json'), JSON.stringify({ startedAt, codeCommit: gitHead, workingTreeClean: true, endpoint, model, servedModels: models.data.map((m) => m.id),
    package: path.relative(root, PACKAGE), maxTokens, maxTurns, timeoutMs, runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), artifactBinding: bindingAtStart }, null, 2) + '\n', { flag: 'wx' });
  const ledgerPath = path.join(outDir, 'run-ledger.jsonl');

  for (const request of selected) {
    const promptText = sourceOnlyPrompt(request, path.basename(PACKAGE), pkg.conventions, profileText);
    const client = await openMcp();
    const tools = (await client.listTools(undefined, { timeout: 10000 })).tools.filter((t) => ALLOWED.includes(t.name))
      .map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema } }));
    const messages = [{ role: 'user', content: promptText }];
    const calls = []; const reportedModels = []; const usage = [];
    let finalText = ''; let failure = null;
    const deadline = Date.now() + timeoutMs;
    try {
      for (let turn = 0; ; turn += 1) {
        if (turn >= maxTurns) { failure = 'MAX_TURNS'; break; }
        const left = deadline - Date.now();
        if (left <= 0) { failure = 'TIMEOUT'; break; }
        const res = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(left),
          body: JSON.stringify({ model, messages, tools, max_tokens: maxTokens, temperature: 0 }) }).catch((e) => ({ ok: false, error: e }));
        if (!res.ok) { failure = res.error?.name === 'TimeoutError' ? 'TIMEOUT' : 'HTTP_ERROR'; break; }
        const body = await res.json();
        if (body.model) reportedModels.push(body.model);
        usage.push({ usage: body.usage ?? null, timings: body.timings ?? null });
        const msg = body.choices?.[0]?.message ?? {};
        const toolCalls = msg.tool_calls ?? [];
        messages.push({ role: 'assistant', content: msg.content ?? null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }); // reasoning dropped
        if (!toolCalls.length) { finalText = msg.content ?? ''; break; }
        for (const tc of toolCalls) {
          let input; let result; let isError = false;
          try { input = JSON.parse(tc.function.arguments || '{}'); } catch { input = null; }
          if (!ALLOWED.includes(tc.function.name)) { isError = true; result = { success: false, error: 'tool_not_offered' }; }
          else if (input === null) { isError = true; result = { success: false, error: 'arguments_not_json' }; }
          else {
            const r = await client.callTool({ name: tc.function.name, arguments: input }, undefined, { timeout: 60000 }).catch((e) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, error: String(e.message ?? e) }) }] }));
            const text = r.content?.find((p) => p.type === 'text')?.text ?? 'null';
            isError = r.isError === true;
            try { result = JSON.parse(text); } catch { result = text; }
          }
          calls.push({ name: tc.function.name, input, result, isError });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        }
      }
    } finally { await client.close().catch(() => {}); }
    const row = { ...classify({ request, calls, finalText, failure, pkg, model, reportedModels }), usage, rawStream: `raw/${request.handle}.json` };
    fs.writeFileSync(path.join(outDir, row.rawStream), JSON.stringify({ request, promptSha256: sha256(promptText), messages: messages.slice(1) }, null, 2) + '\n', { flag: 'wx' });
    fs.appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ handle: row.handle, status: row.status, valid: row.evidenceValid, failures: row.evidenceFailures }));
  }

  const bindingAtEnd = binding();
  const headAtEnd = git('rev-parse', 'HEAD');
  const rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), model, endpoint, codeCommit: gitHead,
    commitUnchanged: headAtEnd === gitHead, artifactsUnchanged: bindingAtEnd.match, items: rows.length,
    parse: rows.filter((r) => r.evidenceValid && r.status === 'parse').length, abstain: rows.filter((r) => r.evidenceValid && r.status === 'abstain').length,
    invalid: rows.filter((r) => !r.evidenceValid).length, costUsd: 0 }, null, 2) + '\n');
  if (headAtEnd !== gitHead || !bindingAtEnd.match) { console.error('run invalid: commit or served artifacts changed during the run'); process.exit(4); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
