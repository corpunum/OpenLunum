#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TRAINING_DATA_VERSION = 'lunum-training/0.1';
const LANGUAGES = new Set(['en', 'el', 'es', 'fr', 'de', 'id']);
const SPLITS = new Set(['train', 'dev', 'holdout', 'protected-template']);
const OUTCOMES = new Set(['parse', 'abstain']);

const textKey = (value) => String(value).normalize('NFKC').trim().toLocaleLowerCase();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function validateTrainingExample(example) {
  const errors = [];
  if (!example || typeof example !== 'object' || Array.isArray(example)) return ['example must be an object'];
  if (typeof example.id !== 'string' || !/^[a-z0-9][a-z0-9._-]+$/.test(example.id)) errors.push('id invalid');
  if (!SPLITS.has(example.split)) errors.push('split invalid');
  const source = example.source;
  if (!source || typeof source !== 'object') errors.push('source missing');
  else {
    if (typeof source.text !== 'string' || !source.text.trim()) errors.push('source.text missing');
    if (!LANGUAGES.has(source.language)) errors.push('source.language unsupported');
    for (const field of ['semanticGroup', 'templateFamily']) if (typeof source[field] !== 'string' || !source[field]) errors.push(`source.${field} missing`);
    for (const field of ['entityIds', 'conceptIds', 'externalGroundingIds']) {
      if (source[field] !== undefined && (!Array.isArray(source[field]) || source[field].some((v) => typeof v !== 'string'))) errors.push(`source.${field} invalid`);
    }
  }
  const target = example.target;
  if (!target || typeof target !== 'object' || !OUTCOMES.has(target.outcome)) errors.push('target.outcome invalid');
  if (target?.outcome === 'parse' && (!target.ir || typeof target.ir !== 'object')) errors.push('parse target.ir missing');
  if (target?.outcome === 'abstain' && !['unsupported', 'ambiguous', 'unresolved'].includes(target.abstentionReason)) errors.push('abstentionReason invalid');
  const provenance = example.provenance;
  if (!provenance || typeof provenance !== 'object') errors.push('provenance missing');
  else {
    for (const field of ['sourceKind', 'annotationMethod', 'license', 'createdAt', 'generatorVersion']) if (typeof provenance[field] !== 'string' || !provenance[field]) errors.push(`provenance.${field} missing`);
  }
  const review = example.review;
  if (!review || typeof review !== 'object' || !['pending', 'accepted', 'rejected', 'needs-review'].includes(review.status)) errors.push('review invalid');
  else if (!Array.isArray(review.reviewers) || review.reviewers.length === 0 || review.reviewers.some((v) => typeof v !== 'string' || !v)) errors.push('review.reviewers invalid');
  return errors;
}

export function validateConceptDisjointSplits(examples) {
  const errors = [];
  const seen = new Map();
  for (const example of examples) {
    const source = example.source ?? {};
    const keys = [
      ['semanticGroup', source.semanticGroup],
      ['templateFamily', source.templateFamily],
      ...((source.conceptIds ?? []).map((v) => ['conceptId', v])),
      ...((source.entityIds ?? []).map((v) => ['entityId', v])),
      ...((source.externalGroundingIds ?? []).map((v) => ['externalGroundingId', v])),
      ['sourceText', textKey(source.text ?? '')]
    ];
    for (const [kind, value] of keys) {
      if (!value) continue;
      const prior = seen.get(`${kind}:${value}`);
      if (prior && prior.split !== example.split) errors.push(`${kind}:${value} crosses ${prior.split}/${example.split} (${prior.id}/${example.id})`);
      else if (!prior) seen.set(`${kind}:${value}`, { id: example.id, split: example.split });
    }
  }
  return errors;
}

