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

test('submission scores privately, persists immediately, and resumes without duplication', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-resume', items, dir);
  const first = await session.submit({ runId: 'run-resume', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent', extractorId: 'test' } });
  assert.equal(first.semanticIdentityExact, true);
  assert.equal('goldSem' in first, false);
  assert.equal('goldIdentity' in first, false);
  const ledger = await readFile(path.join(dir, 'agent-results.jsonl'), 'utf8');
  assert.equal(ledger.split('\n').filter(Boolean).length, 1);
  const resumed = await BlindAgentEvaluationSession.create('run-resume', items, dir);
  assert.equal(resumed.completedCount(), 1);
  assert.equal(resumed.next()?.itemId, 'blind-abstain');
  await assert.rejects(() => resumed.submit({ runId: 'run-resume', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } }), /already completed/u);
});

test('malformed ledger and mismatched checkpoint fail closed', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  await writeFile(path.join(dir, 'agent-results.jsonl'), '{truncated\n');
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-corrupt', items, dir), /Malformed JSONL ledger/u);
});

test('gold preflight rejects an identity-unavailable parse item', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const invalidGold = { ...goldSem, clauses: [{ ...goldSem.clauses[0], predicate: 'unframed_controlled_predicate' }] } as never;
  await assert.rejects(() => BlindAgentEvaluationSession.create('run-gold-invalid', [{
    id: 'invalid', sourceLanguage: 'en', sourceText: 'invalid gold', goldSem: invalidGold,
  }], dir), /gold preflight failed/u);
});

test('abstention is scored without exposing abstention gold metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'openlunum-blind-'));
  const session = await BlindAgentEvaluationSession.create('run-abstain', items, dir);
  await session.submit({ runId: 'run-abstain', itemId: 'blind-1', candidateSem: goldSem, provenance: { extractorType: 'codex_agent' } });
  const result = await session.submit({ runId: 'run-abstain', itemId: 'blind-abstain', candidateSem: null, provenance: { extractorType: 'codex_agent' } });
  assert.equal(result.status, 'passed');
  assert.equal(result.expectedOutcome, 'abstain');
  assert.equal(JSON.stringify(result).includes('unsupported'), false);
});
