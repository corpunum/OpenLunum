#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildExtractionSchema, validateEvaluationGold } from '../../../packages/eval/dist/src/parse-experiment.js';

const root = path.resolve(import.meta.dirname, '../../..');
const directory = path.join(root, 'experiments/protected-eval/stage3-superqwen-semantic-contract-v2-20260902');
const corpusPath = path.join(directory, 'corpus.jsonl');
const schemaPath = path.join(root, 'schemas/lunum-sem.schema.json');
const rows = (await readFile(corpusPath, 'utf8')).split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid corpus JSONL at line ${index + 1}: ${error}`); }
});
const semSchema = JSON.parse(await readFile(schemaPath, 'utf8'));
const extractionSchema = buildExtractionSchema(semSchema);
const report = validateEvaluationGold(rows, extractionSchema);
const corpusSha256 = createHash('sha256').update(await readFile(corpusPath)).digest('hex');
const result = {
  schema: 'openlunum-stage3-gold-preflight/0.1',
  status: report.invalid.length === 0 ? 'PASS' : 'FAIL',
  validator: 'packages/eval/src/parse-experiment.ts#validateEvaluationGold',
  transportSchema: extractionSchema.$id,
  transportSchemaSha256: createHash('sha256').update(JSON.stringify(extractionSchema)).digest('hex'),
  corpusPath: 'experiments/protected-eval/stage3-superqwen-semantic-contract-v2-20260902/corpus.jsonl',
  corpusSha256,
  counts: {
    total: report.total,
    transportValid: report.transportValid,
    structuralValid: report.structuralValid,
    protocolCanonical: report.protocolCanonical,
    identityValid: report.identityValid,
    abstentionCases: report.abstentionCases,
    invalid: report.invalid.length
  },
  invalid: report.invalid,
  failBeforeModelCalls: true,
  generatedAt: new Date().toISOString()
};
await writeFile(path.join(directory, 'preflight.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (report.invalid.length > 0) process.exitCode = 1;
