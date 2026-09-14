import { readFileSync } from 'node:fs';
import { createMorphologyAugmentedProvider, createOmwProvider, importOmwTab } from '../../packages/core/dist/src/grounding-provider.js';

const root = process.env.OPENLUNUM_OMW_ROOT ?? '/tmp/openlunum-omw.GONbNp/data';
const ciliRoot = process.env.OPENLUNUM_CILI_ROOT ?? '/tmp/openlunum-cili-v1.0.kPBzyI/data';
const uniRoot = process.env.OPENLUNUM_UNIMORPH_ROOT ?? '/tmp/openlunum-unimorph.oLd9sO';
const files = { en: ['eng', 'wns/eng/wn-data-eng.tab'], el: ['ell', 'wns/ell/wn-data-ell.tab'], es: ['spa', 'wns/mcr/wn-data-spa.tab'], fr: ['fra', 'wns/fra/wn-data-fra.tab'], id: ['ind', 'wns/msa/wn-data-ind.tab'] };
const proposal = (key) => ({ path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'lex', key }, modifiers: [] });
const ili = new Map();
for (const line of readFileSync(`${ciliRoot}/ili-map-pwn30.tab`, 'utf8').split(/\r?\n/u)) {
  const fields = line.split('\t');
  if (fields.length >= 2 && fields[0] && fields[1] && !fields[0].startsWith('#')) ili.set(fields[1], fields[0]);
}
const report = { type: 'development-unimorph-grounding-probe', version: 1, samplePerLanguage: 500, languages: {} };
for (const [language, [repository, omwFile]] of Object.entries(files)) {
  const imported = importOmwTab(readFileSync(`${root}/${omwFile}`, 'utf8'), { language, source: 'omw-data/v2.0', synsetToInterlingualId: ili });
  const base = createOmwProvider({ version: 'omw-data/v2.0+cili/v1.0', records: imported.records });
  const forms = new Map();
  for (const line of readFileSync(`${uniRoot}/${repository}/${repository}`, 'utf8').split(/\r?\n/u)) {
    const [lemma, surface, rawTag] = line.split('\t');
    if (!lemma || !surface || !rawTag || lemma === surface) continue;
    const tag = rawTag.toUpperCase();
    const partOfSpeech = tag.startsWith('V') ? 'verb' : tag.startsWith('N') ? 'noun' : tag.startsWith('ADJ') ? 'adjective' : undefined;
    if (!partOfSpeech) continue;
    const candidates = forms.get(surface) ?? [];
    if (!candidates.some((candidate) => candidate.lemma === lemma && candidate.partOfSpeech === partOfSpeech)) candidates.push({ lemma, partOfSpeech, evidence: [`unimorph:${repository}`] });
    forms.set(surface, candidates);
  }
  const analyzer = { analyzer: 'unimorph', analyzerVersion: repository, snapshotHash: 'a'.repeat(64), analyze: ({ surface, partOfSpeech }) => (forms.get(surface) ?? []).filter((candidate) => !partOfSpeech || candidate.partOfSpeech === partOfSpeech) };
  const augmented = createMorphologyAugmentedProvider({ base, analyzer });
  let sample = 0; let rawExact = 0; let morphologyExact = 0; let ambiguous = 0; const groundedForms = [];
  for (const [surface, candidates] of forms) {
    if (sample >= 500) break;
    const gold = candidates.find((candidate) => base.resolve({ proposal: proposal(candidate.lemma), language, partOfSpeech: candidate.partOfSpeech }).status === 'resolved_exact');
    if (!gold) continue;
    const raw = base.resolve({ proposal: proposal(surface), language, partOfSpeech: gold.partOfSpeech });
    const resolved = augmented.resolve({ proposal: proposal(surface), language, partOfSpeech: gold.partOfSpeech });
    sample++; if (raw.status === 'resolved_exact') rawExact++; if (resolved.status === 'resolved_exact') { morphologyExact++; groundedForms.push({ surface, identity: resolved.candidates[0].externalId }); } if (resolved.status === 'ambiguous') ambiguous++;
  }
  let safetyPairs = 0; let falseEquivalences = 0;
  for (let leftIndex = 0; leftIndex < groundedForms.length && safetyPairs < 25; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < groundedForms.length && safetyPairs < 25; rightIndex++) {
      const left = groundedForms[leftIndex]; const right = groundedForms[rightIndex];
      if (left.identity === right.identity) continue;
      safetyPairs++;
      const leftAgain = augmented.resolve({ proposal: proposal(left.surface), language, partOfSpeech: undefined });
      const rightAgain = augmented.resolve({ proposal: proposal(right.surface), language, partOfSpeech: undefined });
      if (leftAgain.status === 'resolved_exact' && rightAgain.status === 'resolved_exact' && leftAgain.candidates[0].externalId === rightAgain.candidates[0].externalId) falseEquivalences++;
    }
  }
  report.languages[language] = { surfaceCandidates: forms.size, sample, rawExact, morphologyExact, ambiguous, safetyPairs, falseEquivalences };
}
console.log(JSON.stringify(report, null, 2));
