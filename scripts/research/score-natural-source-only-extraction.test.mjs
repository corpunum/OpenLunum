import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  classifyLedgerEntry,
  compareSourceRelativeSemantics,
  sourceAnchoredLiteralIdentity,
  identityRepresentationsComparable,
  summarizeCriticalContrasts,
  summarizeGroup,
  validatePrivateSourceMap,
  validateRequestLedgerBindings
} from './score-natural-source-only-extraction.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('explicit abstention is distinct from missing or malformed output', () => {
  assert.equal(classifyLedgerEntry(undefined), 'missing');
  assert.equal(classifyLedgerEntry({ status: 'abstain', candidateSem: null }), 'abstain');
  assert.equal(classifyLedgerEntry({ status: 'parse', candidateSem: { schema: 'lunum-sem/0.1-draft' } }), 'parse');
  assert.equal(classifyLedgerEntry({ status: 'parse', candidateSem: null }), 'malformed');
  assert.equal(classifyLedgerEntry({ status: 'abstain', candidateSem: {} }), 'malformed');
});

test('multilingual convergence requires complete usable outputs', () => {
  const complete = summarizeGroup('g', [
    { submission: { semanticFingerprint: 'lfp:x' }, exact: true, abstentionCorrect: false },
    { submission: { semanticFingerprint: 'lfp:x' }, exact: true, abstentionCorrect: false }
  ]);
  assert.equal(complete.completeParseOutputs, true);
  assert.equal(complete.candidateConverges, true);

  const partial = summarizeGroup('g', [
    { submission: { semanticFingerprint: 'lfp:x' }, exact: false, abstentionCorrect: false },
    { submission: null, exact: null, abstentionCorrect: false }
  ]);
  assert.equal(partial.completeParseOutputs, false);
  assert.equal(partial.candidateConverges, false);

  const abstained = summarizeGroup('g', [
    { submission: null, exact: null, abstentionCorrect: true },
    { submission: null, exact: null, abstentionCorrect: true }
  ]);
  assert.equal(abstained.allExplicitAbstentions, true);
  assert.equal(abstained.candidateConverges, false);
});

test('request and ledger evidence is bound to handle, source hash and contract hash', () => {
  const sourceText = 'A source sentence.';
  const request = { handle: 'h1', sourceText, sourceSha256: sha256(sourceText), contractHash: 'contract-a' };
  const entry = { handle: 'h1', sourceSha256: request.sourceSha256, contractHash: 'contract-a', status: 'abstain', candidateSem: null };
  assert.doesNotThrow(() => validateRequestLedgerBindings([request], [entry]));

  assert.throws(
    () => validateRequestLedgerBindings([request], [{ ...entry, sourceSha256: sha256('different') }]),
    /ledger_source_hash_mismatch:h1/
  );
  assert.throws(
    () => validateRequestLedgerBindings([request], [{ ...entry, contractHash: 'contract-b' }]),
    /ledger_contract_hash_mismatch:h1/
  );
  assert.throws(
    () => validateRequestLedgerBindings([request], [{ ...entry, handle: 'unknown' }]),
    /ledger_unknown_handle:unknown/
  );
  assert.throws(
    () => validateRequestLedgerBindings([request, request], [entry]),
    /duplicate_or_missing_request_handle:h1/
  );
});

test('private source mapping is one-to-one and bound to requests and source rows', () => {
  const requests = [{ handle: 'h1' }, { handle: 'h2' }];
  const rows = new Map([['r1', {}], ['r2', {}]]);
  assert.doesNotThrow(() => validatePrivateSourceMap({ h1: { sourceRowId: 'r1' }, h2: { sourceRowId: 'r2' } }, requests, rows));
  assert.throws(() => validatePrivateSourceMap({ h1: { sourceRowId: 'r1' }, h2: { sourceRowId: 'r1' } }, requests, rows), /private_map_duplicate_source_row:r1/);
  assert.throws(() => validatePrivateSourceMap({ h1: { sourceRowId: 'r1' }, unknown: { sourceRowId: 'r2' } }, requests, rows), /private_map_unknown_handle:unknown/);
  assert.throws(() => validatePrivateSourceMap({ h1: {} }, requests, rows), /private_map_invalid_entry:h1/);
});

