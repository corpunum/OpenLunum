#!/usr/bin/env node
// Offline evaluation only. Neither fingerprints nor caller confidence are fidelity evidence.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  basicIdentifier, normalizeSemanticCandidate, semanticFingerprint, stableStringify,
  validateSemanticCandidate, validateSemFrames, getExtractionContract, checkLiteralRetention,
} from '../../packages/core/dist/src/index.js';
import { buildExtractionSchema, validateEvaluationGold } from '../../packages/eval/dist/src/parse-experiment.js';
import { observedExtractionContracts } from './replay-client-events.mjs';

const require = createRequire(new URL('../../packages/eval/package.json', import.meta.url));
const { Ajv2020 } = require('ajv/dist/2020.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const schemaPath = path.join(root, 'schemas/lunum-sem.schema.json');
const schemaRaw = fs.readFileSync(schemaPath);
const extractionSchema = buildExtractionSchema(JSON.parse(schemaRaw));
const transport = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(schemaRaw));
export const MEANING_SCORER_VERSION = 'openlunum-recorded-meaning/0.1';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jsonl = raw => raw.split(/\r?\n/u).filter(line => line.trim()).map(JSON.parse);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const evidenceFields = new Set(['language', 'token', 'surface', 'span', 'sourceSpan', 'provenance', 'provider', 'metadata', 'annotations']);

/** Position- and role-bound atoms, not a bag of literals. Arrays retain order and multiplicity. */
export function meaningAtoms(sem) {
  const atoms = [];
  const add = (atomPath, value, dimension) => atoms.push({ path: atomPath, value, dimension });
  const term = (value, atomPath, dimension) => {
    if (Array.isArray(value)) {
      add(`${atomPath}.length`, value.length, dimension);
      value.forEach((item, index) => term(item, `${atomPath}[${index}]`, dimension));
    } else if (record(value)) {
      add(`${atomPath}.$shape`, 'object', dimension);
      for (const key of Object.keys(value).sort()) {
        if (evidenceFields.has(key)) continue;
        const item = value[key];
        if (item === undefined) continue;
        const itemPath = `${atomPath}.${key}`;
        if (['id', 'ref', 'type', 'unit', 'format'].includes(key) && typeof item === 'string') {
          add(itemPath, basicIdentifier(item), key === 'type' ? 'termType' : dimension);
        } else term(item, itemPath, dimension);
      }
    } else {
      add(atomPath, typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : value, dimension);
    }
  };
  const clauses = (items, atomPath, relation = 'clause') => {
    add(`${atomPath}.length`, items.length, relation);
    items.forEach((clause, index) => {
      const prefix = `${atomPath}[${index}]`;
      add(`${prefix}.$clause`, true, relation);
      add(`${prefix}.predicate`, clause.predicate, 'predicate');
      add(`${prefix}.negated`, clause.negated === true, 'negation');
      add(`${prefix}.modality`, clause.modality ?? null, 'modality');
      for (const role of Object.keys(clause.roles).sort()) {
        add(`${prefix}.roles.${role}.$role`, true, 'role');
        term(clause.roles[role], `${prefix}.roles.${role}`, 'role');
      }
      if (clause.time !== undefined) term(clause.time, `${prefix}.time`, 'time');
      clauses(clause.conditions ?? [], `${prefix}.conditions`, 'condition');
      clauses(clause.consequences ?? [], `${prefix}.consequences`, 'consequence');
      // Do not silently discard unknown meaning fields when inspecting historical candidates.
      for (const key of Object.keys(clause).sort()) {
        if (!['predicate', 'roles', 'negated', 'modality', 'time', 'conditions', 'consequences', 'annotations'].includes(key)) {
          term(clause[key], `${prefix}.${key}`, 'unclassified');
        }
      }
    });
  };
  for (const field of ['schema', 'world', 'kind']) add(field, sem[field], field);
  clauses(sem.clauses, 'clauses');
  const refs = [...new Set((sem.references ?? []).filter(ref => ref.referenceKind !== 'surface-evidence')
    .map(ref => typeof (ref.ref ?? ref.id) === 'string' ? basicIdentifier(ref.ref ?? ref.id) : stableStringify(ref)))].sort();
  refs.forEach(ref => add(`references.${ref}`, ref, 'reference'));
  for (const key of Object.keys(sem).sort()) {
    if (!['schema', 'world', 'kind', 'clauses', 'references', 'provenance', 'annotations'].includes(key)) term(sem[key], key, 'unclassified');
  }
  return atoms;
}

