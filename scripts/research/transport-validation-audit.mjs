#!/usr/bin/env node
// Offline compatibility scan: compare only the submission boundary, never model quality.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { submitCandidate, getExtractionContract } from '../../packages/core/dist/src/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = '7470a2322a686ee4d3d6558b77d31b20f7ea8b6c';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const oldSource = execFileSync('git', ['show', `${baseline}:packages/core/src/agent-native.ts`], { cwd: root, encoding: 'utf8' });
const compiled = stripTypeScriptTypes(oldSource);
const moduleUrl = new URL('../../packages/core/dist/src/agent-native.js', import.meta.url);
const oldModule = compiled.replace(/from '(\.\/[^']+)'/gu, (_, specifier) => `from ${JSON.stringify(new URL(specifier, moduleUrl).href)}`);
const old = await import('data:text/javascript;base64,' + Buffer.from(oldModule).toString('base64'));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0')
  .filter(file => /(?:^|\/)candidate-ledger\.jsonl$/u.test(file));
let parses = 0, oldIdentity = 0, retainedIdentity = 0, transportRejected = 0;
let frozenScorerMatches = 0, frozenScorerMatchesRejected = 0;
const changed = [], lost = [], newlyAvailable = [], artifacts = [];
for (const file of files) {
  const bytes = fs.readFileSync(path.join(root, file));
  artifacts.push({ path: file, sha256: hash(bytes) });
  const rows = bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse);
  const resultPath = path.join(root, path.dirname(file), 'results.json');
  const results = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null;
  const matched = new Set((results?.items ?? []).filter(item => item.sourceRelative?.status === 'match').map(item => item.handle));
  for (const [index, row] of rows.entries()) {
    if (row.status !== 'parse' || !row.candidateSem) continue;
    parses++;
    // Empty source isolates the wire-boundary change, not literal-retention behavior.
    const input = { sourceText: '', candidateSem: row.candidateSem, provenance: { extractorType: 'other' } };
    const before = old.submitCandidate(input), after = submitCandidate(input);
    const id = { file, row: index + 1, handle: row.handle ?? null };
    if (!after.transportValid) transportRejected++;
    if (matched.has(row.handle)) {
      frozenScorerMatches++;
      if (!after.transportValid) frozenScorerMatchesRejected++;
    }
    if (before.candidateIdentityAvailable) {
      oldIdentity++;
      if (!after.candidateIdentityAvailable) lost.push({ ...id, failureClass: after.failureClass, diagnostics: after.diagnostics });
      else {
        retainedIdentity++;
        if (before.semanticFingerprint !== after.semanticFingerprint) changed.push({ ...id, before: before.semanticFingerprint, after: after.semanticFingerprint });
      }
    } else if (after.candidateIdentityAvailable) newlyAvailable.push(id);
  }
}
const report = {
  format: 'openlunum-transport-validation-audit/0.1', mode: 'offline-deterministic-no-model-calls',
  nodeVersion: process.version, validator: 'Ajv2020 8.20.0; no coercion/defaults/field removal',
  baselineCommit: baseline, baselineAgentSourceSha256: hash(oldSource),
  candidateContract: getExtractionContract().contractVersion,
  implementationBinding: 'Commit that added this report; artifact hashes bind the tested build.',
  candidateAgentArtifactSha256: hash(fs.readFileSync(moduleUrl)),
  candidateValidatorArtifactSha256: hash(fs.readFileSync(new URL('../../packages/core/dist/src/semantic-transport.js', import.meta.url))),
  candidateSchemaArtifactSha256: hash(fs.readFileSync(new URL('../../packages/core/dist/src/semantic-transport-schema.js', import.meta.url))),
  method: 'Baseline agent-native.ts transpiled in memory against unchanged current protocol/frame/fingerprint helpers. sourceText is empty to isolate wire enforcement. No source-fidelity or model-quality claims.',
  summary: { ledgers: files.length, parses, oldIdentity, retainedIdentity, identityChanged: changed.length, identityLost: lost.length, newlyAvailable: newlyAvailable.length, transportRejected, frozenScorerMatches, frozenScorerMatchesRejected },
  artifacts, lost, changed, newlyAvailable,
};
if (changed.length || newlyAvailable.length) throw new Error('unexpected_identity_change_or_gain');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
