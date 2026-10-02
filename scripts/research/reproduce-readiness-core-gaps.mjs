#!/usr/bin/env node
// Deterministic path reproduction, NOT model or deployed-storage evidence.
// Historical source implementations are copied into a fresh diagnostic
// directory. Imports resolve to the current built core; this is not a claim
// that the complete historical repository was built or evaluated.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = '14c0ebc1e3db4cc99280778c14c12230790f95a3';
const out = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !out.startsWith(`${root}${path.sep}`)) throw Error('explicit_new_output_inside_OpenLunum_required');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
fs.mkdirSync(out);
const bindings = [];
const historical = async relative => {
  const read = spawnSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8' });
  if (read.status !== 0) throw Error(`cannot_load_baseline:${relative}`);
  const executableSource = read.stdout.replace(/from '([^']+)'/gu, (match, specifier) => {
    if (specifier === '@corpunum/lunum') return `from '${pathToFileURL(path.join(root, 'packages/core/dist/src/index.js')).href}'`;
    if (!specifier.startsWith('./')) return match;
    return `from '${pathToFileURL(path.join(root, path.dirname(relative).replace('/src', '/dist/src'), specifier)).href}'`;
  });
  const generated = path.join(out, `${path.basename(relative, '.ts')}-baseline.ts`);
  fs.writeFileSync(generated, executableSource, { flag: 'wx' });
  bindings.push({ path: relative, sourceCommit: baseline, sourceSha256: hash(read.stdout), generatedSha256: hash(executableSource) });
  return import(pathToFileURL(generated));
};
const derive = await historical('packages/core/src/derive.ts');
const privacy = await historical('packages/core/src/privacy-derived-lifecycle.ts');
const retrieval = await historical('packages/eval/src/raw-text-retrieval.ts');
const risk = await historical('packages/core/src/fallback-policy.ts');
const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'retry', roles: { agent: { type: 'actor', id: 'Priya' }, theme: { type: 'object', id: 'R-42' }, count: { type: 'quantity', value: 50 } } }] };
const record = derive.createRecord({ sourceText: 'Priya retries R-42 5 times.', sem });
const source = { sourceId: 'diagnostic-source-1', sourceContentHash: hash('unit fixture, no private content'), sensitivity: 'sensitive', retentionExpiresAt: '2026-10-09T00:00:00.000Z', deletionMethod: 'secure-delete' };
const provenance = { extractorModelId: 'deterministic-fixture', extractorModelIdentity: 'unit-fixture-not-a-model', endpointProfile: 'offline', promptVersion: 'fixture/1', promptHash: hash('fixture'), schemaVersion: 'lunum-sem/0.1-draft', codeCommit: baseline, extractedAt: '2026-10-02T00:00:00.000Z', validationStatus: 'canonical-valid', promotionStatus: 'candidate' };
const lifecycle = privacy.createDerivedDataLifecycle({ source, provenance, now: '2026-10-02T00:00:00.000Z' });
const registry = new privacy.DerivedDataLifecycleRegistry();
registry.register({ artifactId: 'diagnostic-sem', kind: 'semantic-record', lifecycle });
registry.register({ artifactId: 'diagnostic-cache', kind: 'retrieval-cache', lifecycle });
const issued = registry.buildDeletionPlan(source);
const deleted = [];
const deletion = await registry.executeDeletion({ ...issued, targets: issued.targets.slice(0, 1) }, target => { deleted.push(target.targetId); return true; });
const send = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'send', roles: { agent: { type: 'actor', id: 'Priya' }, object: { type: 'object', id: 'R-42' }, recipient: { type: 'actor', id: 'Leo' } } }] };
const report = await retrieval.runRawTextRetrievalEvaluation({
  memories: [{ id: 'm1', language: 'en', text: 'missing' }, { id: 'm2', language: 'en', text: 'available' }],
  queries: [{ id: 'q1', language: 'en', text: 'query', expectedMemoryIds: ['m1'] }, { id: 'q2', language: 'en', text: 'failed-query', expectedMemoryIds: ['m1'] }],
  extract: async ({ text }) => text === 'missing' || text === 'failed-query' ? null : text === 'query'
    ? { ...send, clauses: [{ ...send.clauses[0], roles: { ...send.clauses[0].roles, recipient: { type: 'actor', id: 'Bob' } } }] }
    : send,
  mode: 'exact', topK: 1,
});
const baselineError = await retrieval.runRawTextRetrievalEvaluation({
  memories: [{ id: 'm1', language: 'en', text: 'available' }],
  queries: [{ id: 'q-negative', language: 'en', text: 'negative', expectedMemoryIds: [] }],
  extract: async () => send,
  baselines: { failing: async () => { throw Error('deterministic-baseline-error'); } }, mode: 'exact',
});
const nestedRisk = risk.isHighRisk({ ...send, clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'Priya' }, theme: { type: 'concept', id: 'daylight' } }, consequences: [{ predicate: 'delete', roles: { theme: { type: 'object', id: 'R-42' } } }] }] });
const canonicalRisk = risk.isHighRisk({ ...send, clauses: [{ ...send.clauses[0], modality: 'obligation' }] });
const results = {
  format: 'openlunum-readiness-path-reproduction/0.1', baselineCommit: baseline,
  observedAt: new Date().toISOString(), providerCalls: 0,
  method: 'Historical source via Node type stripping with current built imported dependencies; deterministic unit fixtures only.',
  bindings,
  defects: {
    sourceLiteralBypass: { source: 'Priya retries R-42 5 times.', candidateCount: 50, exactIdentityIssued: Boolean(record.semanticFingerprint), promoted: record.meta.semanticPromoted },
    shortenedDeletionPlan: { registeredTargets: issued.targets.length, requestedTargets: 1, deleted, reportedComplete: deletion.complete, derivativesStillRegistered: registry.list(source.sourceId).length },
    retrievalFailureAccounting: { globalTrueNegatives: report.metrics.trueNegatives, byLanguagePair: report.metrics.byLanguagePair, semanticMatchingFailures: report.metrics.semanticMatchingFailures, queryExtractionFailures: report.metrics.queryExtractionFailures },
    baselineErrorRejection: baselineError.baselines.failing,
    nestedRisk, canonicalRisk,
  },
  nonClaims: ['Not live extraction quality.', 'Not a complete baseline build.', 'Not deployed deletion evidence.'],
};
fs.writeFileSync(path.join(out, 'reproduction.json'), `${JSON.stringify(results, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(results, null, 2));