function candidateStages(sem) {
  const transportValid = Boolean(transport(sem));
  const transportErrors = transportValid ? [] : structuredClone(transport.errors);
  const structural = validateSemanticCandidate(sem);
  const normalized = structural.ok ? normalizeSemanticCandidate(sem, { strict: true }) : null;
  const frames = normalized?.canonical ? validateSemFrames(normalized.sem) : null;
  let identityValid = false;
  if (normalized?.canonical && frames?.valid) {
    try { semanticFingerprint(normalized.sem); identityValid = true; } catch { /* reported separately */ }
  }
  return {
    transportValid, transportErrors, structuralValid: structural.ok, structuralErrors: structural.errors,
    protocolCanonical: Boolean(normalized?.canonical), normalizationStatus: normalized?.status ?? null,
    frameValid: Boolean(frames?.valid), frameIssues: frames?.issues ?? [], identityValid,
    sem: transportValid && normalized?.canonical ? normalized.sem : sem,
  };
}

function compareAtoms(expected, actual) {
  const key = atom => stableStringify([atom.path, atom.value]);
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = new Set(actual.map(key));
  const matched = expected.filter(atom => actualKeys.has(key(atom)));
  const missing = expected.filter(atom => !actualKeys.has(key(atom)));
  const extra = actual.filter(atom => !expectedKeys.has(key(atom)));
  return { expected: expected.length, observed: actual.length, matched: matched.length,
    recall: expected.length ? matched.length / expected.length : null,
    precision: actual.length ? matched.length / actual.length : null, missing, extra };
}

/**
 * Pure Sem-to-Sem representation comparison, not source/gold qualification.
 * Source-bound evaluation must first use validateMeaningTargets below; never
 * synthesize a source sentence to make a Sem-only target pass that gate.
 */
export function compareMeaningSem(expected, actual) {
  const gold = candidateStages(expected);
  if (!gold.transportValid || !gold.structuralValid || !gold.protocolCanonical
    || gold.normalizationStatus !== 'canonical' || !gold.frameValid || !gold.identityValid) {
    throw new Error(`invalid_meaning_target:${JSON.stringify({ ...gold, sem: undefined })}`);
  }
  const stages = candidateStages(actual);
  const expectedAtoms = meaningAtoms(expected);
  const actualAtoms = stages.structuralValid ? meaningAtoms(stages.sem) : [];
  const features = compareAtoms(expectedAtoms, actualAtoms);
  const dimensions = Object.fromEntries([...new Set([...expectedAtoms, ...actualAtoms].map(atom => atom.dimension))].sort()
    .map(dimension => [dimension, compareAtoms(expectedAtoms.filter(atom => atom.dimension === dimension), actualAtoms.filter(atom => atom.dimension === dimension))]));
  const valid = stages.transportValid && stages.structuralValid && stages.protocolCanonical && stages.frameValid && stages.identityValid;
  const failureClasses = [];
  if (!stages.transportValid) failureClasses.push('TRANSPORT_SCHEMA_INVALID');
  if (!stages.structuralValid) failureClasses.push('SEMANTIC_SCHEMA_INVALID');
  if (!stages.protocolCanonical) failureClasses.push('UNKNOWN_PROTOCOL_SYMBOL');
  if (!stages.frameValid) failureClasses.push('FRAME_INVALID');
  if (!stages.identityValid) failureClasses.push('IDENTITY_UNAVAILABLE');
  for (const [dimension, failure] of Object.entries({ predicate: 'WRONG_PREDICATE', negation: 'WRONG_NEGATION', modality: 'WRONG_MODALITY',
    role: 'WRONG_ROLE_OR_LITERAL', termType: 'WRONG_TERM_TYPE', time: 'WRONG_TIME', condition: 'WRONG_CONDITION',
    consequence: 'WRONG_CONSEQUENCE', reference: 'WRONG_REFERENCE', kind: 'WRONG_KIND', world: 'WRONG_WORLD' })) {
    if (dimensions[dimension]?.missing.length || dimensions[dimension]?.extra.length) failureClasses.push(failure);
  }
  if (features.missing.length) failureClasses.push('MISSING_OR_CHANGED_INFORMATION');
  if (features.extra.length) failureClasses.push('EXTRA_OR_CHANGED_INFORMATION');
  return { status: !valid ? 'invalid' : features.missing.length || features.extra.length ? 'mismatch' : 'match',
    stages: { ...stages, sem: undefined }, failureClasses, features, dimensions };
}

