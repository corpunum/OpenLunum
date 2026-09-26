// Independent evaluator scan: fingerprint every Sem-like object in tracked JSON/JSONL
// with a given core build; outputs {key: fingerprint|null}.
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const [coreIndex, repo, out] = process.argv.slice(2);
const core = await import(coreIndex);
const files = execSync('git ls-files', { cwd: repo }).toString().split('\n').filter(f => /\.(json|jsonl)$/.test(f) && !f.includes('node_modules'));
const res = {}; let n = 0;
const visit = (o, file, path) => {
  if (!o || typeof o !== 'object') return;
  if (!Array.isArray(o) && Array.isArray(o.clauses) && typeof o.world === 'string' && o.kind) {
    let fp = null;
    try { const s = core.submitCandidate({ sourceText: 'x', sourceLanguage: 'en', candidateSem: o, provenance: { extractorType: 'other', timestamp: '1970-01-01T00:00:00.000Z' } });
          fp = s.candidateIdentityAvailable ? s.semanticFingerprint : null; } catch { fp = 'THROW'; }
    res[file + '#' + path] = fp; n++; return;
  }
  for (const [k, v] of Object.entries(o)) visit(v, file, path + '/' + k);
};
for (const f of files) {
  const text = fs.readFileSync(repo + '/' + f, 'utf8');
  const docs = f.endsWith('.jsonl') ? text.split('\n').filter(Boolean) : [text];
  docs.forEach((d, i) => { try { visit(JSON.parse(d), f, String(i)); } catch {} });
}
fs.writeFileSync(out, JSON.stringify(res)); console.log('sem objects', n);
