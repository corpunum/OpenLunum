import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from '../src/failure-classification.js';

test('classifyFailure: provider_timeout on timeout error', () => {
  const result = classifyFailure(new Error('Request aborted due to timeout'));
  assert.equal(result.failureClass, 'provider_timeout');
});

test('classifyFailure: provider_network_error on connection refused', () => {
  const result = classifyFailure(new Error('fetch failed: ECONNREFUSED 127.0.0.1:9999'));
  assert.equal(result.failureClass, 'provider_network_error');
});

test('classifyFailure: json_parse_error on JSON extraction failure', () => {
  const result = classifyFailure(new Error('JSON.parse: unexpected token at position 12'));
  assert.equal(result.failureClass, 'json_parse_error');
});

test('classifyFailure: transport_schema_violation on schema error', () => {
  const result = classifyFailure(new Error('transport schema validation failed: missing field "predicate"'));
  assert.equal(result.failureClass, 'transport_schema_violation');
});

test('classifyFailure: truncation on length finish_reason', () => {
  const result = classifyFailure(new Error('finish_reason: length — output was truncated'));
  assert.equal(result.failureClass, 'truncation');
});

test('classifyFailure: wrong_negation from negation-flip invariant', () => {
  const result = classifyFailure(null, {
    invariants: [{ code: 'negation-flip', detail: 'gold.negated=true, candidate.negated=false' }]
  });
  assert.equal(result.failureClass, 'wrong_negation');
  assert.match(result.detail, /negated/u);
});

test('classifyFailure: wrong_modality from obligation-permission invariant', () => {
  const result = classifyFailure(null, {
    invariants: [{ code: 'obligation-permission', detail: 'gold.modality=must, candidate.modality=may' }]
  });
  assert.equal(result.failureClass, 'wrong_modality');
});

test('classifyFailure: wrong_role from role-identity invariant', () => {
  const result = classifyFailure(null, {
    invariants: [{ code: 'role-identity', detail: 'actor binding mismatch' }]
  });
  assert.equal(result.failureClass, 'wrong_role');
});

test('classifyFailure: protected_literal_mismatch from protected-literal invariant', () => {
  const result = classifyFailure(null, {
    invariants: [{ code: 'protected-literal', detail: '"threshold" literal changed from 0.95 to 0.9' }]
  });
  assert.equal(result.failureClass, 'protected_literal_mismatch');
});

test('classifyFailure: wrong_predicate from missing predicate feature', () => {
  const result = classifyFailure(null, {
    missingFeatures: ['predicate:send:prefer']
  });
  assert.equal(result.failureClass, 'wrong_predicate');
});

test('classifyFailure: frame_requirement_violation from frame issues', () => {
  const result = classifyFailure(null, {
    frameIssues: [{ code: 'missing-required-role', message: 'prefer clause missing required role "experiencer"' }]
  });
  assert.equal(result.failureClass, 'frame_requirement_violation');
  assert.match(result.detail, /experiencer/u);
});

test('classifyFailure: unexpected_abstention when parse expected but model abstained', () => {
  const result = classifyFailure(null, {
    expectedOutcome: 'parse',
    abstained: true
  });
  assert.equal(result.failureClass, 'unexpected_abstention');
});

test('classifyFailure: unexpected_parse when abstain expected but sem returned', () => {
  const result = classifyFailure(null, {
    expectedOutcome: 'abstain',
    abstained: false
  });
  assert.equal(result.failureClass, 'unexpected_parse');
});

test('classifyFailure: unknown_failure when no context and no error', () => {
  const result = classifyFailure(null, {});
  assert.equal(result.failureClass, 'unknown_failure');
});

test('classifyFailure: unknown_failure for generic unrecognized error', () => {
  const result = classifyFailure(new Error('something entirely unexpected happened'));
  assert.equal(result.failureClass, 'unknown_failure');
});
