#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { loadJsonLines } from './training-program.mjs';
import { buildCandidateFromSemanticIR, submitCandidate } from '../../packages/core/dist/src/index.js';

const root = process.argv[2] ?? 'experiments/natural-development-v5';
const outputFile = process.argv[3] ?? `${root}/extraction/results-revised.json`;
const subset = loadJsonLines(`${root}/certified-subset.jsonl`);
const ledger = loadJsonLines(`${root}/extraction/candidate-ledger.jsonl`);
const byHandle = new Map(ledger.map((row) => [row.handle, row]));
const handles = loadJsonLines(`${root}/extraction/source-only-request.jsonl`);
const privateMap = JSON.parse(fs.readFileSync(`${root}/extraction/source-only-private-map.json`, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceRow = new Map(subset.map((row) => [row.id, row]));
const results = [];
for (const request of handles) {
  const row = sourceRow.get(privateMap[request.handle]?.sourceRowId);
  if (!row) throw new Error(`source_mapping_missing:${request.handle}`);
  const entry = byHandle.get(request.handle);
  let candidate = null;
  let submission = null;
  if (entry?.status === 'parse' && entry.candidateSem !== null) {
    candidate = entry.candidateSem;
    submission = submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: candidate, provenance: { extractorType: 'codex_agent', extractorId: entry.extractorId ?? 'fresh-source-only-v5', contractHash: request.contractHash } });
  }
  let gold = null;
  if (row.target.outcome === 'parse') {
    const ir = { version: 'lunum-ir/0.1', outcome: 'parse', ...row.target.ir };
    gold = buildCandidateFromSemanticIR(ir).sem;
  }
  const goldSubmission = gold ? submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: gold, provenance: { extractorType: 'other' } }) : null;
  const candidateClause = submission?.sem?.clauses?.[0];
  const goldClause = goldSubmission?.sem?.clauses?.[0];
  const structural = candidateClause && goldClause ? {
    world: submission.sem.world === goldSubmission.sem.world,
    kind: submission.sem.kind === goldSubmission.sem.kind,
    predicate: candidateClause.predicate === goldClause.predicate,
    negated: Boolean(candidateClause.negated) === Boolean(goldClause.negated),
    roleNames: JSON.stringify(Object.keys(candidateClause.roles).sort()) === JSON.stringify(Object.keys(goldClause.roles).sort()),
    roleTypes: candidateClause.roles && goldClause.roles ? Object.keys(goldClause.roles).every((key) => candidateClause.roles[key]?.type === goldClause.roles[key]?.type) : false
  } : null;
  const identityComparable = Boolean(candidateClause && goldClause && Object.values(candidateClause.roles ?? {}).every((term) => term && (term.id !== undefined || term.ref !== undefined)) && Object.values(goldClause.roles ?? {}).every((term) => term && (term.id !== undefined || term.ref !== undefined)));
  results.push({ handle: request.handle, sourceRowId: row.id, language: request.sourceLanguage, targetOutcome: row.target.outcome, candidateStatus: entry?.status ?? 'missing', submission, structural, identityComparable, exact: identityComparable && Boolean(submission?.semanticFingerprint && goldSubmission?.semanticFingerprint && submission.semanticFingerprint === goldSubmission.semanticFingerprint), abstentionCorrect: row.target.outcome === 'abstain' && !submission, goldIdentityAvailable: Boolean(goldSubmission?.candidateIdentityAvailable), sourceSha256: sha256(request.sourceText) });
}
const parse = results.filter((r) => r.targetOutcome === 'parse');
const abstain = results.filter((r) => r.targetOutcome === 'abstain');
const valid = (field) => results.filter((r) => r.submission?.[field] === true).length;
const groupById = new Map(subset.map((row) => [row.source.semanticGroup, []]));
for (const result of results) groupById.get(sourceRow.get(result.sourceRowId).source.semanticGroup)?.push(result);
const groups = [...groupById].map(([group, members]) => { const fps = members.map((r) => r.submission?.semanticFingerprint).filter(Boolean); return { group, rows: members.length, outputsAvailable: fps.length, candidateConverges: fps.length > 0 && new Set(fps).size === 1, exact: members.every((r) => r.exact || r.abstentionCorrect) }; });
const report = {
  format: 'openlunum-natural-source-only-extraction/0.1', status: 'diagnostic-development-only', protected: false, localInferenceUsed: false,
  procedure: { oneFirstPassPerItem: true, deterministicRepair: false, sourceOnlyRequest: `${root}/extraction/source-only-request.jsonl`, contract: `${root}/extraction/source-only-contract.json`, extractor: 'fresh isolated Codex agent; packet restricted to source-only request and frozen contract', goldIsolation: 'extractor was instructed not to read certified subset, reviews, manifests, or generator files; parent scorer accessed gold privately' },
  corpus: { rows: results.length, parseTargets: parse.length, abstentionTargets: abstain.length, languages: [...new Set(results.map((r) => r.language))].sort(), datasetSha256: JSON.parse(fs.readFileSync(`${root}/certification-report.json`, 'utf8')).datasetSha256 },
  stages: { submitted: results.filter((r) => r.submission).length, transportValid: valid('transportValid'), structuralValid: valid('structuralValid'), protocolCanonical: valid('protocolCanonical'), frameValid: valid('frameValid'), grounded: valid('grounded'), identityAvailable: valid('candidateIdentityAvailable') },
  parse: { attempts: parse.length, exact: parse.filter((r) => r.exact).length, identityComparable: parse.filter((r) => r.identityComparable).length, falseAbstentions: parse.filter((r) => !r.submission).length, structural: { world: parse.filter((r) => r.structural?.world).length, kind: parse.filter((r) => r.structural?.kind).length, predicate: parse.filter((r) => r.structural?.predicate).length, negated: parse.filter((r) => r.structural?.negated).length, roleNames: parse.filter((r) => r.structural?.roleNames).length, roleTypes: parse.filter((r) => r.structural?.roleTypes).length }, byLanguage: Object.fromEntries([...new Set(parse.map((r) => r.language))].sort().map((language) => { const p=parse.filter((r)=>r.language===language); return [language,{attempts:p.length,submitted:p.filter(r=>r.submission).length,exact:p.filter(r=>r.exact).length,identityComparable:p.filter(r=>r.identityComparable).length}]; })) },
  abstention: { targets: abstain.length, correct: abstain.filter((r) => r.abstentionCorrect).length, unexpectedParses: abstain.filter((r) => r.submission).length },
  multilingual: { groups: groups.length, groupsWithAllOutputs: groups.filter((g) => g.outputsAvailable === 6).length, candidateConverging: groups.filter((g) => g.candidateConverges).length, groupResults: groups },
  criticalContrasts: { note: 'No gold-derived labels were exposed to extractor; contrast scoring is intentionally not inferred from candidate absence in this first source-only run.' },
  items: results
};
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ rows: results.length, parse: report.parse, abstention: report.abstention, stages: report.stages, multilingual: report.multilingual }, null, 2));
