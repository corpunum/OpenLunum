import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  getExtractionContract, submitCandidate, submitCandidateWithGrounding,
  submitCandidateWithGroundingProviders,
} from '../src/agent-native.js';
import { validateSemanticTransport } from '../src/semantic-transport.js';
import { SEMANTIC_TRANSPORT_SCHEMA } from '../src/semantic-transport-schema.js';
import { buildCandidateSem, getCandidateBuilderSchema } from '../src/agent-builder.js';
import { validateSemanticCandidate } from '../src/policy.js';
import { semanticFingerprint } from '../src/fingerprint.js';
import { createStableEntityProvider } from '../src/grounding-provider.js';

const root = new URL('../../../../', import.meta.url);
const actor = (id: string) => ({ type: 'actor', id });
const base = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction',
  clauses: [{ predicate: 'notify', roles: { recipient: actor('lee') },
    conditions: [{ predicate: 'above', roles: { subject: { type: 'metric', id: 'disk_usage' }, value: { type: 'quantity', value: 90, unit: 'percent' } } }],
  }],
};
const provenance = { extractorType: 'other' as const };
const submit = (candidateSem: unknown) => submitCandidate({ sourceText: 'Notify Lee when disk usage exceeds 90 percent.', candidateSem, provenance });
const invalid = (candidate: unknown) => {
  const result = submit(candidate);
  assert.equal(result.transportValid, false);
  assert.equal(result.structuralValid, false);
  assert.equal(result.sem, null);
  assert.equal(result.semanticFingerprint, null);
  assert.equal(result.candidateIdentityAvailable, false);
  assert.equal(result.trust.promoted, false);
  assert.equal(result.trust.confidence, 0);
  assert.equal(result.failureClass, 'transport_or_structural_invalid');
  assert.ok(result.diagnostics.length);
  return result;
};

test('runtime schema and published hash match authoritative wire bytes; generation drift gate passes', () => {
  const bytes = fs.readFileSync(new URL('schemas/lunum-sem.schema.json', root));
  assert.deepEqual(SEMANTIC_TRANSPORT_SCHEMA, JSON.parse(bytes.toString()));
  assert.equal(getExtractionContract().transport.schemaHash, createHash('sha256').update(bytes).digest('hex'));
  execFileSync(process.execPath, [new URL('scripts/generate-sem-transport.mjs', root).pathname, '--check']);
});

