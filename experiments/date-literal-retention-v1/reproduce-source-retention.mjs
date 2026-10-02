#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const experimentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBaselineDir = '.git/readiness-gate-mutations-Z6P6NC/deletion-plan-validation-disabled/src';
const manifestPath = path.join(root, 'experiments/natural-development-v8/extraction/public-served-runtime-v15.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedOldRetentionSha256 = '62ba1bf8be98fb8ce5e86397d7432cb9a4a8ceec139b6881cf0cb4f4e15f5a1c';
const expectedCounterexampleSha256 = '91584b77a427790aacd236dc7473709a44288ecbec33e9238525d9f750db2f03';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const stableJson = value => JSON.stringify(value);
const shaFile = file => sha256(fs.readFileSync(file));
const rel = file => path.relative(root, file).split(path.sep).join('/');

function parseOptions(argv) {
  const options = { baselineDir: defaultBaselineDir, output: 'experiments/date-literal-retention-v1/before-after-v2.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!['--baseline-dir', '--output'].includes(key) || !argv[i + 1]) throw new Error(`Usage: reproduce-source-retention.mjs [--baseline-dir relative-path] [--output new-relative-path]`);
    options[key === '--baseline-dir' ? 'baselineDir' : 'output'] = argv[++i];
  }
  for (const [name, value] of Object.entries(options)) {
    if (path.isAbsolute(value)) throw new Error(`${name} must be a workspace-relative path`);
    const resolved = path.resolve(root, value);
    if (path.relative(root, resolved).startsWith('..')) throw new Error(`${name} must stay inside the workspace`);
  }
  return options;
}
const options = parseOptions(process.argv.slice(2));
const oldRoot = path.resolve(root, options.baselineDir);

assert.equal(manifest.format, 'openlunum-served-runtime-manifest/1');
assert.deepEqual(manifest.roots, ['packages/core/dist/src', 'packages/mcp/dist/src', 'packages/mcp/dist/bin']);
assert.equal(shaFile(path.join(root, 'experiments/gold-metadata-preflight-v1/date-literal-counterexample.json')), expectedCounterexampleSha256, 'frozen counterexample artifact changed');
const manifestHashes = new Map(manifest.artifacts.map(item => [item.path, item.sha256]));
assert.equal(shaFile(path.join(oldRoot, 'literal-retention.js')), expectedOldRetentionSha256, 'historical retention module changed');

// Bind historical runtime use to only the imports reachable from the literal,
// submit, derive and fingerprint entry points. This deliberately makes no
// statement about the unrelated/mutated privacy lifecycle module.
const importPattern = /(?:^|\n)import\s+(?:[^'";]*?\s+from\s+)?['"](\.\/?[^'"]+)['"]/g;
const historicalModules = new Map();
function includeClosure(name) {
  const file = path.join(oldRoot, `${name}.js`);
  const artifactPath = `packages/core/dist/src/${name}.js`;
  if (historicalModules.has(artifactPath)) return;
  const digest = shaFile(file);
  assert.equal(manifestHashes.get(artifactPath), digest, `${artifactPath} is not bound by v15`);
  historicalModules.set(artifactPath, digest);
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const target = path.resolve(path.dirname(file), specifier);
    if (!target.startsWith(`${oldRoot}${path.sep}`)) continue;
    const base = target.replace(/\.js$/u, '');
    if (fs.existsSync(`${base}.js`)) includeClosure(path.basename(base));
  }
}
for (const entry of ['literal-retention', 'agent-native', 'derive', 'fingerprint']) includeClosure(entry);

// Current source imports use emitted .js specifiers. Resolve those to adjacent
// TypeScript sources for this isolated, no-build reproduction.
const currentSourceModules = new Set();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith(pathToFileURL(path.join(root, 'packages/core/src')).href)) {
      const parent = fileURLToPath(context.parentURL);
      const tsPath = path.resolve(path.dirname(parent), `${specifier.slice(0, -3)}.ts`);
      if (tsPath.startsWith(path.join(root, 'packages/core/src') + path.sep) && fs.existsSync(tsPath)) {
        currentSourceModules.add(rel(tsPath));
        return nextResolve(pathToFileURL(tsPath).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const currentRetention = await import(pathToFileURL(path.join(root, 'packages/core/src/literal-retention.ts')));
const currentAgent = await import(pathToFileURL(path.join(root, 'packages/core/src/agent-native.ts')));
const currentDerive = await import(pathToFileURL(path.join(root, 'packages/core/src/derive.ts')));
const currentFingerprint = await import(pathToFileURL(path.join(root, 'packages/core/src/fingerprint.ts')));
for (const name of ['literal-retention.ts', 'agent-native.ts', 'derive.ts']) currentSourceModules.add(`packages/core/src/${name}`);
const oldRetention = await import(pathToFileURL(path.join(oldRoot, 'literal-retention.js')));
const oldAgent = await import(pathToFileURL(path.join(oldRoot, 'agent-native.js')));
const oldDerive = await import(pathToFileURL(path.join(oldRoot, 'derive.js')));
const oldFingerprint = await import(pathToFileURL(path.join(oldRoot, 'fingerprint.js')));

const provenance = { extractorType: 'agent', extractorId: 'date-literal-retention-v1-reproduction' };
const sem = (kind, clauses, references) => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind, clauses, ...(references ? { references } : {}) });
const deadline = value => sem('event', [{ predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: { type: 'date', value } }, negated: false }]);
const baseAllow = sem('instruction', [{ predicate: 'allow', roles: {
  agent: { type: 'actor', id: 'volta' },
  theme: { type: 'concept', id: 'read_reports' },
  recipient: { type: 'actor', id: 'lina' },
}, negated: false }]);
const metadataOnly = structuredClone(baseAllow);
metadataOnly.clauses[0].roles.agent.token = '2026-04-05 AC-7';
metadataOnly.clauses[0].roles.agent.surface = 'Volta 2026-04-05 AC-7';
metadataOnly.clauses[0].roles.agent.metadata = { sourceText: '2026-04-05 AC-7' };
const surfaceReferenceOnly = {
  ...structuredClone(baseAllow),
  references: [{ referenceKind: 'surface-evidence', sourceRef: 'fixture-source', surface: 'Volta 2026-04-05 AC-7', span: { start: 0, end: 23 }, id: 'AC-7', ref: '2026-04-05', provider: 'fixture', metadata: { value: '2026-04-05 AC-7' } }],
};
const combinedLaundering = structuredClone(baseAllow);
combinedLaundering.clauses[0].roles.agent.token = '2026-04-05 AC-7';
combinedLaundering.clauses[0].roles.agent.surface = 'Volta 2026-04-05 AC-7';
combinedLaundering.clauses[0].roles.agent.metadata = { sourceText: '2026-04-05 AC-7' };
combinedLaundering.references = structuredClone(surfaceReferenceOnly.references);

