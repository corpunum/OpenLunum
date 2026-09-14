#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadJsonLines, validateTrainingExample, validateConceptDisjointSplits, summarizeTrainingDataset } from './training-program.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function readDataset(file) {
  return file.endsWith('.jsonl') ? loadJsonLines(file) : JSON.parse(fs.readFileSync(file, 'utf8'));
}

function canonicalIrShape(row) {
  const ir = row.target?.ir;
  if (!ir) return null;
  const roles = Object.fromEntries(Object.entries(ir.roles ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([role, value]) => [role, typeof value === 'object' ? { ...value, handle: undefined } : value]));
  return { outcome: row.target.outcome, world: ir.world, kind: ir.kind, predicate: ir.predicate, roles, negated: ir.negated, modality: ir.modality, time: ir.time, conditions: ir.conditions, consequences: ir.consequences };
}

function conceptFreeShape(row) {
  const ir = canonicalIrShape(row);
  if (!ir) return null;
  return { ...ir, roles: Object.fromEntries(Object.entries(ir.roles ?? {}).map(([role, value]) => [role, value && typeof value === 'object' ? { ...value, type: value.type } : value])) };
}

function auditDataset(rows, manifest = null) {
  const rowErrors = rows.flatMap((row) => validateTrainingExample(row).map((error) => `${row.id}: ${error}`));
  const splitErrors = validateConceptDisjointSplits(rows);
  const groups = new Map();
  for (const row of rows) {
    const group = row.source?.semanticGroup;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  const groupFindings = [...groups.entries()].map(([semanticGroup, members]) => {
    const languages = [...new Set(members.map((row) => row.source.language))].sort();
    const outcomes = [...new Set(members.map((row) => row.target.outcome))].sort();
    const shapes = [...new Set(members.map((row) => stable(canonicalIrShape(row))))];
    return { semanticGroup, rows: members.length, languages, outcomes, canonicalIrShapeCount: shapes.length, valid: languages.length === 6 && members.length === 6 && outcomes.length === 1 && shapes.length === 1 };
  });
  const pairIds = new Map();
  for (const row of rows) for (const pairId of row.target?.criticalNegativePairIds ?? []) {
    if (!pairIds.has(pairId)) pairIds.set(pairId, []);
    pairIds.get(pairId).push(row);
  }
  const pairFindings = [...pairIds.entries()].map(([pairId, members]) => {
    const groupsInPair = [...new Set(members.map((row) => row.source.semanticGroup))].sort();
    const shapes = [...new Set(members.map((row) => stable(conceptFreeShape(row))))];
    const concepts = [...new Set(members.flatMap((row) => row.source.conceptIds ?? []))].sort();
    return { pairId, groups: groupsInPair, rows: members.length, conceptIds: concepts, sharedNonConceptShapeCount: shapes.length, valid: groupsInPair.length === 2 && members.length === 12 && concepts.length === 2 && shapes.length === 1 };
  });
  const deterministicAccepted = rows.filter((row) => row.review?.status === 'accepted').length;
  const independentReviewers = rows.filter((row) => (row.review?.reviewers ?? []).some((reviewer) => reviewer !== 'deterministic-template-validator'));
  const report = {
    format: 'openlunum-training-audit/0.1',
    datasetPath: path.resolve(process.argv[2] ?? ''),
    datasetSha256: sha256(rows.map((row) => JSON.stringify(row)).join('\n')),
    datasetKind: 'development-harness-fixture',
    certification: { deterministicContractValid: rowErrors.length === 0 && splitErrors.length === 0, independentSemanticReview: independentReviewers.length === rows.length ? 'complete' : 'not-established', trainingGoldEligible: false },
    summary: summarizeTrainingDataset(rows),
    manifestProtected: manifest?.protected ?? false,
    rowValidation: { invalidRows: rowErrors, splitErrors },
    independentReview: { rowsWithNonGeneratorReviewer: independentReviewers.length, deterministicAcceptedRows: deterministicAccepted, pendingIndependentReviewRows: rows.length - independentReviewers.length, note: 'deterministic template validation is not independent semantic review' },
    multilingualGroups: { total: groupFindings.length, valid: groupFindings.filter((finding) => finding.valid).length, findings: groupFindings },
    criticalNegativePairs: { total: pairFindings.length, valid: pairFindings.filter((finding) => finding.valid).length, findings: pairFindings },
    sourceIntegrity: { generatorMarker: rows.every((row) => row.provenance?.sourceKind === 'synthetic' && row.provenance?.annotationMethod === 'deterministic-template-v1'), templateDerived: true },
    generatedAt: new Date().toISOString()
  };
  report.certification.trainingGoldEligible = false;
  return report;
}

function main() {
  const datasetFile = path.resolve(process.argv[2] ?? 'experiments/training-pilot-20260908-v2/dataset.jsonl');
  const outputFile = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const manifestFile = path.join(path.dirname(datasetFile), 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  const report = auditDataset(readDataset(datasetFile), manifest);
  if (outputFile) fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  if (!report.certification.deterministicContractValid || report.multilingualGroups.valid !== report.multilingualGroups.total || report.criticalNegativePairs.valid !== report.criticalNegativePairs.total) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();

export { auditDataset, canonicalIrShape };
