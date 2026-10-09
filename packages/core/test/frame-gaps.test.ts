import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticFingerprint } from '../src/fingerprint.js';
import { submitCandidate, getExtractionContract } from '../src/agent-native.js';
import { SEMANTIC_FRAME_REGISTRY_VERSION, validateSemFrames } from '../src/frame-registry.js';
import type { LunumSem } from '../src/types.js';

// decisions/0023: imperative deploy/rotate need no agent; deploy takes a theme;
// restart carries a count (frames 0.7, contract 0.18). experiments/frame-gaps-v1.
const provenance = { extractorType: 'agent' as const };
const sem = (kind: string, clause: Record<string, unknown>): LunumSem => ({
  schema: 'lunum-sem/0.1-draft', world: 'real', kind, clauses: [clause as never],
} as LunumSem);
const submit = (sourceText: string, sourceLanguage: string, candidateSem: LunumSem) =>
  submitCandidate({ sourceText, sourceLanguage, candidateSem, provenance });

const R1 = 'Deploy the billing patch by Friday.';
const R2 = 'Rotate the database credentials tomorrow.';
const R6 = 'Επανεκκίνησε τον διακομιστή S-12 δύο φορές.';
const r1 = (time: unknown = { type: 'weekday', value: 'Friday' }) => sem('command', {
  predicate: 'deploy', roles: { theme: { type: 'release', value: 'billing patch' } }, ...(time ? { time } : {}),
});
const r2 = () => sem('command', {
  predicate: 'rotate', roles: { theme: { type: 'credential', value: 'database credentials' } }, time: { type: 'date', value: 'tomorrow' },
});
const r6 = (count = true) => sem('command', {
  predicate: 'restart', roles: { theme: { type: 'system', id: 'S-12' }, ...(count ? { count: { type: 'quantity', value: 2 } } : {}) },
});

test('versions', () => {
  assert.equal(SEMANTIC_FRAME_REGISTRY_VERSION, 'lunum-frame/0.7');
  const contract = getExtractionContract();
  assert.equal(contract.contractVersion, 'lunum-agent/0.18');
  assert.match(contract.frameFirst.framePromptBlock, /^deploy\(no required roles; optional: agent, theme, destination; at least one of: theme\|destination/mu);
  assert.match(contract.frameFirst.framePromptBlock, /^rotate\(theme; optional: agent/mu);
  assert.match(contract.frameFirst.framePromptBlock, /^restart\(theme; optional: agent, count;.*count: quantity/mu);
});

test('r1 imperative deploy with a theme and Friday receives identity; without Friday, refused', () => {
  const ok = submit(R1, 'en', r1());
  assert.equal(ok.candidateIdentityAvailable, true, JSON.stringify(ok));
  assert.match(String(ok.semanticFingerprint), /^lfp:2\.1:/u);
  assert.equal(submit(R1, 'en', r1(null)).candidateIdentityAvailable, false);
});

test('r2 imperative rotate receives identity', () => {
  const ok = submit(R2, 'en', r2());
  assert.equal(ok.candidateIdentityAvailable, true, JSON.stringify(ok));
});

test('r6 restart with count 2 receives identity; without the count, refused', () => {
  const ok = submit(R6, 'el', r6());
  assert.equal(ok.candidateIdentityAvailable, true, JSON.stringify(ok));
  assert.equal(submit(R6, 'el', r6(false)).candidateIdentityAvailable, false);
});

test('deploy with neither theme nor destination fails the frame', () => {
  const bare = sem('command', { predicate: 'deploy', roles: { agent: { type: 'actor', id: 'ops' } } });
  const result = validateSemFrames(bare);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === 'missing_required_role'));
  assert.equal(submit('Ops deploys.', 'en', bare).candidateIdentityAvailable, false);
});

test('the old two-role deploy shape still validates unchanged', () => {
  const old = sem('event', { predicate: 'deploy', roles: { agent: { type: 'actor', id: 'ops' }, destination: { type: 'environment', id: 'staging' } } });
  assert.equal(validateSemFrames(old).valid, true);
  // Golden computed with the frames 0.5 build (lunum-mcp 6407564): unchanged.
  assert.equal(semanticFingerprint(old), 'lfp:2.1:sha256:f81526396304fc4433ae8b29ed3d00e2');
});

test('golden lfp:2.1 vectors for the new shapes; restart count changes identity', () => {
  const ids = { r1: semanticFingerprint(r1()), r2: semanticFingerprint(r2()), r6: semanticFingerprint(r6()), r6bare: semanticFingerprint(r6(false)) };
  assert.equal(new Set(Object.values(ids)).size, 4);
  assert.deepEqual(ids, GOLDEN);
});

const GOLDEN = {
  r1: 'lfp:2.1:sha256:3b23197acd72300bde21593e38303cfd',
  r2: 'lfp:2.1:sha256:7263c8c379ed6c04a8f0c2f6d9cfabf3',
  r6: 'lfp:2.1:sha256:5b28c0526bc42cfa43afb5e802cc5976',
  r6bare: 'lfp:2.1:sha256:9396eb57a9aef79c9bf929b1cb7b00c3',
};