test('identity comparability supports matching literal modes and rejects reference/literal mismatch', () => {
  const literalA = {
    clauses: [{ predicate: 'retry', roles: { count: { type: 'quantity', value: 5 }, theme: { type: 'task', value: 'upload' } } }]
  };
  const literalB = {
    clauses: [{ predicate: 'retry', roles: { count: { type: 'quantity', value: 50 }, theme: { type: 'task', value: 'download' } } }]
  };
  assert.equal(identityRepresentationsComparable(literalA, literalB), true);

  const reference = {
    clauses: [{ predicate: 'retry', roles: { count: { type: 'quantity', value: 5 }, theme: { type: 'task', id: 'upload-task' } } }]
  };
  assert.equal(identityRepresentationsComparable(literalA, reference), false);
});

test('literal exact identity requires source-visible anchoring', () => {
  const sem = { clauses: [{ predicate: 'send', roles: { object: { type: 'document', value: 'F-17' } } }] };
  assert.equal(sourceAnchoredLiteralIdentity(sem, 'Rhea sends file F-17.'), true);
  assert.equal(sourceAnchoredLiteralIdentity(sem, 'Rhea sends file F-18.'), false);
  const shortId = structuredClone(sem);
  shortId.clauses[0].roles.object.value = 'F-1';
  assert.equal(sourceAnchoredLiteralIdentity(shortId, 'Rhea sends file F-17.'), false);
});

test('abstention-only groups are not exact parse groups', () => {
  assert.equal(summarizeGroup('abstain', [
    { submission: null, exact: null, abstentionCorrect: true },
    { submission: null, exact: null, abstentionCorrect: true }
  ]).exact, false);
});

test('critical contrasts require every prescribed endpoint output', () => {
  const subset = [
    { id: 'left-1', source: { semanticGroup: 'left' }, target: { outcome: 'parse', criticalNegativePairIds: ['pair'] } },
    { id: 'left-2', source: { semanticGroup: 'left' }, target: { outcome: 'parse', criticalNegativePairIds: ['pair'] } },
    { id: 'right-1', source: { semanticGroup: 'right' }, target: { outcome: 'parse', criticalNegativePairIds: ['pair'] } },
  ];
  const sourceRow = new Map(subset.map((row) => [row.id, row]));
  const sem = { world: 'real', kind: 'event', clauses: [{ predicate: 'send', roles: {} }] };
  const partial = summarizeCriticalContrasts(subset, sourceRow, [
    { sourceRowId: 'left-1', submission: { sem } },
    { sourceRowId: 'right-1', submission: { sem: { ...sem, clauses: [{ predicate: 'receive', roles: {} }] } } }
  ]);
  assert.equal(partial.pairResults[0].available, false);
  assert.equal(partial.familiesWithCompleteOutputs, 0);
});

test('identity comparability checks nested clauses rather than only the first clause', () => {
  const left = {
    clauses: [{
      predicate: 'require',
      roles: { agent: { type: 'actor', id: 'alice' } },
      conditions: [{ predicate: 'before', roles: { object: { type: 'date', value: '2026-09-14' } } }]
    }]
  };
  const right = {
    clauses: [{
      predicate: 'require',
      roles: { agent: { type: 'actor', id: 'alice' } },
      conditions: [{ predicate: 'before', roles: { object: { type: 'date', id: 'private-date-id' } } }]
    }]
  };
  assert.equal(identityRepresentationsComparable(left, right), false);
});

