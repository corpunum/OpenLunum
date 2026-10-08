import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { compareMeaningSem, scoreRecordedMeaning, scoreRecordedMeaningFiles, validateMeaningTargets } from './score-recorded-meaning.mjs';
import { observedExtractionContracts } from './replay-client-events.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const sha = text => createHash('sha256').update(text).digest('hex');
const actor = id => ({ type: 'actor', id });
const document = id => ({ type: 'document', id });
const sem = clauses => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses });
const base = sem([{ predicate: 'send', roles: { agent: actor('alice'), recipient: actor('bob'), object: document('report') },
  time: { type: 'date', value: '2027-03-15' }, modality: 'intention',
  conditions: [{ predicate: 'above', roles: { subject: { type: 'metric', id: 'temperature' }, value: { type: 'quantity', value: 5, unit: 'degrees' } } }],
  consequences: [{ predicate: 'notify', roles: { recipient: actor('bob'), theme: document('receipt') } }],
}]);

test('faithful representation is a full atom match, independent of issued identity flags', () => {
  const comparison = compareMeaningSem(base, structuredClone(base));
  assert.equal(comparison.status, 'match');
  assert.equal(comparison.features.recall, 1);
  assert.equal(comparison.features.precision, 1);
});

const mutations = {
  predicate: x => { x.clauses[0].predicate = 'receive'; },
  negation: x => { x.clauses[0].negated = true; },
  modality: x => { x.clauses[0].modality = 'permission'; },
  agent: x => { x.clauses[0].roles.agent.id = 'charlie'; },
  recipient: x => { x.clauses[0].roles.recipient.id = 'charlie'; },
  object: x => { x.clauses[0].roles.object.id = 'other_report'; },
  roleSwap: x => { [x.clauses[0].roles.agent, x.clauses[0].roles.recipient] = [x.clauses[0].roles.recipient, x.clauses[0].roles.agent]; },
  quantity: x => { x.clauses[0].conditions[0].roles.value.value = 50; },
  unit: x => { x.clauses[0].conditions[0].roles.value.unit = 'kelvin'; },
  date: x => { x.clauses[0].time.value = '2027-03-16'; },
  temporalRelation: x => { x.clauses[0].conditions[0].predicate = 'below'; },
  condition: x => { delete x.clauses[0].conditions; },
  consequence: x => { delete x.clauses[0].consequences; },
  modalityOmission: x => { delete x.clauses[0].modality; },
  timeOmission: x => { delete x.clauses[0].time; },
  extraCondition: x => { x.clauses[0].conditions.push(structuredClone(x.clauses[0].conditions[0])); },
  extraConsequence: x => { x.clauses[0].consequences.push(structuredClone(x.clauses[0].consequences[0])); },
  extraRole: x => { x.clauses[0].roles.destination = { type: 'location', id: 'production' }; },
  literalInWrongRole: x => { x.clauses[0].conditions[0].roles.value.value = 50; x.clauses[0].roles.object.value = 5; },
  conditionAsConsequence: x => { x.clauses[0].consequences.push(x.clauses[0].conditions.pop()); },
  informationInAnnotations: x => { x.annotations = { omittedDate: x.clauses[0].time }; delete x.clauses[0].time; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`meaning mutation is caught: ${name}`, () => {
    const changed = structuredClone(base); mutate(changed);
    const result = compareMeaningSem(base, changed);
    assert.notEqual(result.status, 'match');
    assert.ok(result.features.recall < 1 || result.features.precision < 1);
    assert.ok(result.features.missing.length || result.features.extra.length);
  });
}

test('source/destination swaps, environment changes and clause order are distinguished', () => {
  const gold = sem([{ predicate: 'copy', roles: { agent: actor('alice'), source: { type: 'resource', id: 'production' }, destination: { type: 'resource', id: 'staging' } } },
    { predicate: 'notify', roles: { recipient: actor('bob') } }]);
  const swapped = structuredClone(gold);
  [swapped.clauses[0].roles.source, swapped.clauses[0].roles.destination] = [swapped.clauses[0].roles.destination, swapped.clauses[0].roles.source];
  assert.equal(compareMeaningSem(gold, swapped).status, 'mismatch');
  const changed = structuredClone(gold); changed.clauses[0].roles.source.id = 'public';
  assert.equal(compareMeaningSem(gold, changed).status, 'mismatch');
  changed.clauses.reverse();
  assert.equal(compareMeaningSem(gold, changed).status, 'mismatch');
});

