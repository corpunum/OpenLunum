#!/usr/bin/env node
// Builds the owner's review worksheet from a combine.mjs candidate table: per seed, the seed Greek to check,
// then the attested EN/EL pairs (exact evidence in at least one corpus), strongest first, at most 12.
//   node worksheet.mjs --candidates candidates.json --out WORKSHEET-v1.md
import fs from 'node:fs';
import { seeds } from './propose.mjs';
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const { corpora, rows } = JSON.parse(fs.readFileSync(arg('--candidates'), 'utf8'));
const short = (c) => c.includes('Europarl') ? 'EP' : c.includes('TED') ? 'TED' : 'OS';
const lines = (r) => Math.max(0, ...Object.values(r.evidence).map((e) => e.exactLines ?? 0));
const out = [
  '# Meaning clusters, review worksheet v1',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by [worksheet.mjs](worksheet.mjs) from the lemma-mode evidence (${corpora.map(short).join(', ')}: ${corpora.join('; ')}). **For the owner.** Pairs were proposed by Qwen and SuperGemma and are listed only when real translations attest them (at least 3 aligned lines with significant association in one corpus). Counts are aligned lines. Nothing here changes Lunum identity.`,
  '',
  'Mark each pair: **S** same meaning, **B** broader or narrower, **I** implies (for example «πάρε το 100» → "call the police"), **D** different, **X** not natural Greek. Correct the seed Greek where needed.',
  '',
];
for (const s of seeds()) {
  const attested = rows.filter((r) => r.seed === s.id && r.best === 'attested-exact' && !(r.en === s.en && r.el === s.el))
    .sort((a, b) => lines(b) - lines(a)).slice(0, 12);
  const seedRow = rows.find((r) => r.seed === s.id && r.en === s.en && r.el === s.el);
  out.push(`## ${s.id}: "${s.en}"`, '', `Seed Greek (AI-drafted): «${s.el}» — attested: ${seedRow?.best ?? 'not checked'}, ${seedRow ? lines(seedRow) : 0} lines. Correct? [ ] yes  [ ] no, better: ________`, '');
  if (!attested.length) { out.push('_No attested pairs in these corpora._', ''); continue; }
  out.push('| English | Greek | Lines | Corpora | Proposed by | S / B / I / D / X |', '|---|---|---|---|---|---|');
  for (const r of attested) {
    const where = Object.entries(r.evidence).filter(([, e]) => e.verdict === 'attested-exact').map(([c, e]) => `${short(c)} ${e.exactLines}`).join(', ');
    out.push(`| ${r.en} | ${r.el} | ${lines(r)} | ${where} | ${r.proposedBy.filter((m) => m !== 'seed').join(', ')} | |`);
  }
  out.push('');
}
fs.writeFileSync(arg('--out'), out.join('\n'));
console.log(`worksheet: ${seeds().length} seeds`);
