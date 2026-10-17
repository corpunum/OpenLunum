#!/usr/bin/env node
// Replays every recorded candidate / identity-bearing Sem in the repo (plus the golden inputs) through two
// builds of packages/core and proves no identity moved for inputs without the forbidden keys.
// Usage: node scripts/replay-lfp21-identity.mjs <old dist/src> <new dist/src>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const [oldDir, newDir] = process.argv.slice(2).map((d) => path.resolve(d));
const load = async (d) => import(pathToFileURL(path.join(d, 'index.js')).href);
const oldM = await load(oldDir);
const newM = await load(newDir);
const run = (m, sem) => {
  const o = {};
  for (const [k, f] of [['lfp21', m.semanticFingerprint], ['lfp01', m.fingerprintSem]]) { try { o[k] = f(sem); } catch { o[k] = 'REJECT'; } }
  return o;
};
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const hasForbidden = (v) => v && typeof v === 'object' && (Array.isArray(v) ? v.some(hasForbidden) : Object.keys(v).some((k) => FORBIDDEN.has(k) || hasForbidden(v[k])));
const seen = new Map();
function visit(v) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach(visit); return; }
  if (typeof v.schema === 'string' && v.schema.startsWith('lunum-sem') && Array.isArray(v.clauses)) seen.set(JSON.stringify(v), v);
  for (const x of Object.values(v)) visit(x);
}
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', '.git', 'target'].includes(e.name)) walk(p); }
    else if (/\.jsonl?$/u.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      for (const l of (e.name.endsWith('.jsonl') ? t.split('\n') : [t])) { if (!l) continue; try { visit(JSON.parse(l)); } catch { /* not json */ } }
    }
  }
}
const goldenPath = `${root}eval-results/golden-vectors/lfp21-golden.json`;
for (const d of fs.readdirSync(root, { withFileTypes: true })) {
  if (d.isDirectory() && !d.name.startsWith('.') && !['node_modules', 'crates'].includes(d.name)) walk(root + d.name);
}
// walk() reads the golden too (inputs only; its own wrapper has no lunum-sem schema); add raw-JSON goldens explicitly.
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
for (const e of golden.entries) {
  const v = e.inputRaw !== undefined ? JSON.parse(e.inputRaw) : e.input;
  if (v && typeof v === 'object') seen.set(JSON.stringify(v), v);
}
let total = 0, accepted = 0, withForbidden = 0, changed = 0, changedClean = 0, unchangedAccepted = 0, acceptedThenRejected = 0;
for (const sem of seen.values()) {
  total++;
  const a = run(oldM, sem);
  const b = run(newM, sem);
  const forb = hasForbidden(sem);
  if (forb) withForbidden++;
  if (a.lfp21 !== 'REJECT') accepted++;
  if (a.lfp21 === b.lfp21 && a.lfp01 === b.lfp01) { if (a.lfp21 !== 'REJECT') unchangedAccepted++; continue; }
  changed++;
  if (!forb) { changedClean++; console.error('CHANGED without forbidden key:', JSON.stringify(sem).slice(0, 300)); }
  if (a.lfp21 !== 'REJECT' && b.lfp21 === 'REJECT') acceptedThenRejected++;
}
const out = { distinctInputs: total, acceptedByOld: accepted, unchangedAccepted, inputsWithForbiddenKeys: withForbidden, changedInputs: changed, changedWithoutForbiddenKey: changedClean, acceptedThenRejected };
console.log(JSON.stringify(out, null, 2));
if (changedClean) process.exit(1);
