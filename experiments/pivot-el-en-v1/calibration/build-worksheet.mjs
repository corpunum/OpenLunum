#!/usr/bin/env node
// Builds items.jsonl (full, with private answer key) and WORKSHEET-owner.md (what the owner sees) from
// candidates.json + roundtrip-raw.jsonl. No model call. Deterministic (order seed below).
//   node experiments/pivot-el-en-v1/calibration/build-worksheet.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const here = new URL('./', import.meta.url).pathname;
const sha = (t) => createHash('sha256').update(t).digest('hex');
const ORDER_SEED = 'pivot-el-en-v1:calibration:order:2026-10-22';
const cands = JSON.parse(fs.readFileSync(here + 'candidates.json', 'utf8'));
const byCand = Object.fromEntries([...cands.normal, ...cands.control].map((c) => [c.cand, c]));
const rt = Object.fromEntries(fs.readFileSync(here + 'roundtrip-raw.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.cand, r]));

// Known meaning changes injected into the round-tripped Greek (controls). Deterministic string edits.
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const EDITS = {
  negation_flip: (g) => { const m = /(^|\s)([Δδ]εν)\s+/u.exec(g); if (!m) return null; const before = g.slice(0, m.index + m[1].length); let after = g.slice(m.index + m[0].length); if (before.trim() === '' ) after = cap(after); return before + after; },
  may_to_must: (g) => { const r = /μπορ(ώ|είς|εί|ούμε|είτε|ούν)\s+να/iu; return r.test(g) && !/(^|\s)[Δδ]εν\s/u.test(g) ? g.replace(r, (m) => (m[0] === 'Μ' ? 'Πρέπει να' : 'πρέπει να')) : null; },
  must_to_may: (g) => { const r = /πρέπει να/iu; return r.test(g) && !/(^|\s)[Δδ]εν\s/u.test(g) ? g.replace(r, (m) => (m[0] === 'Π' ? 'Μπορεί να' : 'μπορεί να')) : null; },
  number_change: (g) => { const m = /\d+/.exec(g); if (!m) return null; const n = Number(m[0]); return g.replace(m[0], String(n === 1 ? 3 : n + 2)); },
};
const KIND_ORDER = ['negation_flip', 'may_to_must', 'must_to_may', 'number_change', 'negation_flip', 'may_to_must', 'must_to_may', 'negation_flip'];
const used = new Set(); const controls = [];
for (const kind of KIND_ORDER) {
  if (controls.length === 8) break;
  for (const c of cands.control) {
    const r = rt[c.cand]; if (used.has(c.cand) || !r?.hop2 || r.hop2Guards?.pass === false) continue;
    const edited = EDITS[kind](r.hop2.translation); if (!edited || edited === r.hop2.translation) continue;
    used.add(c.cand); controls.push({ cand: c.cand, kind, shown: edited }); break;
  }
}
const normals = cands.normal.filter((c) => rt[c.cand]?.hop2).slice(0, 40 - controls.length);
const rows = [...normals.map((c) => ({ cand: c.cand })), ...controls].map((x) => {
  const c = byCand[x.cand], r = rt[x.cand];
  return { cand: x.cand, source: 'tatoeba-eng-ell-2026-10', attribution: c.attribution, greekOriginal: c.el, humanEnglishNotShown: c.en, pivotEnglish: r.hop1.translation, pivotFlags: r.hop1.flags, pivotAmbiguous: r.hop1.ambiguous,
    roundTripGreek: r.hop2.translation, hop1GuardPass: r.hop1Guards?.pass ?? null, hop1GuardFailures: r.hop1Guards?.failures ?? null, hop2GuardPass: r.hop2Guards?.pass ?? null, hop2GuardFailures: r.hop2Guards?.failures ?? null,
    isControl: !!x.kind, controlKind: x.kind ?? null, shownGreek: x.kind ? x.shown : r.hop2.translation, model: r.model, promptVersion: r.promptVersion };
}).sort((a, b) => { const p = sha(`${ORDER_SEED}:${a.cand}`), q = sha(`${ORDER_SEED}:${b.cand}`); return p < q ? -1 : 1; })
  .map((r, i) => ({ id: i + 1, ...r }));
fs.writeFileSync(here + 'items.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const head = `<!-- lunum-greek-calibration-v1 | items=${rows.length} | pool: Tatoeba EN-EL (datasets/third-party/tatoeba-eng-ell-2026-10), minus the 160 held-out and 20 dev pairs of pivot-el-en-v1 and minus any sentence found elsewhere in the repository; deterministic sha256 order, seed "${cands.seed}"; Greek 4-14 words; round trip EL->EN->EL by Qwen (pivot-translate/0.1) -->
# Έλεγχος νοήματος / Meaning check — ${rows.length} ζεύγη / pairs

**Τι κάνεις (περίπου 20 λεπτά, ~30 δευτ. ανά ζεύγος).** Για κάθε αριθμό διάβασε τις δύο ελληνικές προτάσεις: το **Πρωτότυπο** και το **Μετά**. Ρώτα: *έχουν το ίδιο νόημα;* Βάλε \`x\` σε ένα κουτάκι (π.χ. \`[x]\`). Δεν μας νοιάζει η ομορφιά ή η γραμματική, μόνο **ποιος κάνει τι, σε ποιον, αν αρνείται, αν επιτρέπεται ή είναι υποχρέωση, αριθμοί, ονόματα**. Αν διαλέξεις «σχεδόν ίδιο», γράψε στη γραμμή τι χάθηκε. Μην ψάξεις και μη ρωτήσεις κανέναν: η πρώτη σου κρίση μετράει. Κάποια ζεύγη είναι σκόπιμα λάθος και κάποια σωστά.

**What to do (about 20 min).** For each number, compare the two Greek sentences: **Original** vs **After**. Do they mean the same? Put an \`x\` in one box (\`[x]\`). Ignore style and grammar; judge only who does what to whom, negation, may/must, numbers, names. If you pick "mostly same", write what was lost. Go with your first judgement. Some pairs are deliberately wrong, some are fine.

**Επιστροφή / Return:** κατέβασε αυτό το αρχείο, συμπλήρωσε τα \`[ ]\`, στείλ' το πίσω ως έχει. / Download, fill the \`[ ]\`, send it back as-is.

Κωδικοί / codes: **ίδιο** = same · **σχεδόν ίδιο** = mostly same · **διαφορετικό** = different · **δεν ξέρω** = can't tell

---
`;
const body = rows.map((r) => `## ${r.id}

Πρωτότυπο: **${r.greekOriginal}**

Μετά: **${r.shownGreek}**

Ίδιο νόημα;
- [ ] ίδιο
- [ ] σχεδόν ίδιο, χάθηκε: 
- [ ] διαφορετικό
- [ ] δεν ξέρω

Σχόλιο: 
`).join('\n');
fs.writeFileSync(here + 'WORKSHEET-owner.md', head + '\n' + body + '\n');
console.log({ items: rows.length, controls: controls.map((c) => `${c.cand}:${c.kind}`), guardFailHop2: rows.filter((r) => r.hop2GuardPass === false).length, identicalRT: rows.filter((r) => !r.isControl && r.roundTripGreek === r.greekOriginal).length });
