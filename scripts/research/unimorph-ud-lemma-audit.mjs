/**
 * Development-only morphology audit with an external lemma target.
 *
 * UD supplies the held-out surface/lemma/UPOS annotation.  UniMorph is the
 * analyzer under test.  No OMW/CILI identity or Lunum benchmark gold is used,
 * so this measures lemma recovery rather than circular identity coverage.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const udRoot = process.env.OPENLUNUM_UD_ROOT;
if (!udRoot) throw new Error('OPENLUNUM_UD_ROOT is required');
const uniRoot = process.env.OPENLUNUM_UNIMORPH_ROOT ?? '/tmp/openlunum-unimorph.oLd9sO';
const sampleSize = Number(process.env.OPENLUNUM_UD_SAMPLE ?? 100);
const files = {
  en: ['English-EWT', 'en_ewt-ud-dev.conllu', 'eng'],
  el: ['Greek-GDT', 'el_gdt-ud-dev.conllu', 'ell'],
  es: ['Spanish-AnCora', 'es_ancora-ud-dev.conllu', 'spa'],
  fr: ['French-GSD', 'fr_gsd-ud-dev.conllu', 'fra'],
  de: ['German-GSD', 'de_gsd-ud-dev.conllu', 'deu'],
  id: ['Indonesian-GSD', 'id_gsd-ud-dev.conllu', 'ind'],
};
const posMap = { NOUN: 'noun', VERB: 'verb', ADJ: 'adjective' };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.normalize('NFKC').trim().toLocaleLowerCase('und');
const result = { type: 'development-unimorph-ud-lemma-audit', version: 1, protected: false, sampleSize, languages: {} };

for (const [language, [treebank, udFile, uniRepo]] of Object.entries(files)) {
  const udText = readFileSync(`${udRoot}/${treebank}/${udFile}`, 'utf8');
  const uniText = readFileSync(`${uniRoot}/${uniRepo}/${uniRepo}`, 'utf8');
  const analyses = new Map();
  for (const line of uniText.split(/\r?\n/u)) {
    const [lemma, surface, rawTag] = line.split('\t');
    if (!lemma || !surface || !rawTag || lemma === surface) continue;
    const tag = rawTag.toUpperCase();
    const partOfSpeech = tag.startsWith('V') ? 'verb' : tag.startsWith('N') ? 'noun' : tag.startsWith('ADJ') ? 'adjective' : undefined;
    if (!partOfSpeech) continue;
    const key = `${normalize(surface)}\u0000${partOfSpeech}`;
    const values = analyses.get(key) ?? [];
    if (!values.includes(normalize(lemma))) values.push(normalize(lemma));
    analyses.set(key, values);
  }
  const observations = [];
  for (const block of udText.split(/\n\s*\n/u)) {
    for (const line of block.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const fields = line.split('\t');
      if (fields.length < 4 || !/^\d+$/u.test(fields[0]) || fields[1] === fields[2]) continue;
      const partOfSpeech = posMap[fields[3]];
      if (partOfSpeech) observations.push({ surface: fields[1], lemma: normalize(fields[2]), partOfSpeech });
    }
  }
  const selected = observations.sort((a, b) => digest(`${a.surface}\u0000${a.lemma}\u0000${a.partOfSpeech}`).localeCompare(digest(`${b.surface}\u0000${b.lemma}\u0000${b.partOfSpeech}`), 'en')).slice(0, sampleSize);
  const counts = { total: selected.length, analyzerCandidates: 0, candidateContainsUdLemma: 0, uniqueCorrect: 0, uniqueWrong: 0, ambiguousIncludesGold: 0, unresolved: 0 };
  const failures = [];
  for (const item of selected) {
    const candidates = analyses.get(`${normalize(item.surface)}\u0000${item.partOfSpeech}`) ?? [];
    if (candidates.length) counts.analyzerCandidates++;
    const hasGold = candidates.includes(item.lemma);
    if (hasGold) counts.candidateContainsUdLemma++;
    if (candidates.length === 1 && hasGold) counts.uniqueCorrect++;
    else if (candidates.length === 1) counts.uniqueWrong++;
    else if (candidates.length > 1 && hasGold) counts.ambiguousIncludesGold++;
    else if (!candidates.length) counts.unresolved++;
    if (!hasGold) failures.push({ surface: item.surface, udLemma: item.lemma, partOfSpeech: item.partOfSpeech, candidates });
  }
  result.languages[language] = {
    treebank, udFile, unimorphRepo: uniRepo, udSnapshotHash: digest(udText), unimorphSnapshotHash: digest(uniText), counts,
    rates: { analyzerCoverage: counts.total ? counts.analyzerCandidates / counts.total : 0, candidateRecall: counts.total ? counts.candidateContainsUdLemma / counts.total : 0, uniquePrecision: counts.uniqueCorrect + counts.uniqueWrong ? counts.uniqueCorrect / (counts.uniqueCorrect + counts.uniqueWrong) : null },
    failureSample: failures.slice(0, 20),
  };
}
const path = process.env.OPENLUNUM_LEMMA_AUDIT_OUT;
if (path) writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
