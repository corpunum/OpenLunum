import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMorphologyAugmentedProvider, createOmwProvider, importOmwTab } from '../../packages/core/dist/src/grounding-provider.js';

const root = process.env.OPENLUNUM_OMW_ROOT ?? '/tmp/openlunum-omw.GONbNp/data';
const ciliRoot = process.env.OPENLUNUM_CILI_ROOT ?? '/tmp/openlunum-cili-v1.0.kPBzyI/data';
const uniRoot = process.env.OPENLUNUM_UNIMORPH_ROOT ?? '/tmp/openlunum-unimorph.oLd9sO';
const sampleSize = Number(process.env.OPENLUNUM_MORPH_SAMPLE ?? 500);
const files = { en: ['eng', 'wns/eng/wn-data-eng.tab'], el: ['ell', 'wns/ell/wn-data-ell.tab'], es: ['spa', 'wns/mcr/wn-data-spa.tab'], fr: ['fra', 'wns/fra/wn-data-fra.tab'], id: ['ind', 'wns/msa/wn-data-ind.tab'] };
const proposal = (key) => ({ path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'lex', key }, modifiers: [] });
const map = new Map();
for (const line of readFileSync(`${ciliRoot}/ili-map-pwn30.tab`, 'utf8').split(/\r?\n/u)) {
  const fields = line.split('\t');
  if (fields.length >= 2 && fields[0] && fields[1] && !fields[0].startsWith('#')) map.set(fields[1], fields[0]);
}
const report = { type: 'development-unimorph-unbiased-grounding', version: 2, status: 'coverage-diagnostic-not-independent-accuracy', sampleSize, languages: {} };
for (const [language, [repository, omwFile]] of Object.entries(files)) {
  const imported = importOmwTab(readFileSync(`${root}/${omwFile}`, 'utf8'), { language, source: 'omw-data/v2.0', synsetToInterlingualId: map });
  const base = createOmwProvider({ version: 'omw-data/v2.0+cili/v1.0', records: imported.records });
  const unimorphText = readFileSync(`${uniRoot}/${repository}/${repository}`, 'utf8');
  const unimorphSnapshotHash = createHash('sha256').update(unimorphText).digest('hex');
  const observations = new Map();
  for (const line of unimorphText.split(/\r?\n/u)) {
    const [lemma, surface, rawTag] = line.split('\t');
    if (!lemma || !surface || !rawTag || lemma === surface) continue;
    const tag = rawTag.toUpperCase();
    const partOfSpeech = tag.startsWith('V') ? 'verb' : tag.startsWith('N') ? 'noun' : tag.startsWith('ADJ') ? 'adjective' : undefined;
    if (!partOfSpeech) continue;
    const key = `${surface}\u0000${partOfSpeech}`;
    const entries = observations.get(key) ?? [];
    if (!entries.some((entry) => entry.lemma === lemma)) entries.push({ lemma, partOfSpeech, evidence: [`unimorph:${repository}`] });
    observations.set(key, entries);
  }
  const analyzer = { analyzer: 'unimorph', analyzerVersion: repository, snapshotHash: unimorphSnapshotHash, analyze: ({ surface, partOfSpeech }) => (observations.get(`${surface}\u0000${partOfSpeech}`) ?? []) };
  const augmented = createMorphologyAugmentedProvider({ base, analyzer });
  const selected = [...observations.entries()].sort(([left], [right]) => createHash('sha256').update(left).digest('hex').localeCompare(createHash('sha256').update(right).digest('hex'), 'en')).slice(0, sampleSize);
  const counts = { total: selected.length, goldUnique: 0, rawIdentityAvailable: 0, rawCorrect: 0, candidateIdentityAvailable: 0, candidateCorrect: 0, candidateSetContainsGold: 0, ambiguous: 0, unresolved: 0, falsePositiveIdentity: 0, multiAnalysis: 0 };
  for (const [observationKey, entries] of selected) {
    const [surface, partOfSpeech] = observationKey.split('\u0000');
    const goldIds = new Set();
    for (const entry of entries) {
      const gold = base.resolve({ proposal: proposal(entry.lemma), language, partOfSpeech });
      for (const candidate of gold.candidates) goldIds.add(candidate.externalId);
    }
    const raw = base.resolve({ proposal: proposal(surface), language, partOfSpeech });
    const candidate = augmented.resolve({ proposal: proposal(surface), language, partOfSpeech });
    if (raw.status === 'resolved_exact') { counts.rawIdentityAvailable++; if (goldIds.size === 1 && goldIds.has(raw.candidates[0].externalId)) counts.rawCorrect++; }
    if (candidate.status === 'resolved_exact') { counts.candidateIdentityAvailable++; if (goldIds.size === 1 && goldIds.has(candidate.candidates[0].externalId)) counts.candidateCorrect++; else counts.falsePositiveIdentity++; }
    if (candidate.candidates.some((item) => goldIds.has(item.externalId))) counts.candidateSetContainsGold++;
    if (candidate.status === 'ambiguous') counts.ambiguous++; else if (candidate.status === 'unresolved') counts.unresolved++;
    if (goldIds.size === 1) counts.goldUnique++;
    if (entries.length > 1) counts.multiAnalysis++;
  }
  report.languages[language] = { repository, unimorphSnapshotHash, observationInventory: observations.size, surfaceInventory: new Set([...observations.keys()].map((key) => key.split('\u0000')[0])).size, counts, rates: { rawIdentityCoverage: counts.total ? counts.rawIdentityAvailable / counts.total : 0, rawExactAccuracyAll: counts.total ? counts.rawCorrect / counts.total : 0, candidateIdentityCoverage: counts.total ? counts.candidateIdentityAvailable / counts.total : 0, candidateExactAccuracyAll: counts.total ? counts.candidateCorrect / counts.total : 0, candidateSetRecallAll: counts.total ? counts.candidateSetContainsGold / counts.total : 0, ambiguityRate: counts.total ? counts.ambiguous / counts.total : 0, unresolvedRate: counts.total ? counts.unresolved / counts.total : 0, multiAnalysisRate: counts.total ? counts.multiAnalysis / counts.total : 0 } };
}
console.log(JSON.stringify(report, null, 2));
