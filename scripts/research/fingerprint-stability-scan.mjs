#!/usr/bin/env node
// Identity-stability scan used by ADRs 0007-0011: fingerprint every Lunum-Sem
// object found in the repository's JSON/JSONL data with two core builds and
// compare. Scope: datasets, experiments, test-fixtures, protected-eval, reports.
// Counts depend on scope and on which files exist at the time of the scan.
//   node scripts/research/fingerprint-stability-scan.mjs <old core dist index.js> <new core dist index.js> <repo root>
// Build the old core in a separate checkout (git worktree or clone at the old commit).
import fs from 'node:fs'; import path from 'node:path';
const [oldIdx, newIdx, root] = process.argv.slice(2);
const O = await import(oldIdx), N = await import(newIdx);
let total = 0, same = 0, diff = [], oldOnly = 0, newOnly = 0;
function fp(M, sem) { try { const s = M.submitCandidate({ sourceText: '', candidateSem: sem, provenance: { extractorType: 'other' } }); return s.semanticFingerprint; } catch { return null; } }
function visit(v) { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) return v.forEach(visit);
  if (typeof v.schema === 'string' && v.schema.startsWith('lunum-sem') && Array.isArray(v.clauses)) { total++; const a = fp(O, v), b = fp(N, v);
    if (a && b) { a === b ? same++ : diff.push(JSON.stringify(v).slice(0, 160)); } else if (a) { oldOnly++; const s = N.submitCandidate({ sourceText: "", candidateSem: v, provenance: { extractorType: "other" } }); (globalThis.reasons ??= {})[s.diagnostics.join("|").slice(0,90)] = ((globalThis.reasons ?? {})[s.diagnostics.join("|").slice(0,90)] ?? 0) + 1; } else if (b) newOnly++; }
  for (const x of Object.values(v)) visit(x); }
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p); } else if (/\.jsonl?$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); for (const l of (e.name.endsWith('.jsonl') ? t.split('\n').filter(Boolean) : [t])) { try { visit(JSON.parse(l)); } catch {} } } } }
for (const d of ['datasets', 'experiments', 'test-fixtures', 'protected-eval', 'reports']) walk(path.join(root, d));
console.log({ total, identityInBoth: same + diff.length, identical: same, changed: diff.length, identityOnlyOld: oldOnly, identityOnlyNew: newOnly }); diff.slice(0, 5).forEach((x) => console.log(' CHANGED', x));
console.log(globalThis.reasons);
