#!/usr/bin/env node
/**
 * Offline replay for decisions/0020: every recorded candidate in the repository
 * (candidate ledgers with a source text, or a handle resolvable through the
 * request file next to the ledger) is submitted to two builds of core, the
 * baseline and the current one, and every change in identity is listed.
 * No provider or model calls. Frozen evidence is only read.
 *
 * Usage: node scripts/research/replay-literal-retention-0020.mjs <baseline-core-index.js> [out.json]
 *   baseline-core-index.js: packages/core/dist/src/index.js built from the
 *   commit before 0020 (for example a detached worktree of origin/main).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [baselinePath, outPath] = process.argv.slice(2);
if (!baselinePath) throw new Error('usage: replay-literal-retention-0020.mjs <baseline-core-index.js> [out.json]');
const root = process.cwd();
const current = await import(pathToFileURL(path.join(root, 'packages/core/dist/src/index.js')).href);
const baseline = await import(pathToFileURL(path.resolve(baselinePath)).href);

const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => /(candidate-ledger|run-ledger)[\w-]*\.jsonl$/u.test(f) && !/raw-candidate-ledger/u.test(f));

function requestsNear(file) {
  const map = new Map();
  for (const name of ['source-only-request.jsonl', 'requests.jsonl', 'request.jsonl']) {
    for (const dir of [path.dirname(file), path.dirname(path.dirname(file))]) {
      const candidate = path.join(dir, name);
      if (!fs.existsSync(candidate)) continue;
      for (const line of fs.readFileSync(candidate, 'utf8').split('\n').filter(Boolean)) {
        try { const row = JSON.parse(line); if (row.handle && row.sourceText) map.set(row.handle, row); } catch { /* not a request row */ }
      }
    }
  }
  return map;
}

const provenance = { extractorType: 'agent', extractorId: 'replay-0020' };
const rows = [];
const seen = new Set();
for (const file of files) {
  const requests = requestsNear(path.join(root, file));
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter(Boolean)) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    const sem = row.candidateSem ?? row.sem ?? null;
    if (!sem || typeof sem !== 'object' || !Array.isArray(sem.clauses)) continue;
    const sourceText = row.sourceText ?? requests.get(row.handle)?.sourceText ?? null;
    if (!sourceText) continue;
    const key = `${sourceText}\u0000${JSON.stringify(sem)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const run = (core) => {
      try {
        const r = core.submitCandidate({ sourceText, candidateSem: sem, provenance });
        return { identity: r.semanticFingerprint, failureClass: r.failureClass, retention: r.literalRetention };
      } catch (error) { return { identity: null, failureClass: `error:${String(error?.message || error).slice(0, 80)}` }; }
    };
    const before = run(baseline);
    const after = run(current);
    rows.push({ file, handle: row.handle ?? row.id ?? null, sourceText, before: before.identity, after: after.identity, beforeFailure: before.failureClass, afterFailure: after.failureClass,
      missingNumbers: after.retention?.missingNumbers ?? [], missingRelativeTimes: after.retention?.missingRelativeTimes ?? [],
      sourceRelativeTimes: after.retention?.sourceRelativeTimes ?? [] });
  }
}
const changed = rows.filter((r) => r.before !== r.after);
const summary = {
  format: 'openlunum-literal-retention-replay/0020',
  ledgers: files.length,
  uniqueCandidates: rows.length,
  identitiesBefore: rows.filter((r) => r.before).length,
  identitiesAfter: rows.filter((r) => r.after).length,
  withdrawn: changed.filter((r) => r.before && !r.after).length,
  gained: changed.filter((r) => !r.before && r.after).length,
  fingerprintChanged: changed.filter((r) => r.before && r.after).length,
  sourcesWithRelativeTimes: rows.filter((r) => r.sourceRelativeTimes.length).length,
  changes: changed,
  newModelCalls: 0,
};
const text = `${JSON.stringify(summary, null, 2)}\n`;
if (outPath) fs.writeFileSync(outPath, text, { flag: 'wx' });
console.log(JSON.stringify({ ...summary, changes: changed.map((r) => ({ file: r.file, handle: r.handle, sourceText: r.sourceText, before: Boolean(r.before), after: Boolean(r.after), missingNumbers: r.missingNumbers, missingRelativeTimes: r.missingRelativeTimes })) }, null, 2));
