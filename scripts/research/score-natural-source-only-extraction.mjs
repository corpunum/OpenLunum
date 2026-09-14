#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadJsonLines } from './training-program.mjs';
import { buildCandidateFromSemanticIR, compareSem, submitCandidate } from '../../packages/core/dist/src/index.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function classifyLedgerEntry(entry) {
  if (!entry) return 'missing';
  if (entry.status === 'abstain' && entry.candidateSem === null) return 'abstain';
  if (entry.status === 'parse' && entry.candidateSem && typeof entry.candidateSem === 'object' && !Array.isArray(entry.candidateSem)) return 'parse';
  return 'malformed';
}

export function validateRequestLedgerBindings(requests, ledger) {
  const requestByHandle = new Map();
  for (const request of requests) {
    if (!request?.handle || requestByHandle.has(request.handle)) throw new Error(`duplicate_or_missing_request_handle:${request?.handle ?? '<missing>'}`);
    if (sha256(request.sourceText ?? '') !== request.sourceSha256) throw new Error(`request_source_hash_mismatch:${request.handle}`);
    requestByHandle.set(request.handle, request);
  }

  const ledgerByHandle = new Map();
  for (const entry of ledger) {
    if (!entry?.handle || ledgerByHandle.has(entry.handle)) throw new Error(`duplicate_or_missing_ledger_handle:${entry?.handle ?? '<missing>'}`);
    const request = requestByHandle.get(entry.handle);
    if (!request) throw new Error(`ledger_unknown_handle:${entry.handle}`);
    if (entry.sourceSha256 !== request.sourceSha256) throw new Error(`ledger_source_hash_mismatch:${entry.handle}`);
    if (entry.contractHash !== request.contractHash) throw new Error(`ledger_contract_hash_mismatch:${entry.handle}`);
    ledgerByHandle.set(entry.handle, entry);
  }

  return { requestByHandle, ledgerByHandle };
}

export function validatePrivateSourceMap(privateMap, requests, sourceRows) {
  if (!privateMap || typeof privateMap !== 'object' || Array.isArray(privateMap)) throw new Error('private_map_not_object');
  const requestHandles = new Set(requests.map((request) => request.handle));
  const mappedSourceRows = new Set();
  for (const [handle, mapping] of Object.entries(privateMap)) {
    if (!requestHandles.has(handle)) throw new Error(`private_map_unknown_handle:${handle}`);
    if (!mapping || typeof mapping !== 'object' || typeof mapping.sourceRowId !== 'string') throw new Error(`private_map_invalid_entry:${handle}`);
    if (!sourceRows.has(mapping.sourceRowId)) throw new Error(`private_map_unknown_source_row:${handle}`);
    if (mappedSourceRows.has(mapping.sourceRowId)) throw new Error(`private_map_duplicate_source_row:${mapping.sourceRowId}`);
    mappedSourceRows.add(mapping.sourceRowId);
  }
  if (Object.keys(privateMap).length !== requestHandles.size) throw new Error('private_map_handle_mismatch');
}

function termMode(term) {
  if (Array.isArray(term)) return `array:${term.map(termMode).join(',')}`;
  if (term === null || term === undefined) return 'missing';
  if (typeof term !== 'object') return 'literal';
  if (term.id !== undefined || term.ref !== undefined) return 'reference';
  if (term.value !== undefined) return 'literal';
  return 'structured';
}

function sourceScalar(term) {
  if (Array.isArray(term)) return term.map(sourceScalar);
  if (term === null || term === undefined) return term;
  if (typeof term !== 'object') return term;
  if (term.value !== undefined) return term.value;
  if (term.id !== undefined) return term.id;
  if (term.ref !== undefined) return term.ref;
  return undefined;
}

function sourceTermComparison(expected, actual, path) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return { status: 'mismatch', path, reason: 'array_shape' };
    const children = expected.map((term, index) => sourceTermComparison(term, actual[index], `${path}[${index}]`));
    return { status: children.every((child) => child.status === 'match') ? 'match' : children.some((child) => child.status === 'mismatch') ? 'mismatch' : 'unresolved', path, children };
  }
  if (expected === undefined || actual === undefined) return expected === actual ? { status: 'match', path } : { status: 'mismatch', path, reason: 'presence' };
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') return Object.is(expected, actual) ? { status: 'match', path } : { status: 'mismatch', path, reason: 'literal' };
  if (expected.type !== actual.type) return { status: 'mismatch', path, reason: 'term_type', contractUnresolved: true };
  for (const field of ['unit', 'min', 'max', 'format']) {
    if (!Object.is(expected[field], actual[field])) return { status: 'mismatch', path: `${path}.${field}`, reason: field };
  }
  const expectedScalar = sourceScalar(expected);
  const actualScalar = sourceScalar(actual);
  if (expectedScalar === undefined || actualScalar === undefined) return { status: 'unresolved', path, reason: 'unresolved_identity' };
  return Object.is(expectedScalar, actualScalar)
    ? { status: 'match', path }
    : (termMode(expected) !== termMode(actual) || termMode(expected) === 'reference' ? { status: 'unresolved', path, reason: 'identity_representation' } : { status: 'mismatch', path, reason: 'value' });
}