const cases = [
  { id: 'dotted-deadline-equivalent-iso', source: 'Orion is due by 30.11.2026.', candidate: deadline('2026-11-30'), expect: { retained: true, sourceNumbers: [], sourceIdentifiers: [], sourceDates: ['2026-11-30'], missingNumbers: [], missingIdentifiers: [], missingDates: [] } },
  { id: 'actual-date-change-with-same-components', source: 'Orion is due on 2026-04-05.', candidate: deadline('2026-05-04'), expect: { retained: false, sourceNumbers: [], sourceIdentifiers: [], sourceDates: ['2026-04-05'], missingNumbers: [], missingIdentifiers: [], missingDates: ['2026-04-05'] } },
  { id: 'date-components-cannot-rescue-separate-quantity', source: 'Orion is due on 2026-04-13 and use 5 units.', candidate: deadline('2026-04-13'), expect: { retained: false, sourceNumbers: [5], sourceIdentifiers: [], sourceDates: ['2026-04-13'], missingNumbers: [5], missingIdentifiers: [], missingDates: [] } },
  { id: 'date-numeric-components-rescue-distinct-quantity-5-in-old-set-check', source: 'The date is 2026-04-05; use 5 units.', candidate: deadline('2026-04-05'), expect: { retained: false, sourceNumbers: [5], sourceIdentifiers: [], sourceDates: ['2026-04-05'], missingNumbers: [5], missingIdentifiers: [], missingDates: [] } },
  { id: 'base-volta-allow-manager-lina-read-reports', source: 'Volta allows manager Lina to read reports.', candidate: baseAllow, expect: { retained: true, sourceNumbers: [], sourceIdentifiers: [], sourceDates: [], missingNumbers: [], missingIdentifiers: [], missingDates: [] } },
  { id: 'metadata-only-laundering-same-base-sem', source: 'Volta allows manager Lina to read reports; date 2026-04-05; identifier AC-7.', candidate: metadataOnly, expect: { retained: false, sourceNumbers: [], sourceIdentifiers: ['ac-7'], sourceDates: ['2026-04-05'], missingNumbers: [], missingIdentifiers: ['ac-7'], missingDates: ['2026-04-05'] } },
  { id: 'surface-reference-only-laundering-same-base-sem', source: 'Volta allows manager Lina to read reports; date 2026-04-05; identifier AC-7.', candidate: surfaceReferenceOnly, expect: { retained: false, sourceNumbers: [], sourceIdentifiers: ['ac-7'], sourceDates: ['2026-04-05'], missingNumbers: [], missingIdentifiers: ['ac-7'], missingDates: ['2026-04-05'] } },
  { id: 'combined-metadata-and-surface-reference-laundering-same-base-sem', source: 'Volta allows manager Lina to read reports; date 2026-04-05; identifier AC-7.', candidate: combinedLaundering, expect: { retained: false, sourceNumbers: [], sourceIdentifiers: ['ac-7'], sourceDates: ['2026-04-05'], missingNumbers: [], missingIdentifiers: ['ac-7'], missingDates: ['2026-04-05'] } },
];

