/** Score the large development source-only extraction without exposing gold to the worker. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { submitCandidate } from '../../packages/core/dist/src/agent-native.js';
import { validateBlindAgentLedger } from '../../packages/eval/dist/src/blind-agent-ledger.js';

const corpusPath = 'experiments/development-agent-large-20260907/corpus.json';
const ledgerPath = 'experiments/development-agent-large-20260907/candidate-ledger.json';
const outputPath = 'experiments/development-agent-large-20260907/results-summary.json';
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const rows = [];
for (const group of corpus.groups) for (const row of group.rows) rows.push({ ...row, group: group.id, target: 'parse' });
for (const row of corpus.criticalNegativeRows) rows.push({ ...row, target: 'negative-parse' });
for (const row of corpus.abstentionRows) rows.push({ ...row, target: 'abstention' });
const handleFor = (row, index) => `opaque-${String(index + 1).padStart(3, '0')}-${createHash('sha256').update(`${row.sourceText}|${row.sourceLanguage}|${index}`).digest('hex').slice(0, 10)}`;
const source = rows.map((row, index) => ({ handle: handleFor(row, index), sourceText: row.sourceText, sourceLanguage: row.sourceLanguage, kind: 'memory' }));
const candidateRows = source.map((item) => {
  const entry = ledger.items[item.handle];
  const result = entry?.status === 'abstain' ? { candidateSem: null } : { candidateSem: entry?.candidateSem ?? null };
  result.provenance = { extractorType: ledger.extractor?.extractorType ?? 'codex_agent', sourceHash: createHash('sha256').update(item.sourceText).digest('hex') };
  return { handle: item.handle, result };
});
const blind = validateBlindAgentLedger(source, candidateRows, { requireSourceHash: true });
const goldByGroup = corpus.parentAudit.goldSemByGroup;
const goldByNegative = corpus.parentAudit.goldSemByCriticalNegativeItem;
const scored = new Map();
for (const [index, row] of rows.entries()) {
  const handle = source[index].handle;
  const entry = ledger.items[handle];
  const candidate = entry?.status === 'abstain' ? null : entry?.candidateSem ?? null;
  const gold = row.target === 'negative-parse' ? goldByNegative[row.id] : goldByGroup[row.group];
  const candidateResult = candidate === null ? null : submitCandidate({ sourceText: row.sourceText, sourceLanguage: row.sourceLanguage, candidateSem: candidate, provenance: { extractorType: 'codex_agent' } });
  const goldResult = gold === undefined ? null : submitCandidate({ sourceText: row.sourceText, sourceLanguage: row.sourceLanguage, candidateSem: gold, provenance: { extractorType: 'human' } });
  scored.set(row.id, { handle, target: row.target, language: row.sourceLanguage, candidateResult, goldFingerprint: goldResult?.semanticFingerprint ?? null });
}
const parse = [...scored.values()].filter((row) => row.target === 'parse');
const negatives = [...scored.values()].filter((row) => row.target === 'negative-parse');
const abstentions = [...scored.values()].filter((row) => row.target === 'abstention');
const exact = (row) => !!row.candidateResult?.semanticFingerprint && row.candidateResult.semanticFingerprint === row.goldFingerprint;
const stageCount = (rows, field) => rows.filter((row) => row.candidateResult?.[field] === true).length;
const byLanguage = {};
for (const row of parse) (byLanguage[row.language] ??= { exact: 0, total: 0, identity: 0 });
for (const row of parse) { byLanguage[row.language].total++; if (exact(row)) byLanguage[row.language].exact++; if (row.candidateResult?.candidateIdentityAvailable) byLanguage[row.language].identity++; }
const groupStats = {};
for (const group of corpus.groups) {
  const groupRows = group.rows.map((row) => scored.get(row.id));
  const fps = groupRows.map((row) => row?.candidateResult?.semanticFingerprint).filter(Boolean);
  const goldFps = groupRows.map((row) => row?.goldFingerprint).filter(Boolean);
  groupStats[group.id] = { rows: groupRows.length, distinctCandidateLfps: new Set(fps).size, distinctGoldLfps: new Set(goldFps).size, convergesToOne: new Set(fps).size === 1, convergesToGold: new Set(fps).size === 1 && fps[0] === goldFps[0] };
}
const negativePairs = corpus.criticalNegativePairs.map((pair) => {
  const left = scored.get(pair.leftItemId)?.candidateResult?.semanticFingerprint ?? null;
  const right = scored.get(pair.rightItemId)?.candidateResult?.semanticFingerprint ?? null;
  return { pairId: pair.pairId, comparable: !!left && !!right, falseEquivalent: !!left && left === right };
});
const output = {
  type: 'openlunum-development-agent-large-results', version: '2026-09-07', status: 'diagnostic-development-only', protected: false, localInferenceUsed: false,
  corpus: { path: corpusPath, rows: rows.length, parseTargets: parse.length, negativeParseTargets: negatives.length, abstentionTargets: abstentions.length },
  ledger: { path: ledgerPath, handles: candidateRows.length, blindValidation: blind, forbiddenGoldMetadata: [] },
  stages: { transportValid: stageCount([...scored.values()].filter((r) => r.candidateResult), 'transportValid'), structuralValid: stageCount([...scored.values()].filter((r) => r.candidateResult), 'structuralValid'), protocolCanonical: stageCount([...scored.values()].filter((r) => r.candidateResult), 'protocolCanonical'), frameValid: stageCount([...scored.values()].filter((r) => r.candidateResult), 'frameValid'), grounded: stageCount([...scored.values()].filter((r) => r.candidateResult), 'grounded') },
  parse: { exact: parse.filter(exact).length, total: parse.length, rate: parse.filter(exact).length / parse.length, candidateIdentityAvailable: parse.filter((r) => r.candidateResult?.candidateIdentityAvailable).length, identityComparable: parse.filter((r) => r.candidateResult?.candidateIdentityAvailable && !!r.goldFingerprint).length, byLanguage },
  abstention: { targets: abstentions.length, correct: abstentions.filter((r) => !r.candidateResult).length, unexpectedParses: abstentions.filter((r) => !!r.candidateResult).length, accuracy: abstentions.filter((r) => !r.candidateResult).length / abstentions.length },
  multilingual: { groups: corpus.groups.length, candidateGroupsConverging: Object.values(groupStats).filter((r) => r.convergesToOne).length, groupsConvergingToGold: Object.values(groupStats).filter((r) => r.convergesToGold).length, groupStats },
  criticalNegatives: { pairsDefined: negativePairs.length, pairsComparable: negativePairs.filter((r) => r.comparable).length, falseEquivalences: negativePairs.filter((r) => r.falseEquivalent).length, pairs: negativePairs },
  interpretation: 'Development-only source-blind agent evidence. Candidate self-consistency is reported separately from private gold correctness; no protected claim is made.',
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, blind: output.ledger.blindValidation, parse: output.parse, abstention: output.abstention, multilingual: { groups: output.multilingual.groups, candidateGroupsConverging: output.multilingual.candidateGroupsConverging, groupsConvergingToGold: output.multilingual.groupsConvergingToGold }, criticalNegatives: output.criticalNegatives }, null, 2));
