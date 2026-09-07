#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadJsonLines } from './training-program.mjs';
import { buildTrainingRunManifest, writeTrainingCheckpoint, resumeTrainingCheckpoint } from './training-harness.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function buildDryRunBatches(examples, batchSize = 8) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer');
  return Array.from({ length: Math.ceil(examples.length / batchSize) }, (_, index) => examples.slice(index * batchSize, (index + 1) * batchSize).map((example) => ({
    id: example.id,
    split: example.split,
    input: example.source.text,
    language: example.source.language,
    targetOutcome: example.target.outcome,
    targetIr: example.target.outcome === 'parse' ? example.target.ir : null,
    abstentionReason: example.target.abstentionReason ?? null,
    criticalNegativePairIds: example.target.criticalNegativePairIds ?? [],
    // This is a deterministic preprocessing estimate, not a model metric.
    estimatedInputTokens: example.source.text.length,
    estimatedTargetTokens: JSON.stringify(example.target.outcome === 'parse' ? example.target.ir : { outcome: 'abstain', reason: example.target.abstentionReason }).length
  })));
}

export function buildDryRunEvidence({ examples, batches, manifest }) {
  const allRecords = batches.flat();
  return {
    format: 'lunum-training-dry-run/0.1',
    status: 'preprocessing-only',
    capabilityClaim: false,
    localInferenceUsed: false,
    embeddingUsed: false,
    manifest,
    batchCount: batches.length,
    recordCount: allRecords.length,
    batchSha256: sha256(JSON.stringify(batches)),
    recordsSha256: sha256(JSON.stringify(allRecords)),
    targetOutcomes: Object.fromEntries([...new Set(examples.map((example) => example.target.outcome))].sort().map((outcome) => [outcome, examples.filter((example) => example.target.outcome === outcome).length])),
    note: 'Dry-run validates data plumbing and objective inputs only; it is not model training or capability evidence.'
  };
}

export function runDryRun({ datasetFile, outputDir, codeSha, batchSize = 8 }) {
  const examples = loadJsonLines(datasetFile);
  const splitManifest = Object.fromEntries([...new Set(examples.map((example) => example.split))].sort().map((split) => [split, [...new Set(examples.filter((example) => example.split === split).map((example) => example.source.semanticGroup))].sort()]));
  const manifest = buildTrainingRunManifest({ codeSha, examples, splitManifest, model: { class: 'multilingual-semantic-ir-pilot', baseRevision: 'external:authorization-required', tokenizerRevision: 'external:authorization-required' }, config: { batchSize, objective: 'semantic-ir-supervision', phase: 'dry-run' } });
  const batches = buildDryRunBatches(examples, batchSize);
  const evidence = buildDryRunEvidence({ examples, batches, manifest });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, 'batches.json'), `${JSON.stringify(batches, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  const checkpointFile = path.join(outputDir, 'checkpoint.json');
  writeTrainingCheckpoint(checkpointFile, manifest, { step: batches.length, metrics: { preprocessingRecords: examples.length }, artifact: { evidenceSha256: sha256(JSON.stringify(evidence)) } });
  resumeTrainingCheckpoint(checkpointFile, manifest);
  return evidence;
}

function main() {
  const datasetFile = path.resolve(process.argv[2] ?? 'experiments/training-pilot-20260908-v2/dataset.jsonl');
  const outputDir = path.resolve(process.argv[3] ?? 'reports/experiments/training-dry-run-20260908');
  const codeSha = process.argv[4] ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify(runDryRun({ datasetFile, outputDir, codeSha }), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
