#!/usr/bin/env node
// A3 bar 3, builder half: every lunum_build_candidate input recorded in the repository's raw streams, rebuilt with the
// current core. Run with --emit before the 0.21 change (golden), and with --check after it: every input without a string
// on a lexicalVerb role (assert.action) must build the identical Sem (or the identical error). Offline, no model call.
//   node experiments/coverage-a3-v1/rebuild-check.mjs --emit  experiments/coverage-a3-v1/rebuild-golden.jsonl
//   node experiments/coverage-a3-v1/rebuild-check.mjs --check experiments/coverage-a3-v1/rebuild-golden.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildCandidateSem } from '../../packages/core/dist/src/index.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const files = execFileSync('git', ['ls-files', '-z', '--', '*.jsonl'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);

const inputs = new Map();
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  if (!text.includes('lunum_build_candidate')) continue;
  for (const line of text.split('\n')) {
    if (!line.includes('lunum_build_candidate')) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    for (const c of ev?.message?.content ?? []) {
      if (c?.type === 'tool_use' && /lunum_build_candidate$/u.test(c.name ?? '') && c.input && typeof c.input === 'object') {
        const s = JSON.stringify(c.input); inputs.set(sha(s), s);
      }
    }
  }
}
const stringOnLexicalVerb = (input) => [input, ...(Array.isArray(input.also) ? input.also : [])]
  .some((cl) => cl && cl.predicate === 'assert' && cl.roles && typeof cl.roles === 'object' && typeof cl.roles.action === 'string');
const build = (s) => { try { return { ok: true, out: JSON.stringify(buildCandidateSem(JSON.parse(s)).sem) }; } catch (e) { return { ok: false, out: String(e.message) }; } };

const rows = [...inputs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, s]) => ({ key, stringAction: stringOnLexicalVerb(JSON.parse(s)), ...build(s) }));
if (arg('--emit')) {
  fs.writeFileSync(arg('--emit'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log({ files: files.length, inputs: rows.length, stringAction: rows.filter((r) => r.stringAction).length, built: rows.filter((r) => r.ok).length });
} else if (arg('--check')) {
  const golden = new Map(fs.readFileSync(arg('--check'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.key, r]));
  const now = new Map(rows.map((r) => [r.key, r]));
  const missing = [...golden.keys()].filter((k) => !now.has(k));
  const moved = [...golden.values()].filter((g) => now.has(g.key) && !g.stringAction && (now.get(g.key).ok !== g.ok || now.get(g.key).out !== g.out)).map((g) => g.key);
  const stringActionNowBuilt = [...golden.values()].filter((g) => g.stringAction && now.get(g.key)?.ok).length;
  const out = { inputs: golden.size, missing: missing.length, movedWithoutStringAction: moved, stringAction: [...golden.values()].filter((g) => g.stringAction).length, stringActionNowBuilt, pass: missing.length === 0 && moved.length === 0 };
  console.log(JSON.stringify(out, null, 1)); if (!out.pass) process.exitCode = 1;
} else throw new Error('usage: --emit file | --check file');
