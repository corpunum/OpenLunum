// Read-only, offline current-contract diagnostic. Never contacts a provider,
// rewrites historical data, or treats a mechanical pass as meaning review.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildExtractionSchema, validateEvaluationGold } from '../../packages/eval/dist/src/parse-experiment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const schemaPath = 'schemas/lunum-sem.schema.json';
const extractionSchema = buildExtractionSchema(json(schemaPath));
const instructionPath = 'experiments/natural-development-v8/extraction/public-instruction-package-v15.json';
const freeze = json(instructionPath).freeze;
const inputs = [
  {
    path: 'protected-eval/stage3-superqwen-semantic-contract-20260901/corpus.jsonl',
    sha256: 'bc392d724815419ed79b9db50103c7c62ebdc03c1b839fb5c9d672322dcaf3b8',
    limitation: 'Previously scored historical Stage 3 data; not fresh for this candidate.'
  },
  {
    path: 'experiments/protected-eval/stage3-superqwen-semantic-contract-v2-20260902/corpus.jsonl',
    sha256: '46e1fed448fadeed19672c484fb5fef1fc358a554a2f40f0cac0480a99238c47',
    limitation: 'Existing visible frozen data. Historical live result is NOT_RUN; no new live run here.'
  },
  {
    path: 'experiments/protected-eval/fresh-v1-20260905/corpus.jsonl',
    sha256: '0114a7761e725dccd18f26bc134ffd85d69eb1c5cec7d48e23f5b3855bb0a820',
    limitation: 'Previously scored parent-authored data bound to an older candidate, not a fresh independent current-candidate qualification.'
  },
  {
    path: 'experiments/protected-eval/fresh-v2-20260905/corpus.jsonl',
    sha256: '3df9e9111c4cbcb6be1360c30c992a55ff9b76333ed3278bb89ea76361c2cbbf',
    limitation: 'Preserved contaminated preflight attempt. Its CONTAMINATED.md expressly disallows repair/reuse for a capability claim.'
  }
];
const corpora = inputs.map(input => {
  const bytes = read(input.path);
  const actualHash = hash(bytes);
  if (actualHash !== input.sha256) throw new Error(`historical_corpus_changed:${input.path}`);
  const rows = bytes.toString('utf8').split(/\r?\n/u).filter(line => line.trim()).map(line => JSON.parse(line));
  const validation = validateEvaluationGold(rows, extractionSchema);
  const languageCounts = {};
  const groups = new Map();
  for (const row of rows) {
    languageCounts[row.sourceLanguage] = (languageCounts[row.sourceLanguage] ?? 0) + 1;
    if (row.semanticGroup) {
      const members = groups.get(row.semanticGroup) ?? [];
      members.push(row.id);
      groups.set(row.semanticGroup, members);
    }
  }
  return {
    ...input,
    currentMechanicalGate: validation.invalid.length ? 'FAIL' : 'PASS',
    freshProtectedEvidenceForCurrentCandidate: false,
    humanNativeReview: 'NOT ESTABLISHED',
    parseTargets: rows.filter(row => (row.expectedOutcome ?? 'parse') === 'parse').length,
    languageCounts,
    semanticGroups: [...groups].map(([id, members]) => ({ id, size: members.length })),
    goldValidation: validation
  };
});
console.log(JSON.stringify({
  format: 'openlunum-existing-corpus-preflight-audit/1',
  generatedAt: new Date().toISOString(),
  codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() === '',
  providerCalls: 0,
  evidenceClass: 'Offline current-contract diagnostics only; not semantic accuracy or protected model-quality evidence.',
  sourceMeaningAudit: 'NOT PERFORMED. Literal presence and frame conformance are necessary, not source-meaning adjudication.',
  schemaSha256: hash(read(schemaPath)),
  protocolVersion: freeze.protocolVersion,
  frameRegistryVersion: freeze.frameRegistryVersion,
  boundArtifacts: [
    'packages/eval/src/parse-experiment.ts', 'packages/eval/dist/src/parse-experiment.js',
    instructionPath, 'experiments/natural-development-v8/extraction/public-served-runtime-v15.json'
  ].map(file => ({ path: file, sha256: hash(read(file)) })),
  corpora
}, null, 2));
