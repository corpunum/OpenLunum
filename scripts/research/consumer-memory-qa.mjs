#!/usr/bin/env node
// Standalone consumer benchmark: does Lunum memory context cost fewer tokens
// than natural text for a named model, without losing downstream answers?
//
// Memory: the 24 V8 source sentences. Lunum conditions use a *real* extraction
// ledger: an item with core-issued identity is rendered and deduplicated by
// fingerprint; everything else (abstention, invalid, missing) falls back to its
// natural source text. Token counts come from the provider's usage accounting
// for the model that answers (the named tokenizer), as the difference between
// a call with the memory block and the same call with an empty block.
//
//   node scripts/research/consumer-memory-qa.mjs <outDir> --ledger <candidate-ledger.jsonl> [--reps 3] [--concurrency 6] [--model sonnet]
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const core = await import(pathToFileURL(path.join(root, 'packages/core/dist/src/index.js')).href);
const args = process.argv.slice(2);
const flag = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const outDir = path.resolve(args[0] ?? '');
const ledgerPath = flag('ledger');
if (!args[0] || args[0].startsWith('--') || !ledgerPath) { console.error('usage: consumer-memory-qa.mjs <outDir> --ledger <candidate-ledger.jsonl> [--reps 3] [--concurrency 6] [--model sonnet]'); process.exit(2); }
const reps = Number(flag('reps', '3'));
const concurrency = Number(flag('concurrency', '6'));
const model = flag('model', 'sonnet');

const V8 = path.join(root, 'experiments/natural-development-v8');
const QUESTIONS = path.join(root, 'experiments/consumer-memory-qa-v1/questions.jsonl');
const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const requests = readLines(path.join(V8, 'extraction/source-only-request.jsonl'));
const privateMap = JSON.parse(fs.readFileSync(path.join(V8, 'extraction/source-only-private-map.json'), 'utf8'));
const subset = new Map(readLines(path.join(V8, 'frame-0.2-successor/certified-subset.jsonl')).map((row) => [row.id, row]));
const ledger = new Map(readLines(path.resolve(ledgerPath)).map((entry) => [entry.handle, entry]));
const questions = readLines(QUESTIONS).slice(0, Number(flag('questions', '0')) || undefined);

// ── Contexts ────────────────────────────────────────────────────────────
const LEGEND = {
  'generic-en-pivot/0.1': 'Some memory lines are Lunum-Code: "R" marks a real-world statement; then an optional "not", a modality word (obligation, permission), a predicate, and its role values in a fixed order (agent, recipient, object, theme, value, ...); "if A then B" is a condition. Identifiers are lowercased.',
  'generic-en-pivot/0.2': 'Some memory lines are Lunum-Code: "R" marks a real-world statement; predicate(role=value, ...) names each participant; "must" = obligation, "may" = permission, "not" = negation; "if A then B ; C" means B and C apply when A holds; "@date" is when it happens. Identifiers are lowercased.',
};
const rowIdOf = (handle) => { const value = privateMap[handle]; return typeof value === 'string' ? value : (value?.sourceRowId ?? value?.id); };

function lunumContext(profile) {
  const lines = []; const seen = new Set(); const coverage = { rendered: 0, deduplicated: 0, fallbackAbstain: 0, fallbackInvalid: 0, fallbackMissing: 0 };
  for (const request of requests) {
    const entry = ledger.get(request.handle);
    if (!entry) { coverage.fallbackMissing++; lines.push(request.sourceText); continue; }
    if (entry.status !== 'parse' || !entry.candidateSem) { coverage.fallbackAbstain++; lines.push(request.sourceText); continue; }
    const submission = core.submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: entry.candidateSem, provenance: { extractorType: 'agent' } });
    if (!submission.candidateIdentityAvailable) { coverage.fallbackInvalid++; lines.push(request.sourceText); continue; }
    if (seen.has(submission.semanticFingerprint)) { coverage.deduplicated++; continue; }
    seen.add(submission.semanticFingerprint); coverage.rendered++;
    lines.push(core.renderSem(submission.sem, { profile }).code);
  }
  return { text: `${LEGEND[profile]}\n\n${lines.map((line) => `- ${line}`).join('\n')}`, coverage };
}