function retentionView(result) {
  return Object.fromEntries(['retained', 'sourceNumbers', 'sourceIdentifiers', 'sourceDates', 'missingNumbers', 'missingIdentifiers', 'missingDates'].map(key => [key, result[key] ?? null]));
}
function run(runtime, item) {
  const retention = runtime.retention.checkLiteralRetention(item.source, item.candidate);
  const submitted = runtime.agent.submitCandidate({ sourceText: item.source, candidateSem: item.candidate, provenance });
  const projectionFingerprint = runtime.fingerprint.semanticFingerprint(item.candidate);
  const made = runtime.derive.createRecord({ sourceText: item.source, sem: item.candidate });
  const record = { semanticFingerprintAvailable: Boolean(made.semanticFingerprint), semanticFingerprint: made.semanticFingerprint ?? null, legacyFingerprint: made.fingerprint ?? null, retained: made.meta.sourceLiteralRetention?.retained ?? null, confidence: made.meta.semanticTrust?.confidence ?? null, promoted: made.meta.semanticPromoted ?? null };
  return {
    checkLiteralRetention: retentionView(retention),
    projectionFingerprint,
    submitCandidate: { transportValid: submitted.transportValid, structuralValid: submitted.structuralValid, protocolCanonical: submitted.protocolCanonical, frameValid: submitted.frameValid, grounded: submitted.grounded, candidateIdentityAvailable: submitted.candidateIdentityAvailable, semanticFingerprint: submitted.semanticFingerprint ?? null, failureClass: submitted.failureClass ?? null, semanticFingerprintAvailable: Boolean(submitted.semanticFingerprint), confidence: submitted.trust?.confidence ?? null, promoted: submitted.trust?.promoted ?? null, literalRetention: submitted.literalRetention ? retentionView(submitted.literalRetention) : null },
    createRecord: record,
  };
}

