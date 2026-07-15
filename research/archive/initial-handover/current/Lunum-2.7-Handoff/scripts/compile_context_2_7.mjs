#!/usr/bin/env node
import fs from 'node:fs';

function arg(name, fallback=null) {
  const i = process.argv.indexOf(`--${name}`);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i+1] : fallback;
}

const memoriesPath = arg('memories', 'corpus/sample_memories_2_7.jsonl');
const configPath = arg('config', 'config/lunum_2_7_config.json');
const outPath = arg('out', 'reports/context_compile_2_7.json');

function readJsonl(path) { return fs.readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function roughTokens(text) { return (String(text).match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []).length; }
function eligible(m, cfg) {
  const e = cfg.eligibility;
  if (!m.lunum_code) return false;
  if ((m.confidence ?? 0) < e.min_confidence) return false;
  if (!e.allowed_risk.includes(m.risk)) return false;
  if (e.blocked_categories.includes(m.category)) return false;
  if (!e.allowed_categories.includes(m.category)) return false;
  return true;
}
function compile(memories, mode, cfg) {
  const lines = memories.map(m => {
    if (mode === 'natural') return `- ${m.text}`;
    if (mode === 'lunum') return `- ${m.lunum_code}`;
    return `- ${eligible(m, cfg) ? m.lunum_code : m.text}`;
  });
  const text = `Memory:\n${lines.join('\n')}`;
  return { mode, text, rough_tokens: roughTokens(text) };
}

const memories = readJsonl(memoriesPath);
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const natural = compile(memories, 'natural', cfg);
const lunum = compile(memories, 'lunum', cfg);
const mixed = compile(memories, 'mixed', cfg);
const eligibility = memories.map(m => ({id:m.id,category:m.category,risk:m.risk,confidence:m.confidence,eligible:eligible(m,cfg),chosen_mode:eligible(m,cfg)?'lunum':'natural'}));
const report = {generated_at:new Date().toISOString(),version:'2.7',memory_count:memories.length,contexts:{natural,lunum,mixed},ratios:{lunum:lunum.rough_tokens/natural.rough_tokens,mixed:mixed.rough_tokens/natural.rough_tokens},eligibility};
fs.mkdirSync(outPath.split('/').slice(0,-1).join('/') || '.', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ratios: report.ratios, tokens: { natural: natural.rough_tokens, lunum: lunum.rough_tokens, mixed: mixed.rough_tokens }}, null, 2));