// Lunum for identity, natural text for the model: one source sentence per
// fingerprint (English preferred), everything without identity kept verbatim.
// Added after the first run showed the saving comes from deduplication.
function naturalLunumDedupContext() {
  const chosen = new Map(); const lines = []; const coverage = { fingerprints: 0, deduplicated: 0, verbatim: 0 };
  for (const request of requests) {
    const entry = ledger.get(request.handle);
    const submission = entry?.status === 'parse' && entry.candidateSem
      ? core.submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: entry.candidateSem, provenance: { extractorType: 'agent' } })
      : null;
    if (!submission?.candidateIdentityAvailable) { coverage.verbatim++; lines.push({ text: request.sourceText }); continue; }
    const fingerprint = submission.semanticFingerprint;
    if (!chosen.has(fingerprint)) { coverage.fingerprints++; const slot = { text: request.sourceText, language: request.sourceLanguage }; chosen.set(fingerprint, slot); lines.push(slot); continue; }
    coverage.deduplicated++;
    const slot = chosen.get(fingerprint);
    if (slot.language !== 'en' && request.sourceLanguage === 'en') Object.assign(slot, { text: request.sourceText, language: 'en' });
  }
  return { text: lines.map((line) => `- ${line.text}`).join('\n'), coverage };
}

// The product path: core compileContext in identity_dedup mode (decisions/0012),
// fed each item's source text and core-issued identity. Unlike the harness
// condition above it keeps the first occurrence rather than preferring English.
function productIdentityDedupContext() {
  const messages = requests.map((request) => {
    const entry = ledger.get(request.handle);
    const submission = entry?.status === 'parse' && entry.candidateSem
      ? core.submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: entry.candidateSem, provenance: { extractorType: 'agent' } })
      : null;
    return { role: 'user', content: request.sourceText, record: submission?.semanticFingerprint ? { semanticFingerprint: submission.semanticFingerprint } : {} };
  });
  const result = core.compileContext(messages, { mode: 'identity_dedup' });
  return { text: result.selectedMessages.map((message) => `- ${message.content}`).join('\n'), coverage: { kept: result.selectedMessages.length, dropped: messages.length - result.selectedMessages.length } };
}

// Reference only: one natural sentence per gold meaning group (uses gold labels).
function oracleDedupContext() {
  const byGroup = new Map();
  for (const request of requests) {
    const row = subset.get(rowIdOf(request.handle));
    const group = row?.target?.outcome === 'parse' ? row.source.semanticGroup : `solo:${request.handle}`;
    if (!byGroup.has(group) || (request.sourceLanguage === 'en' && byGroup.get(group).sourceLanguage !== 'en')) byGroup.set(group, request);
  }
  return { text: [...byGroup.values()].map((request) => `- ${request.sourceText}`).join('\n'), coverage: { groups: byGroup.size, usesGoldLabels: true } };
}

const conditions = {
  'natural-all': { text: requests.map((request) => `- ${request.sourceText}`).join('\n'), coverage: { items: requests.length } },
  'lunum-0.1': lunumContext('generic-en-pivot/0.1'),
  'lunum-0.2': lunumContext('generic-en-pivot/0.2'),
  'natural-lunum-dedup': naturalLunumDedupContext(),
  'product-identity-dedup': productIdentityDedupContext(),
  'natural-oracle-dedup': oracleDedupContext(),
};

// ── Model calls ─────────────────────────────────────────────────────────
const SYSTEM = 'You answer questions using only the MEMORY block. Reply with only one line of JSON: {"answer": "..."}. Keep the answer short. If the memory does not say, answer "unknown".';
const emptyMcp = path.join(os.tmpdir(), `lunum-qa-mcp-${process.pid}.json`);
fs.writeFileSync(emptyMcp, JSON.stringify({ mcpServers: {} }));
const prompt = (memory, question) => `MEMORY:\n${memory}\n\nQUESTION: ${question}`;