function sourceClauseComparison(expected, actual, path = 'clauses[0]') {
  if (!expected || !actual) return { status: 'mismatch', path, reason: 'clause_presence' };
  const fields = ['predicate', 'negated', 'modality'];
  const fieldResults = fields.map((field) => ({ field, status: Object.is(expected[field] ?? (field === 'negated' ? false : null), actual[field] ?? (field === 'negated' ? false : null)) ? 'match' : 'mismatch', path: `${path}.${field}` }));
  const roleNames = new Set([...Object.keys(expected.roles ?? {}), ...Object.keys(actual.roles ?? {})]);
  const roles = [...roleNames].sort().map((role) => ({ role, ...sourceTermComparison(expected.roles?.[role], actual.roles?.[role], `${path}.roles.${role}`) }));
  const nested = [];
  for (const field of ['conditions', 'consequences']) {
    const left = expected[field] ?? [];
    const right = actual[field] ?? [];
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index += 1) nested.push(sourceClauseComparison(left[index], right[index], `${path}.${field}[${index}]`));
  }
  const children = [...fieldResults, ...roles, ...nested];
  return { status: children.every((child) => child.status === 'match') ? 'match' : children.some((child) => child.status === 'mismatch') ? 'mismatch' : 'unresolved', path, children };
}

export function compareSourceRelativeSemantics(expected, actual) {
  const topLevel = ['world', 'kind'].map((field) => ({ field, status: Object.is(expected?.[field], actual?.[field]) ? 'match' : 'mismatch', path: field, reason: field === 'kind' ? 'kind_convention' : undefined, contractUnresolved: field === 'kind' && !Object.is(expected?.[field], actual?.[field]) }));
  const left = expected?.clauses ?? [];
  const right = actual?.clauses ?? [];
  const clauses = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) clauses.push(sourceClauseComparison(left[index], right[index], `clauses[${index}]`));
  const children = [...topLevel, ...clauses];
  const statuses = children.flatMap((child) => [child, ...(child.children ?? [])]);
  const matched = statuses.filter((item) => item.status === 'match').length;
  const allMismatched = statuses.filter((item) => item.status === 'mismatch').length;
  const mismatched = statuses.filter((item) => item.status === 'mismatch' && item.contractUnresolved !== true).length;
  const unresolved = statuses.filter((item) => item.status === 'unresolved').length;
  const contractUnresolved = statuses.filter((item) => item.contractUnresolved === true).length;
  return { status: mismatched > 0 ? 'mismatch' : unresolved > 0 ? 'unresolved' : 'match', matched, mismatched, allMismatched, unresolved, contractUnresolved, details: children };
}

function clauseIdentityModesCompatible(left, right) {
  if (!left || !right) return false;
  const leftRoles = Object.keys(left.roles ?? {}).sort();
  const rightRoles = Object.keys(right.roles ?? {}).sort();
  if (JSON.stringify(leftRoles) !== JSON.stringify(rightRoles)) return false;
  for (const role of leftRoles) if (termMode(left.roles[role]) !== termMode(right.roles[role])) return false;
  if (termMode(left.time) !== termMode(right.time)) return false;
  if ((left.modality ?? null) !== (right.modality ?? null) || Boolean(left.negated) !== Boolean(right.negated) || left.predicate !== right.predicate) return false;
  const leftConditions = left.conditions ?? [];
  const rightConditions = right.conditions ?? [];
  const leftConsequences = left.consequences ?? [];
  const rightConsequences = right.consequences ?? [];
  if (leftConditions.length !== rightConditions.length || leftConsequences.length !== rightConsequences.length) return false;
  return leftConditions.every((clause, index) => clauseIdentityModesCompatible(clause, rightConditions[index]))
    && leftConsequences.every((clause, index) => clauseIdentityModesCompatible(clause, rightConsequences[index]));
}

