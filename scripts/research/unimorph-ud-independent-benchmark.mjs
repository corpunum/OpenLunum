/**
 * Development-only independent morphology audit.
 *
 * UD supplies held-out surface/lemma/UPOS annotations; UniMorph is only the
 * analyzer under test. OMW/CILI maps independently supplied gold lemmas to
 * identities. No Lunum benchmark gold or model endpoint is involved.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createOmwProvider, createMorphologyAugmentedProvider, importOmwTab } from '../../packages/core/dist/src/grounding-provider.js';

const udRoot = process.env.OPENLUNUM_UD_ROOT;
if (!udRoot) throw new Error('OPENLUNUM_UD_ROOT is required');
const omwRoot = process.env.OPENLUNUM_OMW_ROOT ?? '/tmp/openlunum-omw.GONbNp/data';
const ciliRoot = process.env.OPENLUNUM_CILI_ROOT ?? '/tmp/openlunum-cili-v1.0.kPBzyI/data';
const uniRoot = process.env.OPENLUNUM_UNIMORPH_ROOT ?? '/tmp/openlunum-unimorph.oLd9sO';
const perLanguage = Number(process.env.OPENLUNUM_UD_SAMPLE ?? 100);
const files = { en: ['English-EWT', 'en_ewt-ud-dev.conllu', 'eng', 'wns/eng/wn-data-eng.tab'], el: ['Greek-GDT', 'el_gdt-ud-dev.conllu', 'ell', 'wns/ell/wn-data-ell.tab'], es: ['Spanish-AnCora', 'es_ancora-ud-dev.conllu', 'spa', 'wns/mcr/wn-data-spa.tab'], fr: ['French-GSD', 'fr_gsd-ud-dev.conllu', 'fra', 'wns/fra/wn-data-fra.tab'], de: ['German-GSD', 'de_gsd-ud-dev.conllu', 'deu', 'wns/deu/wn-data-deu.tab'], id: ['Indonesian-GSD', 'id_gsd-ud-dev.conllu', 'ind', 'wns/msa/wn-data-ind.tab'] };
const posMap = { NOUN: 'noun', VERB: 'verb', ADJ: 'adjective' };
const proposal = (key) => ({ path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'lex', key }, modifiers: [] });
const hash = (text) => createHash('sha256').update(text).digest('hex');
const cili = new Map(readFileSync(`${ciliRoot}/ili-map-pwn30.tab`, 'utf8').split(/\r?\n/u).map((line) => line.split('\t')).filter((f) => f.length >= 2 && f[0] && f[1] && !f[0].startsWith('#')).map((f) => [f[1], f[0]]));
const out = { type: 'development-unimorph-independent-ud-benchmark', version: 1, status: 'diagnostic', protected: false, perLanguage, languages: {}, limitations: ['UD lemma/POS are independent of UniMorph but OMW/CILI still supplies the external identity mapping.', 'German OMW file/resource availability is recorded as unresolved if absent.', 'Only NOUN/VERB/ADJ tokens with surface != lemma are sampled.'] };
for (const [language, [treebank, udFile, uniRepo, omwFile]] of Object.entries(files)) {
  const udPath = `${udRoot}/${treebank}/${udFile}`;
  const udText = readFileSync(udPath, 'utf8');
  const uniText = readFileSync(`${uniRoot}/${uniRepo}/${uniRepo}`, 'utf8');
  const omwPath = `${omwRoot}/${omwFile}`;
  let base;
  try {
    const imported = importOmwTab(readFileSync(omwPath, 'utf8'), { language, source: 'omw-data/v2.0', synsetToInterlingualId: cili });
    base = createOmwProvider({ version: 'omw-data/v2.0+cili/v1.0', records: imported.records });
  } catch (error) {
    out.languages[language] = { treebank, udFile, udSnapshotHash: hash(udText), unimorphSnapshotHash: hash(uniText), status: 'resource_unavailable', error: String(error) };
    continue;
  }
  const analyses = new Map();
  for (const line of uniText.split(/\r?\n/u)) {
    const [lemma, surface, rawTag] = line.split('\t');
    if (!lemma || !surface || !rawTag || lemma === surface) continue;
    const tag = rawTag.toUpperCase();
    const partOfSpeech = tag.startsWith('V') ? 'verb' : tag.startsWith('N') ? 'noun' : tag.startsWith('ADJ') ? 'adjective' : undefined;
    if (!partOfSpeech) continue;
    const key = `${surface.normalize('NFKC').trim().toLocaleLowerCase('und')}\u0000${partOfSpeech}`;
    const values = analyses.get(key) ?? [];
    if (!values.some((item) => item.lemma === lemma)) values.push({ lemma, partOfSpeech, evidence: [`unimorph:${uniRepo}`] });
    analyses.set(key, values);
  }
  const observations = [];
  for (const block of udText.split(/\n\s*\n/u)) {
    for (const line of block.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const fields = line.split('\t');
      if (fields.length < 10 || !/^\d+$/u.test(fields[0]) || fields[1] === fields[2]) continue;
      const partOfSpeech = posMap[fields[3]];
      if (!partOfSpeech) continue;
      observations.push({ surface: fields[1], lemma: fields[2], partOfSpeech });
    }
  }
  const selected = observations.sort((a, b) => hash(`${a.surface}\u0000${a.lemma}\u0000${a.partOfSpeech}`).localeCompare(hash(`${b.surface}\u0000${b.lemma}\u0000${b.partOfSpeech}`), 'en')).slice(0, perLanguage);
  const analyzer = { analyzer: 'unimorph', analyzerVersion: uniRepo, snapshotHash: hash(uniText), analyze: ({ surface, partOfSpeech }) => analyses.get(`${surface.normalize('NFKC').trim().toLocaleLowerCase('und')}\u0000${partOfSpeech}`) ?? [] };
  const augmented = createMorphologyAugmentedProvider({ base, analyzer });
  const counts = { total: selected.length, goldIdentityAvailable: 0, rawIdentityAvailable: 0, rawCorrect: 0, candidateIdentityAvailable: 0, candidateCorrect: 0, candidateSetContainsGold: 0, falseExactWhenGoldUnique: 0, ambiguous: 0, unresolved: 0, uniMorphAnalysisAvailable: 0 };
  for (const item of selected) {
    const gold = base.resolve({ proposal: proposal(item.lemma), language, partOfSpeech: item.partOfSpeech });
    const goldIds = new Set(gold.candidates.map((candidate) => candidate.externalId));
    if (goldIds.size === 1) counts.goldIdentityAvailable++;
    const raw = base.resolve({ proposal: proposal(item.surface), language, partOfSpeech: item.partOfSpeech });
    const candidate = augmented.resolve({ proposal: proposal(item.surface), language, partOfSpeech: item.partOfSpeech });
    if (raw.status === 'resolved_exact') { counts.rawIdentityAvailable++; if (goldIds.size === 1 && goldIds.has(raw.candidates[0].externalId)) counts.rawCorrect++; }
    if (candidate.status === 'resolved_exact') { counts.candidateIdentityAvailable++; if (goldIds.size === 1 && goldIds.has(candidate.candidates[0].externalId)) counts.candidateCorrect++; else if (goldIds.size === 1) counts.falseExactWhenGoldUnique++; }
    if (candidate.candidates.some((value) => goldIds.has(value.externalId))) counts.candidateSetContainsGold++;
    if ((analyses.get(`${item.surface.normalize('NFKC').trim().toLocaleLowerCase('und')}\u0000${item.partOfSpeech}`) ?? []).length > 0) counts.uniMorphAnalysisAvailable++;
    if (candidate.status === 'ambiguous') counts.ambiguous++; else if (candidate.status === 'unresolved') counts.unresolved++;
  }
  out.languages[language] = { treebank, udFile, udSnapshotHash: hash(udText), unimorphSnapshotHash: hash(uniText), counts, rates: { goldEligibility: counts.total ? counts.goldIdentityAvailable / counts.total : 0, rawCoverage: counts.total ? counts.rawIdentityAvailable / counts.total : 0, rawAccuracyAll: counts.total ? counts.rawCorrect / counts.total : 0, candidateCoverage: counts.total ? counts.candidateIdentityAvailable / counts.total : 0, candidateAccuracyAll: counts.total ? counts.candidateCorrect / counts.total : 0, candidateSetRecall: counts.total ? counts.candidateSetContainsGold / counts.total : 0, falseExactRateAmongGoldUnique: counts.goldIdentityAvailable ? counts.falseExactWhenGoldUnique / counts.goldIdentityAvailable : 0, ambiguityRate: counts.total ? counts.ambiguous / counts.total : 0, unresolvedRate: counts.total ? counts.unresolved / counts.total : 0 } };
}
console.log(JSON.stringify(out, null, 2));