function ask(text) {
  return new Promise((resolve) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lunum-qa-'));
    const child = spawn('claude', ['-p', text, '--model', model, '--system-prompt', SYSTEM, '--tools', '', '--strict-mcp-config', '--mcp-config', emptyMcp,
      '--no-session-persistence', '--output-format', 'json', '--max-budget-usd', '0.5'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', (code) => {
      fs.rmSync(cwd, { recursive: true, force: true });
      let result = null; try { result = JSON.parse(stdout); } catch { /* recorded as failure */ }
      const usage = result?.usage ?? {};
      resolve({ exitCode: code, text: result?.result ?? null, isError: result?.is_error ?? true, costUsd: result?.total_cost_usd ?? null,
        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0), outputTokens: usage.output_tokens ?? null,
        models: Object.keys(result?.modelUsage ?? {}) });
    });
  });
}

async function pool(tasks) {
  const results = new Array(tasks.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => { while (next < tasks.length) { const index = next++; results[index] = await tasks[index](); } }));
  return results;
}

const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFKC');
function grade(question, text) {
  // Some models wrap the JSON in a code fence; take the first JSON object.
  let answer = text; try { answer = JSON.parse(String(text).match(/\{[\s\S]*\}/u)[0]).answer; } catch { /* grade raw text */ }
  const normalized = normalize(answer);
  const accepted = question.accept.some((token) => normalized.includes(token));
  const rejected = question.reject.some((token) => normalized.includes(token));
  return { answer, correct: accepted && !rejected };
}

// ── Run ─────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
for (const [name, condition] of Object.entries(conditions)) fs.writeFileSync(path.join(outDir, `context-${name}.txt`), `${condition.text}\n`);

// Token measurement: memory block vs. empty block, same wrapper and question.
const probeQuestion = 'Reply with {"answer": "ok"}.';
const [empty, ...measured] = await pool([() => ask(prompt('', probeQuestion)), ...Object.values(conditions).map((condition) => () => ask(prompt(condition.text, probeQuestion)))]);
const contextTokens = Object.fromEntries(Object.keys(conditions).map((name, index) => [name, measured[index].inputTokens - empty.inputTokens]));

const jobs = [];
for (let rep = 1; rep <= reps; rep++) for (const [name, condition] of Object.entries(conditions)) for (const question of questions) {
  jobs.push(async () => { const response = await ask(prompt(condition.text, question.question)); return { rep, condition: name, questionId: question.id, ...grade(question, response.text), ...response }; });
}
const calls = await pool(jobs);
fs.writeFileSync(path.join(outDir, 'calls.jsonl'), calls.map((call) => JSON.stringify(call)).join('\n') + '\n');

const summary = {
  format: 'openlunum-consumer-memory-qa/0.1', status: 'diagnostic-development-only, self-reviewed',
  model: { requested: model, served: [...new Set(calls.flatMap((call) => call.models))] }, tokenizer: 'provider-reported input tokens of the served model (memory block minus empty block)',
  ledger: path.relative(root, path.resolve(ledgerPath)), ledgerSha256: sha256(fs.readFileSync(path.resolve(ledgerPath))), questionsSha256: sha256(fs.readFileSync(QUESTIONS)),
  codeCommit: (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  reps, questions: questions.length, failedCalls: calls.filter((call) => call.isError || call.text == null).length,
  totalCostUsd: Number([empty, ...measured, ...calls].reduce((sum, call) => sum + (call.costUsd ?? 0), 0).toFixed(4)),
  conditions: Object.fromEntries(Object.keys(conditions).map((name) => {
    const perRep = Array.from({ length: reps }, (_, index) => calls.filter((call) => call.condition === name && call.rep === index + 1).filter((call) => call.correct).length);
    const wrong = [...new Set(calls.filter((call) => call.condition === name && !call.correct).map((call) => call.questionId))];
    return [name, { contextTokens: contextTokens[name], contextChars: conditions[name].text.length, coverage: conditions[name].coverage, correctPerRep: perRep, min: Math.min(...perRep), max: Math.max(...perRep), wrongQuestions: wrong }];
  })),
};
fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