export function summarizeTrainingDataset(examples) {
  const by = (field) => Object.fromEntries([...new Set(examples.map((e) => field(e)))].sort().map((key) => [key, examples.filter((e) => field(e) === key).length]));
  return {
    version: TRAINING_DATA_VERSION,
    rows: examples.length,
    independentSemanticGroups: new Set(examples.map((e) => e.source?.semanticGroup).filter(Boolean)).size,
    languages: by((e) => e.source?.language ?? 'missing'),
    splits: by((e) => e.split ?? 'missing'),
    outcomes: by((e) => e.target?.outcome ?? 'missing'),
    templateFamilies: by((e) => e.source?.templateFamily ?? 'missing'),
    accepted: examples.filter((e) => e.review?.status === 'accepted').length,
    pendingReview: examples.filter((e) => e.review?.status !== 'accepted').length,
    hardNegativeRows: examples.filter((e) => (e.target?.criticalNegativePairIds?.length ?? 0) > 0).length,
    datasetSha256: sha256(examples.map((e) => JSON.stringify(e)).join('\n'))
  };
}

export function classifyFailureState(state) {
  if (!state || typeof state !== 'object') return { category: 'TRULY_UNKNOWN', reason: 'missing structured state' };
  if (state.providerSuccess === false) return { category: 'TRANSPORT_PROVIDER_FAILURE', reason: 'provider failed' };
  if (state.transportSchemaValid === false) return { category: 'TRANSPORT_SCHEMA_FAILURE', reason: 'transport/schema invalid' };
  if (state.jsonValid === false) return { category: 'INVALID_JSON', reason: 'JSON parse failed' };
  if (state.structuralValid === false) return { category: 'STRUCTURAL_FAILURE', reason: 'structural validation failed' };
  if (state.protocolCanonical === false) return { category: 'PROTOCOL_NONCANONICAL', reason: 'protocol canonicality failed' };
  if (state.frameValid === false) return { category: 'FRAME_NONCANONICAL', reason: 'semantic frame failed' };
  if (state.grounded === false) return { category: 'GROUNDING_FAILURE', reason: 'grounding failed' };
  if (state.candidateIdentityAvailable === false) return { category: 'IDENTITY_UNAVAILABLE', reason: 'candidate identity unavailable' };
  if (state.semanticIdentityExact === true) return { category: 'EXACT', reason: 'candidate identity equals gold' };
  if (state.semanticIdentityExact === false) return { category: 'SEMANTIC_INTERPRETATION_OR_GROUNDING', reason: state.identityDiff ?? 'identity differs' };
  if (state.expectedOutcome === 'abstain' && state.abstained === true) return { category: 'CORRECT_ABSTENTION', reason: 'explicit abstention accepted' };
  if (state.expectedOutcome === 'abstain' && state.abstained === false) return { category: 'UNEXPECTED_PARSE', reason: 'abstention target parsed' };
  if (state.expectedOutcome === 'parse' && state.abstained === true) return { category: 'UNEXPECTED_ABSTENTION', reason: 'parse target abstained' };
  return { category: 'TRULY_UNKNOWN', reason: 'structured state did not identify a stage' };
}

export function loadJsonLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`invalid JSONL at line ${index + 1}: ${error.message}`); }
  });
}

function main() {
  const [command, file] = process.argv.slice(2);
  if (!command || !file) throw new Error('usage: training-program.mjs <validate|summary|failure-breakdown> <json|jsonl>');
  const resolved = path.resolve(file);
  const examples = file.endsWith('.jsonl') ? loadJsonLines(resolved) : JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(examples)) throw new Error('dataset must be an array or JSONL');
  if (command === 'validate') {
    const rowErrors = examples.flatMap((e) => validateTrainingExample(e).map((error) => `${e?.id ?? '<missing>'}: ${error}`));
    const splitErrors = validateConceptDisjointSplits(examples);
    const result = { valid: rowErrors.length === 0 && splitErrors.length === 0, rowErrors, splitErrors, summary: summarizeTrainingDataset(examples) };
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.valid ? 0 : 1; return;
  }
  if (command === 'summary') { console.log(JSON.stringify(summarizeTrainingDataset(examples), null, 2)); return; }
  throw new Error(`unsupported command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
