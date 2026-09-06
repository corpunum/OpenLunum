import { readFileSync, writeFileSync } from 'node:fs';
import { createOmwProvider, importOmwTab, importWnLmf } from '../../packages/core/dist/src/grounding-provider.js';

const root = process.env.OPENLUNUM_OMW_ROOT ?? '/tmp/openlunum-omw.GONbNp/data';
const ciliRoot = process.env.OPENLUNUM_CILI_ROOT ?? '/tmp/openlunum-cili-v1.0.kPBzyI/data';
const odenet = process.env.OPENLUNUM_ODENET_XML ?? '/tmp/openlunum-odenet-extract.0Bv0Na/odenet-1.4/deWordNet.xml';
const out = process.env.OPENLUNUM_GROUNDING_REPORT ?? '/tmp/openlunum-grounding-benchmark.json';

const map = new Map();
for (const line of readFileSync(`${ciliRoot}/ili-map-pwn30.tab`, 'utf8').split(/\r?\n/u)) {
  const fields = line.split('\t');
  if (fields.length >= 2 && fields[0] && fields[1] && !fields[0].startsWith('#')) map.set(fields[1], fields[0]);
}
const files = { en: 'wns/eng/wn-data-eng.tab', el: 'wns/ell/wn-data-ell.tab', es: 'wns/mcr/wn-data-spa.tab', fr: 'wns/fra/wn-data-fra.tab', id: 'wns/msa/wn-data-ind.tab' };
const providers = {};
const imports = {};
const recordsByLanguage = {};
for (const [language, relative] of Object.entries(files)) {
  const imported = importOmwTab(readFileSync(`${root}/${relative}`, 'utf8'), { language, source: 'omw-data/v2.0', license: 'see-resource-manifest', synsetToInterlingualId: map });
  recordsByLanguage[language] = imported.records;
  imports[language] = { records: imported.records.length, uniqueIli: new Set(imported.records.map((record) => record.interlingualId)).size, unmappedSynsets: imported.unmappedSynsets.length, malformedLines: imported.malformedLines.length, invalidMappings: imported.invalidMappings.length };
  providers[language] = createOmwProvider({ version: 'omw-data/v2.0+cili/v1.0', records: imported.records });
}
const deImported = importWnLmf(readFileSync(odenet, 'utf8'), { language: 'de', source: 'odenet:1.4', license: 'CC BY-SA 4.0' });
recordsByLanguage.de = deImported.records;
imports.de = { records: deImported.records.length, uniqueIli: new Set(deImported.records.map((record) => record.interlingualId)).size, unmappedSynsets: deImported.unmappedSynsets.length, malformedEntries: deImported.malformedEntries, invalidMappings: deImported.invalidMappings.length };
providers.de = createOmwProvider({ version: 'odenet/v1.4+cili/v1.0', records: deImported.records });