test('source-relative comparison reports nested meaning fields independently of identity mode', () => {
  const expected = {
    world: 'real', kind: 'event', clauses: [{ predicate: 'require', negated: false, modality: 'obligation',
      roles: { theme: { type: 'document', id: 'private-report' }, amount: { type: 'quantity', value: 5, unit: 'times' } },
      conditions: [{ predicate: 'before', negated: false, time: { type: 'date', value: '2026-09-14' }, roles: { audience: { type: 'audience', id: 'private-audience' } } }],
      consequences: [{ predicate: 'notify', negated: false, roles: { recipient: { type: 'actor', id: 'user' } } }] }]
  };
  const sameMeaning = structuredClone(expected);
  sameMeaning.clauses[0].roles.theme = { type: 'document', value: 'report' };
  sameMeaning.clauses[0].conditions[0].time = { type: 'date', value: '2026-09-14' };
  sameMeaning.clauses[0].conditions[0].roles.audience = { type: 'audience', value: 'public' };
  assert.equal(compareSourceRelativeSemantics(expected, sameMeaning).status, 'unresolved');

  const changed = structuredClone(sameMeaning);
  changed.clauses[0].consequences[0].predicate = 'publish';
  changed.clauses[0].roles.amount.unit = 'minutes';
  assert.equal(compareSourceRelativeSemantics(expected, changed).status, 'mismatch');
});

test('source-relative comparison distinguishes polarity, role swaps, and audience omission', () => {
  const base = { world: 'real', kind: 'event', clauses: [{ predicate: 'prohibit', negated: false, roles: {
    agent: { type: 'actor', value: 'security officer' }, recipient: { type: 'actor', value: 'contractor' },
    theme: { type: 'concept', value: 'archive access' }, audience: { type: 'audience', value: 'public' }
  } }] };
  const negated = structuredClone(base); negated.clauses[0].negated = true;
  const swapped = structuredClone(base); [swapped.clauses[0].roles.agent, swapped.clauses[0].roles.recipient] = [swapped.clauses[0].roles.recipient, swapped.clauses[0].roles.agent];
  const omitted = structuredClone(base); delete omitted.clauses[0].roles.audience;
  assert.equal(compareSourceRelativeSemantics(base, negated).status, 'mismatch');
  assert.equal(compareSourceRelativeSemantics(base, swapped).status, 'mismatch');
  assert.equal(compareSourceRelativeSemantics(base, omitted).status, 'mismatch');
});

test('source-relative comparison reports a term-type disagreement as a mismatch with contract provenance', () => {
  const left = { world: 'real', kind: 'event', clauses: [{ predicate: 'publish', roles: { theme: { type: 'document', value: 'report' } } }] };
  const right = structuredClone(left);
  right.clauses[0].roles.theme.type = 'concept';
  const result = compareSourceRelativeSemantics(left, right);
  assert.equal(result.status, 'unresolved');
  assert.ok(result.contractUnresolved > 0);
});

test('source-relative contract provenance propagates through nested clauses', () => {
  const left = { world: 'real', kind: 'event', clauses: [{ predicate: 'require', roles: {}, conditions: [{ predicate: 'publish', roles: { theme: { type: 'document', value: 'report' } } }] }] };
  const right = structuredClone(left);
  right.clauses[0].conditions[0].roles.theme.type = 'concept';
  const result = compareSourceRelativeSemantics(left, right);
  assert.equal(result.status, 'unresolved');
  assert.ok(result.contractUnresolved > 0);
});

test('source-relative comparison detects clause-level time changes', () => {
  const left = { world: 'real', kind: 'event', clauses: [{ predicate: 'deadline', roles: {}, time: { type: 'date', value: '2026-09-14' } }] };
  const right = structuredClone(left);
  right.clauses[0].time.value = '2026-09-15';
  const result = compareSourceRelativeSemantics(left, right);
  assert.equal(result.status, 'mismatch');
  assert.ok(result.details.find((detail) => detail.path === 'clauses[0]').children.some((child) => child.field === 'time' && child.status === 'mismatch'));
});