export function identityRepresentationsComparable(candidateSem, goldSem) {
  if (!candidateSem || !goldSem) return false;
  const left = candidateSem.clauses ?? [];
  const right = goldSem.clauses ?? [];
  if (left.length !== right.length) return false;
  return left.every((clause, index) => clauseIdentityModesCompatible(clause, right[index]));
}

export function summarizeGroup(group, members) {
  const fingerprints = members.map((row) => row.submission?.semanticFingerprint).filter(Boolean);
  const completeParseOutputs = members.length > 0 && members.every((row) => Boolean(row.submission?.semanticFingerprint));
  const allExplicitAbstentions = members.length > 0 && members.every((row) => row.abstentionCorrect === true);
  return {
    group,
    rows: members.length,
    outputsAvailable: fingerprints.length,
    completeParseOutputs,
    allExplicitAbstentions,
    candidateConverges: completeParseOutputs && new Set(fingerprints).size === 1,
    exact: members.length > 0 && members.every((row) => row.exact === true || row.abstentionCorrect === true)
  };
}

function summarizeCriticalContrasts(subset, sourceRow, results) {
  const byGroup = new Map();
  for (const result of results) {
    const group = sourceRow.get(result.sourceRowId)?.source.semanticGroup;
    if (!group || !result.submission?.sem) continue;
    const members = byGroup.get(group) ?? [];
    members.push(result.submission.sem);
    byGroup.set(group, members);
  }
  const groupsByPair = new Map();
  for (const row of subset) {
    for (const other of row.target?.criticalNegativePairIds ?? []) {
      const groups = groupsByPair.get(other) ?? new Set();
      groups.add(row.source.semanticGroup);
      groupsByPair.set(other, groups);
    }
  }
  const pairResults = [...groupsByPair].map(([pairId, groups]) => {
    const [left, right] = [...groups].sort();
    const leftSems = byGroup.get(left) ?? [];
    const rightSems = byGroup.get(right) ?? [];
    const available = leftSems.length > 0 && rightSems.length > 0 && groups.size === 2;
    const leftConverges = leftSems.length > 0 && new Set(leftSems.map((sem) => JSON.stringify(sem))).size === 1;
    const rightConverges = rightSems.length > 0 && new Set(rightSems.map((sem) => JSON.stringify(sem))).size === 1;
    const distinct = available ? leftSems.every((leftSem) => rightSems.every((rightSem) => !compareSem(leftSem, rightSem).exactCanonical)) : null;
    return { pairId, groups: [...groups].sort(), available, leftConverges, rightConverges, distinct };
  });
  return {
    familiesDefined: pairResults.length,
    familiesWithBothOutputs: pairResults.filter((pair) => pair.available).length,
    meaningDistinctionPreserved: pairResults.filter((pair) => pair.distinct === true).length,
    falseEquivalence: pairResults.filter((pair) => pair.distinct === false).length,
    pairResults
  };
}