test('ordered lists preserve multiplicity; nested conditions recurse', () => {
  const gold = sem([{ predicate: 'keep', roles: { theme: [document('one'), document('two'), document('two')] },
    conditions: [{ predicate: 'confirmed', roles: { theme: document('decision') }, conditions: [{ predicate: 'above', roles: { subject: { type: 'metric', id: 'count' }, value: { type: 'quantity', value: 5 } } }] }] }]);
  const x = structuredClone(gold); x.clauses[0].roles.theme.pop();
  assert.equal(compareMeaningSem(gold, x).status, 'mismatch');
  const y = structuredClone(gold); y.clauses[0].conditions[0].conditions[0].roles.value.value = 50;
  assert.equal(compareMeaningSem(gold, y).status, 'mismatch');
});

test('metadata and surface pronouns cannot affect comparison, but referents do', () => {
  const gold = structuredClone(base); gold.references = [{ referenceKind: 'semantic', ref: 'alice', token: 'she' }];
  const x = structuredClone(gold); x.references[0].token = 'εκείνη'; x.provenance = { model: 'other' }; x.annotations = { reviewer: 'other' };
  x.clauses[0].annotations = { source: 'translated' };
  assert.equal(compareMeaningSem(gold, x).status, 'match');
  x.references[0].ref = 'bob';
  assert.equal(compareMeaningSem(gold, x).status, 'mismatch');
});

test('object key order and canonical Unicode/id spelling normalize; open entity translations do not', () => {
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])])) : value;
  assert.equal(compareMeaningSem(base, reverseKeys(base)).status, 'match');
  const y = structuredClone(base); y.clauses[0].roles.agent.id = ' ALICE ';
  assert.equal(compareMeaningSem(base, y).status, 'match');
  y.clauses[0].roles.object.id = 'αναφορά';
  assert.equal(compareMeaningSem(base, y).status, 'mismatch');
  const unicodeGold = structuredClone(base); unicodeGold.clauses[0].roles.object.id = 'café';
  const unicodeCandidate = structuredClone(unicodeGold); unicodeCandidate.clauses[0].roles.object.id = 'cafe\u0301';
  assert.equal(compareMeaningSem(unicodeGold, unicodeCandidate).status, 'match');
});

test('gold preflight rejects schema aliases, unknown symbols, conflicting frames and ungrounded references', () => {
  const cases = [
    x => { x.clauses[0].predicate = 'mail'; },
    x => { x.clauses[0].predicate = 'inform'; },
    x => { x.clauses[0].roles.extra = 'unsupported'; },
    x => { x.clauses[0].modality = 'invented'; },
    x => { x.references = [{ referenceKind: 'semantic', surface: 'she' }]; },
    x => { x.clauses[0].conditions[0].world = 'real'; },
  ];
  for (const mutate of cases) {
    const x = structuredClone(base); mutate(x);
    assert.throws(() => compareMeaningSem(x, base), /invalid_meaning_target/);
  }
});

function population() {
  const probes = [{ handle: 'p1', text: 'Alice sends the report to Bob.', language: 'en', expectedOutcome: 'parse' },
    { handle: 'p2', text: 'Revoke.', language: 'en', expectedOutcome: 'abstain' },
    { handle: 'p3', text: 'It might happen.', language: 'en', expectedOutcome: 'parse' }];
  const targetSem = sem([{ predicate: 'send', roles: { agent: actor('alice'), recipient: actor('bob'), object: document('report') } }]);
  const targets = probes.map((p, i) => ({ probeId: p.handle, sourceText: p.text, language: p.language, expectedOutcome: p.expectedOutcome,
    reviewStatus: i === 2 ? 'unresolved' : 'reviewed', reviewNote: 'diagnostic review only', goldSem: i === 0 ? targetSem : null }));
  const requests = probes.map((p, i) => ({ handle: `h${i}`, sourceText: p.text, sourceLanguage: p.language, sourceSha256: sha(p.text) }));
  const candidates = requests.map((r, i) => ({ handle: r.handle, sourceSha256: r.sourceSha256, contractHash: 'a'.repeat(64), status: i === 0 ? 'parse' : 'abstain', candidateSem: i === 0 ? targetSem : null }));
  const runs = candidates.map(c => ({ ...c, failure: null, exitCode: 0, lastSubmission: { candidateIdentityAvailable: c.status === 'parse' } }));
  return { probes, requests, targets, candidates, runs };
}

test('all source rows remain visible; unresolved interpretations do not become successes', () => {
  const report = scoreRecordedMeaning(population());
  assert.equal(report.overall.total, 3);
  assert.equal(report.overall.unresolved, 1);
  assert.equal(report.overall.reviewedMatchesOrDeclaredAbstentions, 2);
  assert.equal(report.overall.coreAbstentionsSubmitted, 0);
  assert.equal(report.newModelCalls, 0);
});

