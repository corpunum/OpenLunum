#!/usr/bin/env node
// Live source-only extraction through the Codex CLI (`codex exec`, ChatGPT login) and the Lunum MCP server.
// Sibling of run-claude-code-source-only.mjs and run-openai-compatible-source-only.mjs: the same prompt
// (sourceOnlyPrompt), the same classification (classify) and package binding.
//
// Isolation, stated so results are not over-read:
//   - a fresh `codex exec --ephemeral` per item in an empty temp directory, read-only sandbox;
//   - shell, web search, browser, computer use, apps, plugins, goals, image tools, apply_patch and the
//     user's other MCP servers (unumsearch) are switched off; only the four Lunum tools are enabled;
//   - Codex still offers a few harmless built-ins (e.g. a clock, MCP resource listing); ANY recorded
//     call that is not one of the four Lunum tools makes the item invalid (DISALLOWED_TOOL);
//   - `codex exec --json` does not report the served model: the requested model id is recorded and the
//     ledger says so (modelVerification: 'requested-only');
//   - cost is a ChatGPT-subscription quota, not dollars: tokens are recorded, costUsd is 0.
//
//   node scripts/research/run-codex-source-only.mjs <new-outDir> --requests f.jsonl --package p.json \
//     --model gpt-6-luna --effort low --timeout-ms 600000 [--limit N]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, artifactBinding as bindArtifacts, validateRequests } from './source-only-run-gates.mjs';
import { sourceOnlyPrompt, classify } from './run-openai-compatible-source-only.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = ['lunum_get_extraction_contract', 'lunum_build_candidate', 'lunum_submit_candidate', 'lunum_validate'];
const DISABLED = ['shell_tool', 'browser_use', 'computer_use', 'apps', 'skill_search', 'goals', 'image_generation', 'view_image', 'plugins'];

export function codexArgs({ model, effort, launcher }) {
  return ['exec', '-m', model, '-c', `model_reasoning_effort=${effort}`, '--skip-git-repo-check', '--ephemeral', '--json', '-s', 'read-only',
    ...DISABLED.flatMap((f) => ['--disable', f]),
    '-c', 'web_search="disabled"', '-c', 'include_apply_patch_tool=false', '-c', 'mcp_servers.unumsearch.enabled=false',
    '-c', 'mcp_servers.lunum.command="node"', '-c', `mcp_servers.lunum.args=[${JSON.stringify(launcher)}]`,
    '-c', 'mcp_servers.lunum.env={LUNUM_MCP_SKIP_BUILD="1",LUNUM_COMPACTION="off",LUNUM_MULTILINGUAL="on",LUNUM_CONTEXT_MODE="mixed"}',
    '-c', `mcp_servers.lunum.enabled_tools=${JSON.stringify(TOOLS)}`,
    '-c', 'mcp_servers.lunum.default_tools_approval_mode="approve"'];
}

/** Calls and final text from `codex exec --json` events. Any non-Lunum tool item is kept under its own name. */
export function fromEvents(lines) {
  const calls = []; let finalText = ''; const usage = []; let malformed = 0;
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { malformed += 1; continue; }
    if (e.type === 'turn.completed') usage.push(e.usage ?? null);
    if (e.type !== 'item.completed') continue;
    const it = e.item ?? {};
    if (it.type === 'agent_message') { finalText = it.text ?? ''; continue; }
    if (it.type === 'reasoning') continue;
    if (it.type === 'mcp_tool_call') {
      let input = null; try { input = typeof it.arguments === 'string' ? JSON.parse(it.arguments) : it.arguments; } catch { input = null; }
      const text = it.result?.content?.find?.((p) => p.type === 'text')?.text;
      let result = null; try { result = text === undefined ? null : JSON.parse(text); } catch { result = text; }
      calls.push({ name: it.server === 'lunum' ? it.tool : `${it.server}:${it.tool}`, input, result, isError: it.status !== 'completed' || it.result?.isError === true || !!it.error });
      continue;
    }
    calls.push({ name: `codex:${it.type}`, input: null, result: null, isError: true }); // shell, web search, patch, ...
  }
  return { calls, finalText, usage, malformed };
}

