#!/usr/bin/env node
// Scorer for the ADR 0029 held-out test (PREREGISTRATION.md, bars 1, 2 and 5; bar 3 is judge.mjs,
// bar 4 is the replay and the suite scan). Offline, no model call.
//   node score.mjs --requests <requests.jsonl> --runs dir[,dir-rest] [--out result.json]
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from '../parallel-document-v1/score-structure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const DEICTIC = new Set(['speaker', 'speakers', 'addressee', 'addressees']);
const AGENTISH = ['agent', 'experiencer', 'subject', 'actor'];

export function deicticAgent(sem) {
  const top = sem?.clauses?.[0]?.roles ?? {};
  return AGENTISH.some((k) => { const t = top[k]; return t && typeof t === 'object' && DEICTIC.has(String(t.id ?? t.value ?? '').toLowerCase()); });
}

export function score(pairs, requests, rows) {
  const rec = (h) => record(requests.get(h), rows.get(h));
  const per = pairs.map((p) => {
    const en = rec(p.en); const el = rec(p.el);
    const cov = (r) => !!r && !r.copy;
    return { pair: p.pair, source: p.source, group: p.group ?? null, enCovered: cov(en), elCovered: cov(el),
      sameStructure: cov(en) && cov(el) ? en.structure === el.structure : null, sameIdentity: cov(en) && cov(el) ? en.lfp === el.lfp : null,
      elDeictic: cov(el) ? deicticAgent(el.sem) : null, enDeictic: cov(en) ? deicticAgent(en.sem) : null,
      elInvalid: !rows.get(p.el)?.evidenceValid, enInvalid: !rows.get(p.en)?.evidenceValid };
  });
  const enCov = per.filter((r) => r.enCovered).length; const elCov = per.filter((r) => r.elCovered).length;
  const both = per.filter((r) => r.enCovered && r.elCovered);
  const same = both.filter((r) => r.sameStructure).length;
  const pro = both.filter((r) => r.group === 'deictic');
  return {
    pairs: per.length, coverage: { en: enCov, el: elCov }, invalid: { en: per.filter((r) => r.enInvalid).length, el: per.filter((r) => r.elInvalid).length },
    bar1: { elAtLeastHalfOfEn: elCov >= enCov / 2, elAtLeast15: elCov >= 15, pass: elCov >= enCov / 2 && elCov >= 15 },
    bar2: { bothCovered: both.length, sameStructure: same, rate: both.length ? same / both.length : null, pass: both.length >= 15 && same / both.length >= 0.6,
      proDropPairs: { bothCovered: pro.length, sameStructure: pro.filter((r) => r.sameStructure).length } },
    levelC: { bothCovered: both.length, sameIdentity: both.filter((r) => r.sameIdentity).length },
    bar5: { deicticPairsElCovered: per.filter((r) => r.group === 'deictic' && r.elCovered).length,
      elDeicticAgent: per.filter((r) => r.group === 'deictic' && r.elDeictic).length, enDeicticAgent: per.filter((r) => r.group === 'deictic' && r.enDeictic).length },
    perPair: per,
  };
}

async function main() {
  const requests = new Map(J(arg('--requests')).map((r) => [r.handle, r]));
  const rows = new Map();
  for (const d of arg('--runs').split(',')) for (const r of J(`${d}/run-ledger.jsonl`)) if (!rows.has(r.handle) || !rows.get(r.handle).evidenceValid || !['parse', 'abstain'].includes(rows.get(r.handle).status)) rows.set(r.handle, r);
  const { pairs } = JSON.parse(fs.readFileSync(join(here, 'pairs.json'), 'utf8'));
  const out = score(pairs, requests, rows);
  fs.writeFileSync(arg('--out', '/dev/stdout'), JSON.stringify(out, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