function unique(rows, field, label) {
  const map = new Map();
  for (const row of rows) {
    const key = row[field];
    if (typeof key !== 'string' || !key || map.has(key)) throw new Error(`duplicate_or_missing_${label}:${key}`);
    map.set(key, row);
  }
  return map;
}

export function validateMeaningTargets(targets, probes) {
  const byId = unique(probes, 'handle', 'probe');
  const targetById = unique(targets, 'probeId', 'target');
  if (byId.size !== targetById.size) throw new Error('target_population_mismatch');
  const goldItems = [];
  for (const target of targets) {
    const probe = byId.get(target.probeId);
    if (!probe || target.sourceText !== probe.text || target.language !== probe.language || target.expectedOutcome !== probe.expectedOutcome) throw new Error(`target_source_metadata_mismatch:${target.probeId}`);
    if (!['reviewed', 'unresolved'].includes(target.reviewStatus) || typeof target.reviewNote !== 'string' || !target.reviewNote.trim()) throw new Error(`target_review_missing:${target.probeId}`);
    if (target.reviewStatus === 'unresolved') {
      if (target.goldSem !== null) throw new Error(`unresolved_target_has_gold:${target.probeId}`);
      continue;
    }
    if ((target.expectedOutcome === 'abstain') !== (target.goldSem === null)) throw new Error(`target_outcome_gold_mismatch:${target.probeId}`);
    if (target.goldSem !== null && !checkLiteralRetention(target.sourceText, target.goldSem).retained) throw new Error(`target_source_literal_missing:${target.probeId}`);
    goldItems.push({ id: target.probeId, sourceText: target.sourceText, sourceLanguage: target.language,
      expectedOutcome: target.expectedOutcome, goldSem: target.goldSem });
  }
  const report = validateEvaluationGold(goldItems, extractionSchema);
  if (report.invalid.length) throw new Error(`invalid_meaning_targets:${JSON.stringify(report.invalid)}`);
  return { ...report, total: targets.length, reviewed: goldItems.length, unresolved: targets.length - goldItems.length };
}