test('e05 historical invalid nested fields are rejected before normalization, retaining source and raw candidate', () => {
  const read = (file: string) => fs.readFileSync(new URL(file, root), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const dir = 'reports/independent-evaluation/2026-09-26-round2/live-oos/';
  const request = read(dir + 'requests.jsonl').find(row => row.sourceText.startsWith('Please notify'));
  const candidate = read(dir + 'candidate-ledger.jsonl').find(row => row.handle === request.handle).candidateSem;
  const original = structuredClone(candidate);
  assert.equal(validateSemanticCandidate(candidate).ok, true, 'old structural checker cannot enforce wire constraints');
  const result = invalid(candidate);
  assert.ok(result.diagnostics.some(error => error.includes('world')));
  assert.deepEqual(candidate, original);
});

for (const location of ['top', 'clause', 'condition', 'consequence', 'nested-condition', 'nested-consequence']) {
  test(`unknown field is wire-invalid at ${location}`, () => {
    const x: any = structuredClone(base);
    const clause = x.clauses[0];
    const condition = clause.conditions[0];
    clause.consequences = [structuredClone(condition)];
    condition.conditions = [structuredClone(condition)];
    clause.consequences[0].consequences = [structuredClone(condition.conditions[0])];
    const target = location === 'top' ? x : location === 'clause' ? clause : location === 'condition' ? condition
      : location === 'consequence' ? clause.consequences[0] : location === 'nested-condition' ? condition.conditions[0] : clause.consequences[0].consequences[0];
    target.extraIdentityField = 'tool';
    invalid(x);
  });
}

test('transport acceptance is not canonicality or promotion; valid identity bytes stay unchanged', () => {
  const result = submit(base);
  assert.equal(result.transportValid, true);
  assert.equal(result.candidateIdentityAvailable, true);
  assert.equal(result.semanticFingerprint, semanticFingerprint(base));
  assert.equal(result.trust.promoted, false);
  assert.equal(result.provenance.contractVersion, 'lunum-agent/0.19');
  const x = structuredClone(base); x.clauses[0]!.predicate = 'invented';
  assert.equal(submit(x).transportValid, true);
  assert.equal(submit(x).protocolCanonical, false);
  assert.equal(submit(x).candidateIdentityAvailable, false);
});

test('schema-defined recursive arrays, term extensions and evidence containers remain wire-valid', () => {
  const x: any = structuredClone(base);
  x.clauses[0].roles.recipient = [actor('lee'), [actor('mira')]];
  x.clauses[0].roles.extension = { type: 'concept', id: 'x', customEvidence: { text: 'source' } };
  x.clauses[0].annotations = { source: 'retained' };
  x.references = [{ referenceKind: 'surface-evidence', token: 'she' }];
  x.provenance = { model: 'fixture' }; x.annotations = {};
  assert.equal(validateSemanticTransport(x).ok, true);
  assert.equal(submit(x).transportValid, true);
  assert.equal(submit(x).candidateIdentityAvailable, false, 'wire validity cannot bypass frame/identity checks');
});

test('no coercion, field removal or defaults; invalid term literals stay invalid', () => {
  const x = structuredClone(base);
  const before = structuredClone(x);
  assert.equal(validateSemanticTransport(x).ok, true);
  assert.deepEqual(x, before);
  for (const mutate of [
    (v: any) => { v.clauses[0].conditions[0].roles.value.value = '90'; },
    (v: any) => { v.clauses[0].negated = 'false'; },
    (v: any) => { v.references = ['she']; },
    (v: any) => { v.clauses[0].roles.recipient.id = 123; },
    (v: any) => { v.clauses[0].roles.recipient = { id: 'lee' }; },
  ]) {
    const changed = structuredClone(base); mutate(changed);
    const original = structuredClone(changed); invalid(changed); assert.deepEqual(changed, original);
  }
});

test('cyclic clauses/arrays, non-finite metadata and non-JSON objects fail closed without throwing', () => {
  const x: any = structuredClone(base); x.clauses[0].conditions = [x.clauses[0]];
  invalid(x);
  const list: any[] = []; list.push(list);
  const y: any = structuredClone(base); y.clauses[0].roles.recipient = list; invalid(y);
  for (const value of [Infinity, NaN, undefined, new Date()]) {
    const z: any = structuredClone(base); z.annotations = { value }; invalid(z);
  }
});

test('grounding cannot repair invalid wire input or override its failure classification', () => {
  const x: any = structuredClone(base); x.clauses[0].conditions[0].world = 'real';
  const input = { sourceText: 'Notify Lee.', candidateSem: x, provenance, grounding: [] };
  const provider = createStableEntityProvider({ provider: 'test', providerVersion: '1', snapshotHash: 'a'.repeat(64), resolveExact: () => { throw new Error('provider_must_not_be_called'); } });
  input.grounding = [{ path: 'clauses[0].roles.recipient', termType: 'actor', head: { kind: 'symbol', namespace: 'actor', key: 'lee' } }] as never;
  for (const result of [submitCandidateWithGrounding(input), submitCandidateWithGroundingProviders(input, [provider])]) {
    assert.equal(result.transportValid, false);
    assert.equal(result.failureClass, 'transport_or_structural_invalid');
    assert.equal(result.candidateIdentityAvailable, false);
    assert.equal(result.grounding.status, 'invalid');
  }
});

test('accessor/proxy/non-JSON hidden properties cannot mutate a candidate during validation', () => {
  const x: any = structuredClone(base);
  let reads = 0;
  Object.defineProperty(x, 'annotations', { enumerable: true, get() { reads++; x.clauses[0].conditions[0].world = 'real'; return {}; } });
  invalid(x);
  assert.equal(reads, 0, 'candidate accessors are never invoked');
  invalid(new Proxy(structuredClone(base), {}));
  const y = structuredClone(base); Object.defineProperty(y, 'hidden', { value: 'not JSON' }); invalid(y);
  const z: any = structuredClone(base); z[Symbol('hidden')] = 'not JSON'; invalid(z);
});

test('builder nested clauses use wire clause shape, not envelope world/kind fields', () => {
  const input = { world: base.world, kind: base.kind, ...base.clauses[0]! };
  const validate = new Ajv2020({ strict: false }).compile(getCandidateBuilderSchema());
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
  assert.equal(validateSemanticTransport(buildCandidateSem(input).sem).ok, true);
  const x: any = structuredClone(input); x.conditions[0].world = 'real';
  assert.equal(validate(x), false);
  assert.throws(() => buildCandidateSem(x), /invalid_builder_candidate/);
  const y: any = structuredClone(input); y.conditions[0].roles.value.value = '90';
  assert.equal(validate(y), false);
  assert.throws(() => buildCandidateSem(y), /invalid_builder_candidate/);
});

test('deliberately bypassing actual schema enforcement is caught by the e05 regression', async () => {
  const url = new URL('../src/agent-native.js', import.meta.url);
  let source = fs.readFileSync(url, 'utf8');
  const line = 'const transport = validateSemanticTransport(input.candidateSem);';
  assert.ok(source.includes(line));
  source = source.replace(line, 'const transport = validateSemanticCandidate(input.candidateSem);');
  source = source.replace(/from '(\.\/[^']+)'/gu, (_, specifier: string) => `from ${JSON.stringify(new URL(specifier, url).href)}`);
  const mutant = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const x: any = structuredClone(base); x.clauses[0].conditions[0].world = 'real';
  assert.equal(mutant.submitCandidate({ sourceText: 'Notify Lee.', candidateSem: x, provenance }).candidateIdentityAvailable, true);
  assert.throws(() => assert.equal(mutant.submitCandidate({ sourceText: 'Notify Lee.', candidateSem: x, provenance }).candidateIdentityAvailable, false), assert.AssertionError);
  invalid(x);
});