const runtimes = {
  historical: { retention: oldRetention, agent: oldAgent, derive: oldDerive, fingerprint: oldFingerprint },
  current: { retention: currentRetention, agent: currentAgent, derive: currentDerive, fingerprint: currentFingerprint },
};
const results = {};
for (const [generation, runtime] of Object.entries(runtimes)) {
  results[generation] = {};
  for (const item of cases) {
    const observed = run(runtime, item);
    const returned = observed.checkLiteralRetention;
    // Historical API has no date arrays; preserve the observed shape and apply
    // the behavioral expectation only where that API exposes a field.
    if (generation === 'current') assert.deepEqual(returned, item.expect, `${generation}/${item.id} retention expectation`);
    if (generation === 'historical') {
      const expectedHistoricalRetention = [
        'actual-date-change-with-same-components',
        'date-numeric-components-rescue-distinct-quantity-5-in-old-set-check',
        'base-volta-allow-manager-lina-read-reports',
        'metadata-only-laundering-same-base-sem',
        'surface-reference-only-laundering-same-base-sem',
        'combined-metadata-and-surface-reference-laundering-same-base-sem',
      ].includes(item.id);
      assert.equal(returned.retained, expectedHistoricalRetention, `${generation}/${item.id} historical retention expectation`);
    }
    results[generation][item.id] = observed;
  }
}

