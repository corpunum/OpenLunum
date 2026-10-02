// Offline diagnostics of already-visible historical data; never a protected run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildExtractionSchema, validateEvaluationGold } from '../../packages/eval/dist/src/parse-experiment.js';
import { artifactBinding } from '../../scripts/research/source-only-run-gates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const priorPath = 'experiments/gold-metadata-preflight-v1/existing-corpus-audit.json';
const prior = JSON.parse(read(priorPath));
const packagePath = path.join(root, 'experiments/natural-development-v8/extraction/public-instruction-package-v16.json');
const pkg = JSON.parse(fs.readFileSync(packagePath));
const binding = artifactBinding(root, packagePath, path.resolve(path.dirname(packagePath), pkg.freeze.taskProfilePath), pkg);
if (!binding.match) throw Error('current_runtime_not_bound');
const schemaPath = 'schemas/lunum-sem.schema.json';
const extractionSchema = buildExtractionSchema(JSON.parse(read(schemaPath)));
const corpora = prior.corpora.map(input => {
  const bytes = read(input.path);
  if (hash(bytes) !== input.sha256) throw Error(`historical_corpus_changed:${input.path}`);
  const rows = bytes.toString('utf8').split(/\r?\n/u).filter(line => line.trim()).map(JSON.parse);
  const goldValidation = validateEvaluationGold(rows, extractionSchema);
  return {
    path: input.path, sha256: input.sha256,
    total: rows.length, parseTargets: input.parseTargets,
    priorInvalidCount: input.goldValidation.invalid.length,
    currentInvalidCount: goldValidation.invalid.length,
    currentMechanicalGate: goldValidation.invalid.length ? 'FAIL' : 'PASS',
    freshProtectedEvidenceForCurrentCandidate: false,
    humanNativeSourceMeaningReview: 'NOT ESTABLISHED',
    goldValidation,
  };
});
console.log(JSON.stringify({
  format: 'openlunum-unchanged-corpus-date-preflight/1',
  generatedAt: new Date().toISOString(),
  codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() === '',
  providerCalls: 0,
  evidenceClass: 'Already-visible offline diagnostics; not native review, semantic accuracy or new protected evidence.',
  priorAuditSha256: hash(read(priorPath)),
  schemaSha256: hash(read(schemaPath)),
  contractVersion: pkg.freeze.coreContractVersion,
  boundArtifacts: [
    'packages/eval/src/parse-experiment.ts', 'packages/eval/dist/src/parse-experiment.js',
    'experiments/natural-development-v8/extraction/public-instruction-package-v16.json',
    'experiments/natural-development-v8/extraction/public-served-runtime-v16.json',
    'experiments/date-literal-retention-v1/audit-unchanged-corpora.mjs',
  ].map(file => ({ path: file, sha256: hash(read(file)) })),
  corpora,
}, null, 2));
