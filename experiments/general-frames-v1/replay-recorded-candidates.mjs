// Replays every recorded candidate under experiments/ and reports/ through two builds of submitCandidate
// (before and after decisions/0024) and counts identities gained, withdrawn or changed.
//   node experiments/general-frames-v1/replay-recorded-candidates.mjs <new dist> <old dist>
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import crypto from 'node:crypto';
const [newDist, oldDist] = process.argv.slice(2);
const { submitCandidate: subNew } = await import(path.resolve(newDist, 'src/agent-native.js'));
const { submitCandidate: subOld } = await import(path.resolve(oldDist, 'src/agent-native.js'));
const files = execSync("find experiments reports -name '*.jsonl'", { encoding: 'utf8' }).trim().split('\n');
const sources = new Map(); // sourceSha256 -> {text, lang}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const cands = [];
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  let r; try { r = JSON.parse(line); } catch { continue; }
  if (typeof r.sourceText === 'string') sources.set(sha(r.sourceText), { text: r.sourceText, lang: r.sourceLanguage || 'en' });
  if (r.candidateSem && r.sourceSha256) cands.push(r);
}
const probes = [];
for (const f of execSync("find experiments reports -name '*.json'", { encoding: 'utf8' }).trim().split('\n')) {
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); const arr = Array.isArray(j) ? j : (j.probes || []); for (const p of arr) if (p && typeof p.text === 'string') sources.set(sha(p.text), { text: p.text, lang: p.language || p.sourceLanguage || 'en' }); } catch {}
}
let total = 0, noSource = 0, idBefore = 0, idAfter = 0, changed = 0, withdrawn = 0, gained = 0;
const seen = new Set();
for (const c of cands) {
  const key = c.sourceSha256 + JSON.stringify(c.candidateSem); if (seen.has(key)) continue; seen.add(key);
  const s = sources.get(c.sourceSha256); if (!s) { noSource++; continue; }
  total++;
  const prov = { extractorType: 'agent' };
  const o = subOld({ sourceText: s.text, sourceLanguage: s.lang, candidateSem: c.candidateSem, provenance: prov });
  const n = subNew({ sourceText: s.text, sourceLanguage: s.lang, candidateSem: c.candidateSem, provenance: prov });
  if (o.semanticFingerprint) idBefore++; if (n.semanticFingerprint) idAfter++;
  if (o.semanticFingerprint && !n.semanticFingerprint) withdrawn++;
  if (!o.semanticFingerprint && n.semanticFingerprint) gained++;
  if (o.semanticFingerprint && n.semanticFingerprint && o.semanticFingerprint !== n.semanticFingerprint) changed++;
}
console.log(JSON.stringify({ distinctCandidates: seen.size, replayed: total, noSource, idBefore, idAfter, withdrawn, gained, changed }));
