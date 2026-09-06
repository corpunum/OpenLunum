import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BlindAgentEvaluationSession } from '../src/agent-evaluator.js';
import type { LunumSem } from '@corpunum/lunum';

type BlindEvaluationGoldItem = { id: string; sourceLanguage: string; sourceText: string; goldSem: LunumSem; expectedOutcome?: 'parse' | 'abstain'; semanticGroup?: string };

const goldSem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
  clauses: [{ predicate: 'prefer', roles: {
    experiencer: { type: 'actor', id: 'alex' }, theme: { type: 'concept', id: 'quiet_mode' },
  }, negated: false }],
};

const items: BlindEvaluationGoldItem[] = [
  { id: 'blind-1', sourceLanguage: 'en', sourceText: 'Alex prefers quiet mode.', goldSem },
  { id: 'blind-abstain', sourceLanguage: 'el', sourceText: 'The meaning is intentionally unsupported.', goldSem, expectedOutcome: 'abstain' },
];

test('next exposes source and contract only, never hidden gold', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-leakage', items, dir);
  const next = session.next();
  assert.deepEqual(Object.keys(next ?? {}).sort(), ['contractHash', 'contractVersion', 'itemId', 'runId', 'sourceLanguage', 'sourceText'].sort());
  assert.equal(JSON.stringify(next).includes('quiet_mode'), false);
  assert.equal(JSON.stringify(next).includes('gold'), false);
});

test('next reserves an item so concurrent workers cannot receive the same claim', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-claim', items, dir);
  assert.equal(session.next()?.itemId, 'blind-1');
  assert.equal(session.next()?.itemId, 'blind-abstain');
});

test('concurrent submissions cannot append duplicate results for one item', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-submit-race', items, dir);
  const submissions = await Promise.allSettled([
    session.submit({ runId: 'run-submit-race', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } }),
    session.submit({ runId: 'run-submit-race', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } }),
  ]);
  assert.equal(submissions.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(submissions.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(session.completedCount(), 1);
  const ledger = await readFile(path.join(dir, 'agent-results.jsonl'), 'utf8');
  assert.equal(ledger.split('\n').filter(Boolean).length, 1);
});

test('submission scores privately, persists immediately, and resumes without duplication', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-resume', items, dir);
  const first = await session.submit({ runId: 'run-resume', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent', extractorId: 'test' } });
  assert.equal(first.semanticIdentityExact, true);
  assert.equal('goldSem' in first, false);
  assert.equal('goldIdentity' in first, false);
  const ledger = await readFile(path.join(dir, 'agent-results.jsonl'), 'utf8');
  assert.equal(ledger.split('\n').filter(Boolean).length, 1);
  assert.equal(ledger.includes('expectedOutcome'), false);
  assert.equal(ledger.includes('"candidateIdentity":'), false);
  const resumed = await BlindAgentEvaluationSession.create('run-resume', items, dir);
  assert.equal(resumed.completedCount(), 1);
  assert.equal(resumed.next()?.itemId, 'blind-abstain');
  const summary = resumed.summary();
  assert.deepEqual({ parseTargets: summary.parseTargets, parseExact: summary.parseExact, abstentionTargets: summary.abstentionTargets }, { parseTargets: 1, parseExact: 1, abstentionTargets: 1 });
  assert.equal(summary.parseExactMicro, 1);
  assert.equal(summary.completedItems, 1);
  await assert.rejects(() => resumed.submit({ runId: 'run-resume', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } }), /already completed/u);
});

test('malformed ledger and mismatched checkpoint fail closed', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  await writeFile(path.join(dir, 'agent-results.jsonl'), '{truncated\n');
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-corrupt', items, dir), /Malformed JSONL ledger/u);
});

test('tampered terminal result is rejected during resume', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-tamper', items, dir);
  await session.submit({ runId: 'run-tamper', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } });
  const ledgerPath = path.join(dir, 'agent-results.jsonl');
  const record = JSON.parse(await readFile(ledgerPath, 'utf8')) as Record<string, unknown>;
  record.semanticIdentityExact = false;
  await writeFile(ledgerPath, `${JSON.stringify(record)}\n`);
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-tamper', items, dir), /does not match candidate/u);
});

test('malformed manifest metadata is rejected rather than recreated', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  await writeFile(path.join(dir, 'agent-manifest.json'), '{truncated\n');
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-metadata', items, dir), /Malformed blind evaluation metadata/u);
});

test('gold preflight rejects an identity-unavailable parse item', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const invalidGold = { ...goldSem, clauses: [{ ...goldSem.clauses[0], predicate: 'unframed_controlled_predicate' }] } as never;
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-gold-invalid', [{
    id: 'invalid', sourceLanguage: 'en', sourceText: 'invalid gold', goldSem: invalidGold,
  }], dir), /gold preflight failed/u);
});

test('gold preflight enforces multilingual group convergence and negative separation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const equivalent = [
    { id: 'group-a', sourceLanguage: 'en', sourceText: 'Alex prefers quiet mode.', goldSem, semanticGroup: 'same-meaning' },
    { id: 'group-b', sourceLanguage: 'el', sourceText: 'Ο Αλέξης προτιμά την ήσυχη λειτουργία.', goldSem, semanticGroup: 'same-meaning' },
  ];
  await assert.doesNotReject(() => BlindAgentEvaluationSession.create('run-groups-ok', equivalent, dir, { criticalNegativePairs: [] }));
  const different = { ...goldSem, clauses: [{ ...goldSem.clauses[0], roles: { ...goldSem.clauses[0]!.roles, theme: { type: 'concept', id: 'loud_mode' } } }] } as never;
  const divergentDir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-groups-bad', [
    { ...equivalent[0]!, goldSem }, { ...equivalent[1]!, goldSem: different },
  ], divergentDir), /gold group does not converge/u);
  const negativeDir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-negative-bad', [
    ...equivalent, { id: 'negative', sourceLanguage: 'en', sourceText: 'Alex prefers loud mode.', goldSem: different },
  ], negativeDir, { criticalNegativePairs: [{ pairId: 'n', leftItemId: 'group-a', rightItemId: 'group-b', criticalDimension: 'meaning', expectedRelationship: 'not_equivalent' }] }), /critical pair is not separated/u);
});

test('abstention is scored without exposing abstention gold metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-abstain', items, dir);
  await session.submit({ runId: 'run-abstain', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } });
  const result = await session.submit({ runId: 'run-abstain', itemId: 'blind-abstain', candidateSem: null, provenance: { extractorType: 'codex_agent' } });
  assert.equal(result.status, 'passed');
  assert.equal(result.abstained, true);
  assert.equal('expectedOutcome' in result, false);
  assert.equal(JSON.stringify(result).includes('unsupported'), false);
});