function proposal(key) { return { path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'lex', key }, modifiers: [] }; }
function resolve(language, lemma, partOfSpeech) { return providers[language].resolve({ proposal: proposal(lemma), language, ...(partOfSpeech ? { partOfSpeech } : {}) }); }
const cases = [];
const languages = ['el', 'es', 'fr', 'de', 'id'];
for (const language of languages) {
  const common = new Map();
  for (const record of recordsByLanguage[language]) common.set(record.interlingualId, record);
  const english = new Map();
  const enRecords = providers.en ? (files.en && importOmwTab(readFileSync(`${root}/${files.en}`, 'utf8'), { language: 'en', source: 'omw-data/v2.0', synsetToInterlingualId: map }).records) : [];
  for (const record of enRecords) if (!english.has(record.interlingualId) && record.lemma.split(' ').length === 1) english.set(record.interlingualId, record);
  let added = 0;
  for (const [ili, foreign] of common) {
    const en = english.get(ili);
    if (!en || foreign.lemma.split(' ').length !== 1 || en.partOfSpeech !== foreign.partOfSpeech) continue;
    const left = resolve('en', en.lemma, en.partOfSpeech); const right = resolve(language, foreign.lemma, foreign.partOfSpeech);
    cases.push({ category: 'cross-language-translation', pair: `en-${language}`, language, expected: 'same', left: left.status === 'resolved_exact' ? left.candidates[0].externalId : left.status, right: right.status === 'resolved_exact' ? right.candidates[0].externalId : right.status, leftStatus: left.status, rightStatus: right.status, converged: left.status === 'resolved_exact' && right.status === 'resolved_exact' && left.candidates[0].externalId === right.candidates[0].externalId });
    if (++added >= 20) break;
  }
}
const enRecords = importOmwTab(readFileSync(`${root}/${files.en}`, 'utf8'), { language: 'en', source: 'omw-data/v2.0', synsetToInterlingualId: map }).records.filter((record) => record.lemma.split(' ').length === 1);
const byIli = new Map();
for (const record of enRecords) { const list = byIli.get(record.interlingualId) ?? []; list.push(record); byIli.set(record.interlingualId, list); }
for (const list of byIli.values()) { if (list.length < 2) continue; const a = list[0]; const b = list.find((record) => record.lemma !== a.lemma && record.partOfSpeech === a.partOfSpeech); if (!b) continue; const ar = resolve('en', a.lemma, a.partOfSpeech); const br = resolve('en', b.lemma, b.partOfSpeech); cases.push({ category: 'same-language-synonym', pair: 'en-en', expected: 'same', left: ar.status === 'resolved_exact' ? ar.candidates[0].externalId : ar.status, right: br.status === 'resolved_exact' ? br.candidates[0].externalId : br.status, leftStatus: ar.status, rightStatus: br.status, converged: ar.status === 'resolved_exact' && br.status === 'resolved_exact' && ar.candidates[0].externalId === br.candidates[0].externalId }); if (cases.filter((item) => item.category === 'same-language-synonym').length >= 25) break; }
for (let i = 0; i < enRecords.length && cases.filter((item) => item.category === 'hard-negative').length < 25; i += 17) { const a = enRecords[i]; const b = enRecords[(i * 37 + 101) % enRecords.length]; if (!b || a.lemma === b.lemma || a.interlingualId === b.interlingualId || a.partOfSpeech !== b.partOfSpeech) continue; const ar = resolve('en', a.lemma, a.partOfSpeech); const br = resolve('en', b.lemma, b.partOfSpeech); cases.push({ category: 'hard-negative', pair: 'en-en', expected: 'different', left: ar.status === 'resolved_exact' ? ar.candidates[0].externalId : ar.status, right: br.status === 'resolved_exact' ? br.candidates[0].externalId : br.status, leftStatus: ar.status, rightStatus: br.status, converged: ar.status === 'resolved_exact' && br.status === 'resolved_exact' && ar.candidates[0].externalId === br.candidates[0].externalId }); }
const summary = { total: cases.length, byCategory: {}, byPair: {}, converged: cases.filter((item) => item.converged).length, falseEquivalences: cases.filter((item) => item.expected === 'different' && item.converged).length, imports };
for (const item of cases) { const key = item.category; summary.byCategory[key] = summary.byCategory[key] ?? { total: 0, comparable: 0, correct: 0, ambiguous: 0, unresolved: 0 }; const bucket = summary.byCategory[key]; bucket.total++; const comparable = item.left.startsWith('ili:') && item.right.startsWith('ili:'); if (comparable) bucket.comparable++; if (comparable && ((item.expected === 'same' && item.converged) || (item.expected === 'different' && !item.converged))) bucket.correct++; if (item.leftStatus === 'ambiguous' || item.rightStatus === 'ambiguous') bucket.ambiguous++; else if (item.leftStatus === 'unresolved' || item.rightStatus === 'unresolved') bucket.unresolved++; summary.byPair[item.pair] = summary.byPair[item.pair] ?? { total: 0, converged: 0 }; summary.byPair[item.pair].total++; if (item.converged) summary.byPair[item.pair].converged++; }
writeFileSync(out, JSON.stringify({ type: 'development-real-omw-grounding', version: 1, source: { omw: 'omw-data v2.0', cili: 'CILI v1.0', odenet: 'OdeNet v1.4' }, summary, cases }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