// Candidate submission and record creation consume the same gate as the direct
// check. The old gate permits evidence/date-component laundering; the current
// gate withholds identity for each harmful omission.
assert.equal(results.historical['dotted-deadline-equivalent-iso'].submitCandidate.candidateIdentityAvailable, false);
assert.equal(results.current['dotted-deadline-equivalent-iso'].submitCandidate.candidateIdentityAvailable, true);
for (const generation of ['historical', 'current']) {
  for (const [id, observed] of Object.entries(results[generation])) {
    assert.equal(observed.submitCandidate.transportValid, true, `${generation}/${id} must be transport-valid`);
    assert.equal(observed.submitCandidate.frameValid, true, `${generation}/${id} must be frame-valid`);
    assert.equal(observed.createRecord.retained !== null, true, `${generation}/${id} createRecord must complete without error`);
  }
}
for (const id of ['actual-date-change-with-same-components', 'date-components-cannot-rescue-separate-quantity', 'date-numeric-components-rescue-distinct-quantity-5-in-old-set-check', 'metadata-only-laundering-same-base-sem', 'surface-reference-only-laundering-same-base-sem', 'combined-metadata-and-surface-reference-laundering-same-base-sem']) {
  assert.equal(results.current[id].submitCandidate.candidateIdentityAvailable, false, `${id} must withhold current identity`);
  assert.equal(results.current[id].createRecord.semanticFingerprintAvailable, false, `${id} must withhold current record identity`);
  assert.equal(results.current[id].submitCandidate.confidence, 0, `${id} confidence`);
  assert.equal(results.current[id].submitCandidate.promoted, false, `${id} promotion`);
}
for (const id of ['metadata-only-laundering-same-base-sem', 'surface-reference-only-laundering-same-base-sem', 'combined-metadata-and-surface-reference-laundering-same-base-sem']) {
  assert.equal(results.historical[id].submitCandidate.candidateIdentityAvailable, true, `${id} historical identity available`);
  assert.equal(results.historical[id].createRecord.semanticFingerprintAvailable, true, `${id} historical record identity available`);
  for (const generation of ['historical', 'current']) {
    assert.equal(results[generation][id].submitCandidate.confidence, 0, `${generation}/${id} confidence`);
    assert.equal(results[generation][id].submitCandidate.promoted, false, `${generation}/${id} promotion`);
  }
}
const baseFingerprint = results.current['base-volta-allow-manager-lina-read-reports'].submitCandidate.semanticFingerprint;
assert.ok(baseFingerprint, 'base fixture must produce identity');
for (const id of ['metadata-only-laundering-same-base-sem', 'surface-reference-only-laundering-same-base-sem', 'combined-metadata-and-surface-reference-laundering-same-base-sem']) {
  assert.equal(results.current[id].projectionFingerprint, baseFingerprint, `${id} semantic projection must retain the base fingerprint`);
  assert.equal(results.historical[id].projectionFingerprint, baseFingerprint, `${id} historical semantic projection must retain the base fingerprint`);
}
const boundFiles = [
  'packages/core/src/literal-retention.ts', 'packages/core/src/fingerprint.ts',
  'packages/core/src/agent-native.ts', 'packages/core/src/derive.ts',
  'packages/core/src/types.ts', 'packages/core/test/date-literal-retention.test.ts',
  'experiments/date-literal-retention-v1/experiment.json',
  'experiments/natural-development-v8/extraction/public-served-runtime-v15.json',
  'experiments/natural-development-v8/extraction/public-served-runtime-v16.json',
];
const sourceHashes = Object.fromEntries(boundFiles.map(name => [name, shaFile(path.join(root, name))]));
const currentModules = Object.fromEntries([...currentSourceModules].sort().map(name => [name, shaFile(path.join(root, name))]));
const output = {
  format: 'openlunum-date-literal-retention-reproduction/2',
  experiment: 'date-literal-retention-v1',
  generatedAt: new Date().toISOString(),
  outcome: 'PASS',
  scope: 'Deterministic local source-path reproduction; no model/provider/service/external repository calls; no shared dist build.',
  binding: {
    baselineSourceCommit: 'eace760811c880452d08501cf19d2feaa20c3171 (registered experiment baseline)',
    currentSourceCommit: 'PARENT_REPORT_PENDING: current source state is bound by per-file hashes below.',
    dirtyTreeBinding: 'Per-file SHA-256 binds all relevant modified/untracked source, test, experiment registration, served-runtime manifest, and directly loaded current source modules below; no whole-tree commit claim.',
    v15Manifest: { path: rel(manifestPath), format: manifest.format, sha256: shaFile(manifestPath), historicalModuleCount: historicalModules.size, historicalModules: Object.fromEntries([...historicalModules].sort(([a], [b]) => a.localeCompare(b))) },
    historicalBaselineDirectory: options.baselineDir,
    generator: { path: 'experiments/date-literal-retention-v1/reproduce-source-retention.mjs', sha256: shaFile(fileURLToPath(import.meta.url)) },
    historicalLiteralRetention: { path: `${options.baselineDir}/literal-retention.js`, sha256: expectedOldRetentionSha256 },
    frozenCounterexample: { path: 'experiments/gold-metadata-preflight-v1/date-literal-counterexample.json', sha256: expectedCounterexampleSha256, changed: false },
    currentModules,
    sourceHashes,
    currentDistStatus: 'Not used; repository notes identify core dist as built from 0.14 and runtime freeze v16 is present in the dirty tree.',
  },
  cases: cases.map(({ id, source, candidate }) => ({ id, source, candidateSem: candidate, sourceSha256: sha256(source), semSha256: sha256(stableJson(candidate)), sourceAndSemBinding: 'SHA-256 of exact UTF-8 source and JSON.stringify(candidate Sem) used in both generations', historical: results.historical[id], current: results.current[id] })),
  limits: [
    'This is a presence floor: it does not verify that a retained literal fills the semantically correct role.',
    'Occurrences are compared as sets: multiplicity of repeated literals is not checked.',
    'No semantic correctness, language coverage, parser quality, promotion, readiness, deployment, privacy lifecycle, or protected-evaluation claim follows.',
    'Historical binding covers only the manifest-hash-verified import closure used by these literal/submission/record/fingerprint paths; it is not whole-runtime attestation.',
  ],
};
const outputPath = path.resolve(root, options.output);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ outcome: output.outcome, historicalModuleCount: historicalModules.size, output: options.output, cases: cases.map(item => item.id) }, null, 2));