async function main(args) {
  const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  const outDir = path.resolve(args[0] ?? '');
  if (!args[0] || args[0].startsWith('--')) throw new Error('usage: runner <new-outDir> --requests f --package p --model id --effort low --timeout-ms N');
  for (const k of ['requests', 'package', 'model', 'effort', 'timeout-ms']) if (!flag(k, null)) throw new Error(`--${k}_required`);
  const model = flag('model'); const effort = flag('effort'); const timeoutMs = Number(flag('timeout-ms')); const limit = Number(flag('limit', '0'));
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
  const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim();
  if (!codexVersion) throw new Error('client_version_unverified');
  const cli = codexArgs({ model, effort, launcher: path.join(root, 'scripts/lunum-mcp-launch.mjs') });

  fs.mkdirSync(outDir); fs.mkdirSync(path.join(outDir, 'raw'));
  const startedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'preflight.json'), JSON.stringify({ startedAt, codeCommit: gitHead, workingTreeClean: true, client: codexVersion, model, effort, cli,
    modelVerification: 'requested-only (codex exec --json does not report the served model)', package: path.relative(root, PACKAGE), timeoutMs,
    runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), artifactBinding: bindingAtStart }, null, 2) + '\n', { flag: 'wx' });
  const ledgerPath = path.join(outDir, 'run-ledger.jsonl');

  for (const request of selected) {
    const promptText = sourceOnlyPrompt(request, path.basename(PACKAGE), pkg.conventions, profileText);
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-codex-'));
    const t0 = Date.now();
    const r = spawnSync('codex', [...cli, promptText], { cwd, input: '', encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 28 });
    fs.rmSync(cwd, { recursive: true, force: true });
    const stdout = r.stdout ?? '';
    const ev = fromEvents(stdout.split('\n').filter(Boolean));
    let failure = null;
    if (r.error?.code === 'ETIMEDOUT' || r.signal) failure = 'TIMEOUT';
    else if (r.status !== 0) failure = /usage limit|rate limit|quota/iu.test(r.stderr ?? '') ? 'QUOTA_EXHAUSTED' : 'PROCESS_ERROR';
    else if (ev.malformed) failure = 'INVALID_PROVIDER_EVENT_STREAM';
    const row = { ...classify({ request, calls: ev.calls, finalText: ev.finalText, failure, pkg, model, reportedModels: [model] }),
      modelVerification: 'requested-only', usage: ev.usage, seconds: Math.round((Date.now() - t0) / 1000), rawStream: `raw/${request.handle}.jsonl`, rawStreamSha256: sha256(stdout) };
    fs.writeFileSync(path.join(outDir, row.rawStream), stdout, { flag: 'wx' });
    fs.appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ handle: row.handle, status: row.status, valid: row.evidenceValid, failures: row.evidenceFailures, seconds: row.seconds }));
    if (failure === 'QUOTA_EXHAUSTED') { console.error('quota exhausted: stopping; remaining items not run'); break; }
  }

  const bindingAtEnd = binding(); const headAtEnd = git('rev-parse', 'HEAD');
  const rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), model, effort, client: codexVersion, codeCommit: gitHead,
    commitUnchanged: headAtEnd === gitHead, artifactsUnchanged: bindingAtEnd.match, selected: selected.length, items: rows.length,
    parse: rows.filter((x) => x.evidenceValid && x.status === 'parse').length, abstain: rows.filter((x) => x.evidenceValid && x.status === 'abstain').length,
    invalid: rows.filter((x) => !x.evidenceValid).length, inputTokens: rows.reduce((s, x) => s + (x.usage ?? []).reduce((a, u) => a + (u?.input_tokens ?? 0), 0), 0), costUsd: 0 }, null, 2) + '\n');
  if (headAtEnd !== gitHead || !bindingAtEnd.match) { console.error('run invalid: commit or served artifacts changed during the run'); process.exit(4); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
