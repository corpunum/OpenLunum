import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  classifyLedgerEntry,
  identityRepresentationsComparable,
  summarizeGroup,
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