export function scoreRecordedMeaning({ probes, requests, candidates, runs, targets }) {
  const goldValidation = validateMeaningTargets(targets, probes);
  const requestByHandle = unique(requests, 'handle', 'request');
  const candidateByHandle = unique(candidates, 'handle', 'candidate');
  const runByHandle = unique(runs, 'handle', 'run');
  if (requests.length !== probes.length) throw new Error('request_population_mismatch');
  const requestBySource = new Map();
  for (const request of requests) {
    const key = stableStringify([request.sourceLanguage, request.sourceText]);
    if (sha256(request.sourceText) !== request.sourceSha256 || requestBySource.has(key)) throw new Error(`request_source_binding_invalid:${request.handle}`);
    requestBySource.set(key, request);
  }
  for (const row of [...candidates, ...runs]) if (!requestByHandle.has(row.handle)) throw new Error(`unknown_evidence_handle:${row.handle}`);
  const items = targets.map(target => {
    const request = requestBySource.get(stableStringify([target.language, target.sourceText]));
    if (!request) throw new Error(`request_source_missing:${target.probeId}`);
    const candidate = candidateByHandle.get(request.handle);
    const run = runByHandle.get(request.handle);
    if (candidate && (candidate.sourceSha256 !== request.sourceSha256 || !/^[a-f0-9]{64}$/u.test(candidate.contractHash ?? ''))) throw new Error(`candidate_binding_invalid:${request.handle}`);
    if (candidate && run && (candidate.status !== run.status || stableStringify(candidate.candidateSem) !== stableStringify(run.candidateSem))) throw new Error(`candidate_run_mismatch:${request.handle}`);
    const validShape = candidate && ((candidate.status === 'abstain' && candidate.candidateSem === null) || (candidate.status === 'parse' && record(candidate.candidateSem)));
    const observed = !candidate || !run ? 'missing' : run.failure || run.exitCode !== 0 ? 'failed' : !validShape ? 'malformed' : candidate.status;
    const outcomeCorrect = observed === target.expectedOutcome && (observed !== 'parse' || run.lastSubmission?.candidateIdentityAvailable === true);
    const comparison = target.reviewStatus === 'reviewed' && target.goldSem !== null
      ? compareMeaningSem(target.goldSem, observed === 'parse' ? candidate.candidateSem : null) : null;
    const meaningStatus = target.reviewStatus === 'unresolved' ? 'unresolved'
      : target.expectedOutcome === 'abstain' ? (observed === 'abstain' ? 'declared_correct_abstention' : 'wrong_outcome')
      : observed !== 'parse' ? observed : comparison.status;
    return { probeId: target.probeId, handle: request.handle, language: target.language, sourceText: target.sourceText,
      sourceSha256: request.sourceSha256, expectedOutcome: target.expectedOutcome, observed, outcomeCorrect,
      reviewStatus: target.reviewStatus, reviewNote: target.reviewNote, meaningStatus, comparison,
      candidateSem: candidate?.candidateSem ?? null, contractHash: candidate?.contractHash ?? null,
      recordedIdentityAvailable: run?.lastSubmission?.candidateIdentityAvailable ?? false,
      recordedCoreAbstentionSubmitted: run?.abstentionSubmitted === true,
      recordedContractVersion: run?.observedContractVersion ?? null,
      rawStream: run?.rawStream ?? null, rawStreamSha256: run?.rawStreamSha256 ?? null,
      failureClasses: target.reviewStatus === 'unresolved' ? ['REVIEW_UNRESOLVED'] : observed !== target.expectedOutcome
        ? [observed === 'abstain' ? 'UNEXPECTED_ABSTENTION' : observed === 'parse' ? 'UNEXPECTED_PARSE' : observed.toUpperCase()]
        : comparison?.failureClasses ?? [],
    };
  });
  const summarize = rows => {
    const features = rows.filter(row => row.comparison).map(row => row.comparison.features);
    const sums = features.reduce((s, f) => ({ expected: s.expected + f.expected, observed: s.observed + f.observed, matched: s.matched + f.matched }), { expected: 0, observed: 0, matched: 0 });
    const match = rows.filter(row => row.meaningStatus === 'match').length;
    const abstain = rows.filter(row => row.meaningStatus === 'declared_correct_abstention').length;
    return { total: rows.length, outcomeCorrect: rows.filter(row => row.outcomeCorrect).length,
      reviewed: rows.filter(row => row.reviewStatus === 'reviewed').length,
      unresolved: rows.filter(row => row.meaningStatus === 'unresolved').length,
      exactRepresentationMatches: match, correctDeclaredAbstentions: abstain,
      coreAbstentionsSubmitted: rows.filter(row => row.meaningStatus === 'declared_correct_abstention' && row.recordedCoreAbstentionSubmitted).length,
      reviewedMatchesOrDeclaredAbstentions: match + abstain,
      statusCounts: Object.fromEntries([...new Set(rows.map(row => row.meaningStatus))].sort().map(s => [s, rows.filter(row => row.meaningStatus === s).length])),
      failureClasses: Object.fromEntries([...new Set(rows.flatMap(row => row.failureClasses))].sort().map(f => [f, rows.filter(row => row.failureClasses.includes(f)).length])),
      features: { ...sums, recall: sums.expected ? sums.matched / sums.expected : null, precision: sums.observed ? sums.matched / sums.observed : null },
      featureDenominators: { reviewedParseTargets: features.length, fullTaskPopulation: rows.length, unresolvedExcludedFromFeatures: rows.filter(row => row.meaningStatus === 'unresolved').length },
    };
  };
  return { format: MEANING_SCORER_VERSION, status: 'diagnostic-self-reviewed-not-protected', protected: false,
    newModelCalls: 0, goldValidation, overall: summarize(items),
    byLanguage: Object.fromEntries([...new Set(items.map(item => item.language))].sort().map(language => [language, summarize(items.filter(item => item.language === language))])), items };
}

