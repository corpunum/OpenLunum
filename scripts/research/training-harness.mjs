#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateConceptDisjointSplits, validateTrainingExample, summarizeTrainingDataset } from './training-program.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export function buildTrainingRunManifest({ codeSha, examples, splitManifest, model, seed = 42, config = {} }) {
  const errors = examples.flatMap((example) => validateTrainingExample(example).map((error) => `${example.id}: ${error}`));
  errors.push(...validateConceptDisjointSplits(examples));
  if (errors.length) throw new Error(`training dataset rejected: ${errors.join('; ')}`);
  if (!/^[0-9a-f]{40}$/.test(codeSha)) throw new Error('codeSha must be a full git SHA');
  if (!model || typeof model.class !== 'string' || typeof model.baseRevision !== 'string' || typeof model.tokenizerRevision !== 'string') throw new Error('model identity is incomplete');
  return { format: 'lunum-training-run/0.1', codeSha, datasetSha256: hash(examples.map((e) => JSON.stringify(e)).join('\n')), splitSha256: hash(JSON.stringify(splitManifest)), seed, model, config, localInferenceUsed: false, embeddingUsed: false, datasetSummary: summarizeTrainingDataset(examples) };
}

export function writeDryRunManifest(file, input) { fs.writeFileSync(file, `${JSON.stringify(buildTrainingRunManifest(input), null, 2)}\n`, { flag: 'wx' }); }

if (import.meta.url === `file://${process.argv[1]}`) console.error('Training is intentionally not started: use buildTrainingRunManifest from an authorized external training job.');