export function scoreNaturalSourceOnlyExtraction(root = 'experiments/natural-development-v5') {
  const subset = loadJsonLines(`${root}/certified-subset.jsonl`);
  const ledger = loadJsonLines(`${root}/extraction/candidate-ledger.jsonl`);
  const requests = loadJsonLines(`${root}/extraction/source-only-request.jsonl`);
  const privateMap = JSON.parse(fs.readFileSync(`${root}/extraction/source-only-private-map.json`, 'utf8'));
  const { ledgerByHandle } = validateRequestLedgerBindings(requests, ledger);
  const sourceRow = new Map(subset.map((row) => [row.id, row]));
  if (sourceRow.size !== subset.length) throw new Error('duplicate_source_row_id');
  validatePrivateSourceMap(privateMap, requests, sourceRow);

  const results = [];
  for (const request of requests) {
    const row = sourceRow.get(privateMap[request.handle]?.sourceRowId);
    if (!row) throw new Error(`source_mapping_missing:${request.handle}`);
    if (request.sourceLanguage !== row.source.language || request.sourceText !== row.source.text) throw new Error(`request_source_content_mismatch:${request.handle}`);

    const entry = ledgerByHandle.get(request.handle);
    const candidateStatus = classifyLedgerEntry(entry);
    let submission = null;
    if (candidateStatus === 'parse') {
      submission = submitCandidate({
        sourceText: request.sourceText,
        sourceLanguage: request.sourceLanguage,
        candidateSem: entry.candidateSem,
        provenance: {
          extractorType: entry.extractorType ?? 'codex_agent',
          extractorId: entry.extractorId ?? 'fresh-source-only',
          contractHash: request.contractHash
        }
      });
    }

    let gold = null;
    if (row.target.outcome === 'parse') {
      const ir = { version: 'lunum-ir/0.1', outcome: 'parse', ...row.target.ir };
      gold = buildCandidateFromSemanticIR(ir).sem;
    }
    const goldSubmission = gold
      ? submitCandidate({ sourceText: request.sourceText, sourceLanguage: request.sourceLanguage, candidateSem: gold, provenance: { extractorType: 'other' } })
      : null;

    const candidateClause = submission?.sem?.clauses?.[0];
    const goldClause = goldSubmission?.sem?.clauses?.[0];
    const structural = candidateClause && goldClause ? {
      world: submission.sem.world === goldSubmission.sem.world,
      kind: submission.sem.kind === goldSubmission.sem.kind,
      predicate: candidateClause.predicate === goldClause.predicate,
      negated: Boolean(candidateClause.negated) === Boolean(goldClause.negated),
      roleNames: JSON.stringify(Object.keys(candidateClause.roles).sort()) === JSON.stringify(Object.keys(goldClause.roles).sort()),
      roleTypes: Object.keys(goldClause.roles).every((key) => candidateClause.roles[key]?.type === goldClause.roles[key]?.type)
    } : null;
    const semanticComparison = submission?.sem && goldSubmission?.sem ? compareSem(goldSubmission.sem, submission.sem, { explain: true }) : null;
    const sourceRelative = submission?.sem && goldSubmission?.sem ? compareSourceRelativeSemantics(goldSubmission.sem, submission.sem) : null;
    const identityComparable = Boolean(
      submission?.candidateIdentityAvailable
      && goldSubmission?.candidateIdentityAvailable
      && identityRepresentationsComparable(submission.sem, goldSubmission.sem)
    );
    const exact = identityComparable
      ? Boolean(submission.semanticFingerprint && goldSubmission.semanticFingerprint && submission.semanticFingerprint === goldSubmission.semanticFingerprint)
      : null;
    const abstentionCorrect = row.target.outcome === 'abstain' && candidateStatus === 'abstain';

    results.push({
      handle: request.handle,
      sourceRowId: row.id,
      language: request.sourceLanguage,
      targetOutcome: row.target.outcome,
      candidateStatus,
      submission,
      structural,
      semanticComparison,
      sourceRelative,
      candidateIdentityAvailable: Boolean(submission?.candidateIdentityAvailable),
      goldIdentityAvailable: Boolean(goldSubmission?.candidateIdentityAvailable),
      identityComparable,
      exact,
      abstentionCorrect,
      sourceSha256: sha256(request.sourceText)
    });
  }

  const parse = results.filter((row) => row.targetOutcome === 'parse');
  const abstain = results.filter((row) => row.targetOutcome === 'abstain');
  const valid = (field) => results.filter((row) => row.submission?.[field] === true).length;
  const groupById = new Map();
  for (const row of subset) if (!groupById.has(row.source.semanticGroup)) groupById.set(row.source.semanticGroup, []);
  for (const result of results) groupById.get(sourceRow.get(result.sourceRowId).source.semanticGroup)?.push(result);
  const groups = [...groupById].map(([group, members]) => summarizeGroup(group, members));
  const criticalContrasts = summarizeCriticalContrasts(subset, sourceRow, results);
  const explicitAbstentions = results.filter((row) => row.candidateStatus === 'abstain').length;
  const missing = results.filter((row) => row.candidateStatus === 'missing').length;
  const malformed = results.filter((row) => row.candidateStatus === 'malformed').length;
  const certification = JSON.parse(fs.readFileSync(`${root}/certification-report.json`, 'utf8'));

  return {
    format: 'openlunum-natural-source-only-extraction/0.2',
    status: 'diagnostic-development-only',
    protected: false,
    localInferenceUsed: false,
    procedure: {
      oneFirstPassPerItem: true,
      deterministicRepair: false,
      sourceOnlyRequest: `${root}/extraction/source-only-request.jsonl`,
      contract: `${root}/extraction/source-only-contract.json`,
      extractor: 'fresh isolated agent; packet restricted to source-only request and frozen contract',
      goldIsolation: 'extractor was instructed not to read certified subset, reviews, manifests, or generator files; scorer accesses gold privately',
      exactIdentityRule: 'exact identity is scored only when candidate and target have available identities and corresponding role terms use compatible reference/literal identity modes'
    },
    corpus: {
      rows: results.length,
      parseTargets: parse.length,
      abstentionTargets: abstain.length,
      languages: [...new Set(results.map((row) => row.language))].sort(),
      datasetSha256: certification.datasetSha256
    },
    stages: {
      parseSubmissions: results.filter((row) => row.submission).length,
      explicitAbstentions,
      missing,
      malformed,
      transportValid: valid('transportValid'),
      structuralValid: valid('structuralValid'),
      protocolCanonical: valid('protocolCanonical'),
      frameValid: valid('frameValid'),
      grounded: valid('grounded'),
      identityAvailable: valid('candidateIdentityAvailable')
    },
    parse: {
      attempts: parse.length,
    exact: parse.filter((row) => row.exact === true).length,
    sourceRelativeMatch: parse.filter((row) => row.sourceRelative?.status === 'match').length,
    sourceRelativeMismatch: parse.filter((row) => row.sourceRelative?.status === 'mismatch').length,
    sourceRelativeUnresolved: parse.filter((row) => row.sourceRelative?.status === 'unresolved').length,
    sourceRelativeContractUnresolved: parse.reduce((sum, row) => sum + (row.sourceRelative?.contractUnresolved ?? 0), 0),
      identityComparable: parse.filter((row) => row.identityComparable).length,
      exactNotComparable: parse.filter((row) => row.exact === null).length,
      falseAbstentions: parse.filter((row) => row.candidateStatus === 'abstain').length,
      missing: parse.filter((row) => row.candidateStatus === 'missing').length,
      malformed: parse.filter((row) => row.candidateStatus === 'malformed').length,
      semanticHardMismatches: parse.filter((row) => row.semanticComparison?.hardMismatch === true).length,
      structural: {
        world: parse.filter((row) => row.structural?.world).length,
        kind: parse.filter((row) => row.structural?.kind).length,
        predicate: parse.filter((row) => row.structural?.predicate).length,
        negated: parse.filter((row) => row.structural?.negated).length,
        roleNames: parse.filter((row) => row.structural?.roleNames).length,
        roleTypes: parse.filter((row) => row.structural?.roleTypes).length,
        modality: parse.filter((row) => row.sourceRelative?.details?.some((detail) => detail.children?.some((child) => child.field === 'modality' && child.status === 'match'))).length,
        nested: parse.filter((row) => row.sourceRelative?.details?.some((detail) => detail.path.includes('.conditions[') || detail.path.includes('.consequences['))).length
      },
      byLanguage: Object.fromEntries([...new Set(parse.map((row) => row.language))].sort().map((language) => {
        const rows = parse.filter((row) => row.language === language);
        return [language, {
          attempts: rows.length,
          submitted: rows.filter((row) => row.submission).length,
          exact: rows.filter((row) => row.exact === true).length,
          identityComparable: rows.filter((row) => row.identityComparable).length,
          hardMismatches: rows.filter((row) => row.semanticComparison?.hardMismatch === true).length
        }];
      }))
    },
    abstention: {
      targets: abstain.length,
      correct: abstain.filter((row) => row.abstentionCorrect).length,
      unexpectedParses: abstain.filter((row) => row.candidateStatus === 'parse').length,
      missing: abstain.filter((row) => row.candidateStatus === 'missing').length,
      malformed: abstain.filter((row) => row.candidateStatus === 'malformed').length
    },
    multilingual: {
      groups: groups.length,
      completeParseGroups: groups.filter((group) => group.completeParseOutputs).length,
      completeAbstentionGroups: groups.filter((group) => group.allExplicitAbstentions).length,
      candidateConverging: groups.filter((group) => group.candidateConverges).length,
      groupResults: groups
    },
    criticalContrasts: {
      ...criticalContrasts,
      note: 'Contrast labels remain scorer-private; a family is counted only when both candidate outputs are present, and distinction uses candidate semantics rather than candidate absence.'
    },
    items: results
  };
}

export function writeNaturalSourceOnlyExtractionReport(root, outputFile) {
  const report = scoreNaturalSourceOnlyExtraction(root);
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

function main() {
  const root = process.argv[2] ?? 'experiments/natural-development-v5';
  const outputFile = process.argv[3] ?? `${root}/extraction/results-revised-v2.json`;
  const report = writeNaturalSourceOnlyExtractionReport(root, outputFile);
  console.log(JSON.stringify({ rows: report.corpus.rows, parse: report.parse, abstention: report.abstention, stages: report.stages, multilingual: report.multilingual }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