/** File-bound replay. Never overwrites evidence, and verifies every referenced raw stream. */
export function scoreRecordedMeaningFiles(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  if (manifest.format !== 'openlunum-recorded-meaning-input/0.1' || manifest.review?.independent !== false || manifest.review?.nativeSpeaker !== false) throw new Error('invalid_diagnostic_review_manifest');
  const contract = getExtractionContract();
  const requiredContract = { schemaSha256: sha256(schemaRaw), agent: contract.contractVersion, protocol: contract.protocol.version,
    frames: contract.frames.version, identity: contract.identity.version };
  if (stableStringify(manifest.scoringContract) !== stableStringify(requiredContract)) throw new Error('scoring_contract_binding_mismatch');
  const artifacts = {};
  const load = name => {
    const binding = manifest.inputs[name];
    if (!binding || !/^[a-f0-9]{64}$/u.test(binding.sha256 ?? '')) throw new Error(`missing_artifact_binding:${name}`);
    const raw = fs.readFileSync(path.resolve(root, binding.path));
    if (sha256(raw) !== binding.sha256) throw new Error(`artifact_hash_mismatch:${name}`);
    artifacts[name] = binding;
    return ['probes', 'summary', 'package'].includes(name) ? JSON.parse(raw) : jsonl(raw.toString());
  };
  const input = Object.fromEntries(['probes', 'requests', 'candidates', 'runs', 'targets'].map(name => [name, load(name)]));
  const summary = load('summary');
  const pkg = load('package');
  if (summary.packageSha256 !== artifacts.package.sha256 || summary.package !== artifacts.package.path || !/^[a-f0-9]{64}$/u.test(pkg.freeze?.coreContractHash ?? '')) throw new Error('historical_package_binding_mismatch');
  if (summary.requestsSha256 !== artifacts.requests.sha256 || summary.candidateLedgerSha256 !== artifacts.candidates.sha256 || summary.runLedgerSha256 !== artifacts.runs.sha256) throw new Error('historical_summary_hash_mismatch');
  const observedContractHashes = new Set();
  for (const run of input.runs) {
    if (!run.rawStream || !/^[a-f0-9]{64}$/u.test(run.rawStreamSha256 ?? '')) throw new Error(`raw_stream_binding_missing:${run.handle}`);
    const stream = path.resolve(root, path.dirname(artifacts.runs.path), run.rawStream);
    const raw = fs.readFileSync(stream);
    if (sha256(raw) !== run.rawStreamSha256) throw new Error(`raw_stream_hash_mismatch:${run.handle}`);
    const observed = observedExtractionContracts(jsonl(raw.toString()));
    if (!observed.length || observed.some(row => row.contract.contractVersion !== pkg.freeze.coreContractVersion || sha256(stableStringify(row.contract)) !== pkg.freeze.coreContractHash)) throw new Error(`observed_contract_binding_mismatch:${run.handle}`);
    observed.forEach(row => observedContractHashes.add(sha256(stableStringify(row.contract))));
    if (run.observedContractVersion !== pkg.freeze.coreContractVersion || input.candidates.find(row => row.handle === run.handle)?.contractHash !== pkg.freeze.coreContractHash) throw new Error(`ledger_contract_binding_mismatch:${run.handle}`);
  }
  return { ...scoreRecordedMeaning(input), provenance: {
    implementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    scorerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), schemaSha256: sha256(schemaRaw),
    evaluatedContract: getExtractionContract().contractVersion, manifestSha256: sha256(fs.readFileSync(manifestPath)), artifacts,
    observedHistoricalContractHashes: [...observedContractHashes],
    originalRun: { codeCommit: summary.codeCommit, requestedModel: summary.requestedModel, reportedModels: summary.reportedModels, originalCostUsd: summary.totalCostUsd, observedContractVersions: summary.observedContractVersions },
    originalRunValidity: 'Not certified by this re-scoring: the historical runner has documented artifact-binding limitations. File hashes and raw-stream hashes are checked here, not provider execution independently reproduced.',
    review: manifest.review, interpretation: 'Offline strict representation diagnostics on post-hoc reviewed visible data. Unresolved rows prevent a complete meaning-accuracy claim. Current validity checks are not a live re-run of the original extractor.',
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , manifestPath, outputPath] = process.argv;
  if (!manifestPath || !outputPath) throw new Error('usage: score-recorded-meaning.mjs <bound-input-manifest.json> <new-output.json>');
  const report = scoreRecordedMeaningFiles(manifestPath);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ goldValidation: report.goldValidation, overall: report.overall, byLanguage: report.byLanguage }, null, 2));
}