test('issuing an identity to wrong semantics does not defeat meaning scoring', () => {
  const x = population(); x.candidates[0].candidateSem = structuredClone(x.candidates[0].candidateSem);
  x.candidates[0].candidateSem.clauses[0].roles.recipient.id = 'charlie'; x.runs[0].candidateSem = x.candidates[0].candidateSem;
  const report = scoreRecordedMeaning(x);
  assert.equal(report.items[0].outcomeCorrect, true);
  assert.equal(report.items[0].meaningStatus, 'mismatch');
});

test('missing parses stay in task and feature recall denominators', () => {
  const x = population(); x.candidates.shift(); x.runs.shift();
  const report = scoreRecordedMeaning(x);
  assert.equal(report.overall.total, 3);
  assert.equal(report.items[0].meaningStatus, 'missing');
  assert.equal(report.items[0].comparison.features.recall, 0);
  assert.equal(report.items[0].comparison.features.precision, null);
  assert.equal(report.overall.features.recall, 0);
});

test('abstention with candidate, provider failures and wrong outcomes do not count as fidelity', () => {
  for (const mutate of [x => { x.candidates[0].status = 'abstain'; x.runs[0].status = 'abstain'; },
    x => { x.runs[0].failure = 'timeout'; }, x => { x.runs[0].exitCode = 1; }]) {
    const x = population(); mutate(x); const report = scoreRecordedMeaning(x);
    assert.notEqual(report.items[0].meaningStatus, 'match');
    assert.equal(report.items[0].comparison.features.recall, 0);
  }
});

test('duplicate, altered, omitted and inconsistent evidence fails closed', () => {
  for (const mutate of [x => x.candidates.push(x.candidates[0]), x => { x.candidates[0].sourceSha256 = 'b'.repeat(64); },
    x => { x.runs[0].candidateSem = null; }, x => { x.targets[0].sourceText = 'Other source'; },
    x => { x.targets[0].expectedOutcome = 'abstain'; }, x => { x.targets[2].goldSem = base; }, x => x.targets.pop(),
    x => { x.candidates[0].handle = 'unknown'; }]) {
    const x = population(); mutate(x); assert.throws(() => scoreRecordedMeaning(x));
  }
});

test('unreviewed targets cannot silently supply gold or an invented review state', () => {
  const x = population(); x.targets[0].reviewStatus = 'auto-approved';
  assert.throws(() => validateMeaningTargets(x.targets, x.probes), /target_review_missing/);
});

test('source-bound meaning preflight rejects missing or unsupported source metadata without changing pure Sem comparison', () => {
  assert.equal(compareMeaningSem(base, structuredClone(base)).status, 'match');
  for (const mutate of [
    x => { x.probes[0].language = 'xx'; x.targets[0].language = 'xx'; },
    x => { x.probes[0].text = ' '; x.targets[0].sourceText = ' '; },
    x => { x.probes[0].language = ''; x.targets[0].language = ''; }
  ]) {
    const input = population(); mutate(input);
    assert.throws(() => validateMeaningTargets(input.targets, input.probes), /invalid_meaning_targets/);
  }
});

test('round-two threshold correction and known meaning mutations reproduce from frozen evidence', () => {
  const dir = 'reports/independent-evaluation/2026-09-26-round2/';
  const read = file => fs.readFileSync(dir + file, 'utf8').trim().split('\n').map(JSON.parse);
  const requests = read('live-oos/requests.jsonl'); const candidates = read('live-oos/candidate-ledger.jsonl');
  const find = source => candidates.find(c => c.handle === requests.find(r => r.sourceText.startsWith(source)).handle).candidateSem;
  const threshold = find('The finance lead');
  assert.equal(threshold.clauses[0].conditions[0].roles.value.value, 5000);
  const target = sem([{ predicate: 'allow', roles: { agent: actor('finance_lead'), recipient: actor('omar'), action: 'approve', theme: document('invoices') },
    conditions: [{ predicate: 'below', roles: { subject: document('invoices'), value: { type: 'quantity', value: 5000, unit: 'euros' } } }] }]);
  assert.equal(compareMeaningSem(target, threshold).status, 'match');
  const removed = structuredClone(threshold); delete removed.clauses[0].conditions;
  assert.equal(compareMeaningSem(target, removed).status, 'mismatch');
  assert.equal(compareMeaningSem(target, removed).dimensions.condition.recall < 1, true);
});

