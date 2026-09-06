#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../../', import.meta.url).pathname;
const corpusPath = process.argv[2] ?? 'experiments/development-agent-large-20260907/corpus.json';
const ledgerPath = process.argv[3] ?? 'experiments/development-agent-large-20260907/candidate-ledger.json';
const corpus = JSON.parse(fs.readFileSync(`${root}${corpusPath}`));
const ledger = JSON.parse(fs.readFileSync(`${root}${ledgerPath}`));
const rows = [
  ...corpus.groups.flatMap((group) => group.rows.map((row) => ({ ...row, groupId: group.id, expectedOutcome: 'parse', gold: corpus.parentAudit.goldSemByGroup[group.id] }))),
  ...corpus.criticalNegativeRows.map((row) => ({ ...row, groupId: undefined, expectedOutcome: 'parse', gold: corpus.parentAudit.goldSemByCriticalNegativeItem[row.id] })),
  ...corpus.abstentionRows.map((row) => ({ ...row, expectedOutcome: 'abstain', gold: null }))
];
const candidates = Object.values(ledger.items);
if (rows.length !== candidates.length) throw new Error(`row/ledger mismatch ${rows.length}/${candidates.length}`);

function diffFields(a, b, path = '') {
  if (Object.is(a, b)) return [];
  if (typeof a !== typeof b || a === null || b === null) return [path || '<root>'];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [path || '<root>'];
    return a.flatMap((v, i) => diffFields(v, b[i], `${path}[${i}]`));
  }
  if (typeof a === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)].flatMap((key) => diffFields(a[key], b[key], path ? `${path}.${key}` : key)))];
  return [path || '<root>'];
}
function category(row, candidate) {
  if (row.expectedOutcome === 'abstain') return candidate.candidateSem ? 'UNEXPECTED_PARSE' : 'CORRECT_ABSTENTION';
  if (!candidate.candidateSem) return 'UNEXPECTED_ABSTENTION';
  const paths = diffFields(row.gold, candidate.candidateSem);
  if (!paths.length) return 'EXACT';
  const has = (needle) => paths.some((p) => p.includes(needle));
  if (has('.kind')) return 'KIND_OR_SEMANTIC_INTERPRETATION';
  if (has('.predicate')) return 'PREDICATE_OR_SEMANTIC_INTERPRETATION';
  if (has('.roles') && paths.some((p) => p.endsWith('.type'))) return 'TERM_TYPE_OR_ROLE';
  if (has('.roles') && paths.some((p) => p.endsWith('.id'))) return 'OPEN_CONCEPT_OR_ENTITY_GROUNDING';
  if (has('.roles')) return 'ROLE_OR_GROUNDING';
  if (has('.negated')) return 'NEGATION';
  if (has('.modality')) return 'MODALITY';
  if (has('.time')) return 'DATE_OR_TIME';
  return 'OPEN_CONCEPT_OR_TERM_TYPE_GROUNDING';
}

const items = rows.map((row, index) => {
  const candidate = candidates[index];
  return { itemId: row.id, language: row.sourceLanguage, semanticGroup: row.groupId ?? null, expectedOutcome: row.expectedOutcome, category: category(row, candidate), differingPaths: row.gold && candidate.candidateSem ? diffFields(row.gold, candidate.candidateSem) : [], candidateIdentityAvailable: Boolean(candidate.candidateSem), sourceTextSha256: crypto.createHash('sha256').update(row.sourceText).digest('hex') };
});
const counts = Object.fromEntries([...new Set(items.map((x) => x.category))].sort().map((key) => [key, items.filter((x) => x.category === key).length]));
const byLanguage = {};
for (const item of items) (byLanguage[item.language] ??= {})[item.category] = ((byLanguage[item.language] ?? {})[item.category] ?? 0) + 1;
const report = { type: 'openlunum-training-failure-breakdown', status: 'diagnostic-development-only', source: { corpusPath, ledgerPath, rows: rows.length, corpusSha256: crypto.createHash('sha256').update(fs.readFileSync(`${root}${corpusPath}`)).digest('hex'), ledgerSha256: crypto.createHash('sha256').update(fs.readFileSync(`${root}${ledgerPath}`)).digest('hex') }, methodology: 'Structured candidate/gold comparison. Missing stage receipts are not inferred from error-message text; source-only ledger stage validity is taken from the recorded development summary.', totals: counts, byLanguage, items };
console.log(JSON.stringify(report, null, 2));