test('source digit loss and target-source drift are rejected before scoring', () => {
  const x = population(); x.probes[0].text = 'Alice sends report Q-81 to Bob.';
  x.targets[0].sourceText = x.probes[0].text;
  assert.throws(() => validateMeaningTargets(x.targets, x.probes), /target_source_literal_missing:p1/);
});

test('file-bound replay refuses altered schema/version, dataset, targets, package and raw streams', () => {
  const manifest = JSON.parse(fs.readFileSync('experiments/meaning-scoring-recorded-v5/input-manifest.json', 'utf8'));
  const previousManifest = JSON.parse(fs.readFileSync('experiments/meaning-scoring-recorded-v4/input-manifest.json', 'utf8'));
  const originalManifest = JSON.parse(fs.readFileSync('experiments/meaning-scoring-recorded-v2/input-manifest.json', 'utf8'));
  assert.deepEqual(manifest.inputs, originalManifest.inputs);
  assert.equal(manifest.supersedes.manifest, 'experiments/meaning-scoring-recorded-v4/input-manifest.json');
  assert.equal(previousManifest.scoringContract.agent, 'lunum-agent/0.15');
  assert.deepEqual(manifest.inputs, previousManifest.inputs);
  assert.deepEqual(manifest.review, previousManifest.review);
  const migratedContract = structuredClone(manifest.scoringContract);
  migratedContract.agent = previousManifest.scoringContract.agent;
  assert.deepEqual(migratedContract, previousManifest.scoringContract);
  assert.equal(manifest.scoringContract.agent, 'lunum-agent/0.16');
  const temp = mkdtempSync(path.join(os.tmpdir(), 'lunum-meaning-test-'));
  try {
    for (const mutate of [x => { x.scoringContract.schemaSha256 = 'a'.repeat(64); },
      x => { x.scoringContract.agent = 'lunum-agent/0.10'; },
      x => { x.inputs.probes.sha256 = 'a'.repeat(64); }, x => { x.inputs.targets.sha256 = 'a'.repeat(64); },
      x => { x.inputs.package.sha256 = 'a'.repeat(64); }]) {
      const changed = structuredClone(manifest); mutate(changed);
      const file = path.join(temp, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(changed));
      assert.throws(() => scoreRecordedMeaningFiles(file), /binding_mismatch|artifact_hash_mismatch/);
    }
    assert.throws(() => scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v1/input-manifest.json'), /scoring_contract_binding_mismatch/, 'frozen v1 stays bound to 0.12, never silently relabelled');
    assert.throws(() => scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v2/input-manifest.json'), /scoring_contract_binding_mismatch/, 'frozen v2 stays bound to 0.13');
    assert.throws(() => scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v3/input-manifest.json'), /scoring_contract_binding_mismatch/, 'frozen v3 stays bound to 0.14');
    assert.throws(() => scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v4/input-manifest.json'), /scoring_contract_binding_mismatch/, 'frozen v4 stays bound to 0.15');
    assert.equal(scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v5/input-manifest.json').overall.total, 30);
    const changed = structuredClone(manifest);
    const runs = fs.readFileSync(changed.inputs.runs.path, 'utf8').trim().split('\n').map(JSON.parse);
    for (const run of runs) run.rawStream = path.resolve(path.dirname(changed.inputs.runs.path), run.rawStream);
    runs[0].rawStreamSha256 = 'b'.repeat(64);
    const runFile = path.join(temp, 'runs.jsonl'); const runRaw = runs.map(JSON.stringify).join('\n') + '\n';
    fs.writeFileSync(runFile, runRaw); changed.inputs.runs = { path: runFile, sha256: sha(runRaw) };
    const summary = JSON.parse(fs.readFileSync(changed.inputs.summary.path, 'utf8'));
    summary.runLedgerSha256 = sha(runRaw);
    const summaryFile = path.join(temp, 'summary.json'); const summaryRaw = JSON.stringify(summary);
    fs.writeFileSync(summaryFile, summaryRaw); changed.inputs.summary = { path: summaryFile, sha256: sha(summaryRaw) };
    const file = path.join(temp, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(changed));
    assert.throws(() => scoreRecordedMeaningFiles(file), /raw_stream_hash_mismatch/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('observed contract evidence comes only from successful native tool results', () => {
  const events = [
    { message: { content: [{ type: 'tool_use', id: 'tool1', name: 'mcp__lunum__lunum_get_extraction_contract', input: {} }] } },
    { message: { content: [{ type: 'tool_result', tool_use_id: 'tool1', content: JSON.stringify({ success: true, contract: { contractVersion: 'test/1' } }) }] } },
  ];
  assert.equal(observedExtractionContracts(events)[0].contract.contractVersion, 'test/1');
  const failed = structuredClone(events); failed[1].message.content[0].is_error = true;
  assert.throws(() => observedExtractionContracts(failed), /invalid_contract_tool_events/);
  const duplicated = [...events, events[1]];
  assert.throws(() => observedExtractionContracts(duplicated), /invalid_contract_tool_events/);
  assert.deepEqual(observedExtractionContracts([{ message: { content: [{ type: 'text', text: 'I used contract test/1' }] } }]), []);
});

test('offline replay performs no fetch/model request', () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('unexpected_network_call'); };
  try {
    assert.equal(scoreRecordedMeaningFiles('experiments/meaning-scoring-recorded-v5/input-manifest.json').newModelCalls, 0);
  } finally { globalThis.fetch = previous; }
});

test('deliberately removing role binding is caught by the role-swap regression', async () => {
  const url = new URL('./score-recorded-meaning.mjs', import.meta.url);
  let source = fs.readFileSync(url, 'utf8');
  const line = 'const add = (atomPath, value, dimension) => atoms.push({ path: atomPath, value, dimension });';
  assert.ok(source.includes(line));
  source = source.replace(line, "const add = (atomPath, value, dimension) => atoms.push({ path: atomPath.replace(/\\.roles\\.(agent|recipient)/gu, '.roles.actor'), value, dimension });");
  source = source.replace("from '../../packages/core/dist/src/index.js'", `from ${JSON.stringify(new URL('../../packages/core/dist/src/index.js', url).href)}`);
  source = source.replace("from '../../packages/eval/dist/src/parse-experiment.js'", `from ${JSON.stringify(new URL('../../packages/eval/dist/src/parse-experiment.js', url).href)}`);
  source = source.replace("from './replay-client-events.mjs'", `from ${JSON.stringify(new URL('./replay-client-events.mjs', url).href)}`);
  source = source.replace("createRequire(new URL('../../packages/eval/package.json', import.meta.url))", `createRequire(${JSON.stringify(new URL('../../packages/eval/package.json', url).href)})`);
  source = source.replace("fileURLToPath(new URL('../../', import.meta.url))", JSON.stringify(fileURLToPath(new URL('../../', url))));
  source = source.replace("if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {", 'if (false) {');
  const mutant = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const changed = structuredClone(base);
  [changed.clauses[0].roles.agent, changed.clauses[0].roles.recipient] = [changed.clauses[0].roles.recipient, changed.clauses[0].roles.agent];
  assert.equal(mutant.compareMeaningSem(base, changed).status, 'match');
  assert.throws(() => assert.notEqual(mutant.compareMeaningSem(base, changed).status, 'match'), assert.AssertionError);
  assert.equal(compareMeaningSem(base, changed).status, 'mismatch');
});

test('deliberately dropping modality comparison defeats fidelity; the modality regression detects the weakening', async () => {
  // Import an in-memory mutant of the actual scorer, not a mocked model or fabricated ledger.
  const url = new URL('./score-recorded-meaning.mjs', import.meta.url);
  let source = fs.readFileSync(url, 'utf8');
  const line = "      add(`${prefix}.modality`, clause.modality ?? null, 'modality');";
  assert.ok(source.includes(line));
  source = source.replace(line, '');
  source = source.replace("from '../../packages/core/dist/src/index.js'", `from ${JSON.stringify(new URL('../../packages/core/dist/src/index.js', url).href)}`);
  source = source.replace("from '../../packages/eval/dist/src/parse-experiment.js'", `from ${JSON.stringify(new URL('../../packages/eval/dist/src/parse-experiment.js', url).href)}`);
  source = source.replace("from './replay-client-events.mjs'", `from ${JSON.stringify(new URL('./replay-client-events.mjs', url).href)}`);
  source = source.replace("createRequire(new URL('../../packages/eval/package.json', import.meta.url))", `createRequire(${JSON.stringify(new URL('../../packages/eval/package.json', url).href)})`);
  source = source.replace("fileURLToPath(new URL('../../', import.meta.url))", JSON.stringify(fileURLToPath(new URL('../../', url))));
  source = source.replace("if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {", 'if (false) {');
  const mutant = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const changed = structuredClone(base); changed.clauses[0].modality = 'permission';
  assert.equal(mutant.compareMeaningSem(base, changed).status, 'match');
  assert.throws(() => assert.notEqual(mutant.compareMeaningSem(base, changed).status, 'match'), assert.AssertionError);
  assert.notEqual(compareMeaningSem(base, changed).status, 'match');
});
