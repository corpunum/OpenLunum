import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticFingerprint } from '../src/fingerprint.js';
import { submitCandidate, getExtractionContract } from '../src/agent-native.js';
import { SEMANTIC_PROTOCOL_VERSION } from '../src/semantic-registry.js';
import { SEMANTIC_FRAME_REGISTRY_VERSION } from '../src/frame-registry.js';
import type { LunumSem } from '../src/types.js';

// decisions/0022: inclusive comparisons at_most / at_least (protocol 0.5, frames 0.6).
const provenance = { extractorType: 'agent' as const };
const bound = (predicate: string | null): LunumSem => ({
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
  clauses: [{
    predicate: 'allow',
    roles: { agent: { type: 'actor', id: 'director' }, recipient: { type: 'actor', id: 'nikos' }, action: 'approve', theme: { type: 'document', id: 'expenses' } } as never,
    ...(predicate ? { conditions: [{ predicate, roles: { subject: { type: 'document', id: 'expenses' }, value: { type: 'quantity', value: 2000, unit: 'eur' } } as never }] } : {})
  }],
});
const G02 = 'Ο διευθυντής επιτρέπει στον Νίκο να εγκρίνει δαπάνες έως 2.000 ευρώ.';

test('versions', () => {
  assert.equal(SEMANTIC_PROTOCOL_VERSION, 'lunum-protocol/0.5');
  assert.equal(SEMANTIC_FRAME_REGISTRY_VERSION, 'lunum-frame/0.7');
  assert.equal(getExtractionContract().contractVersion, 'lunum-agent/0.18');
  assert.match(getExtractionContract().frameFirst.framePromptBlock, /at_most\(subject, value/u);
});

test('golden lfp:2.1 vectors: at_most and at_least differ from below and above', () => {
  const ids = Object.fromEntries(['below', 'at_most', 'above', 'at_least'].map((p) => [p, semanticFingerprint(bound(p))]));
  assert.equal(ids.at_most, 'lfp:2.1:sha256:feeb215ffb2ca7c4876694c099cfd3b5');
  assert.equal(ids.at_least, 'lfp:2.1:sha256:4890e4e33c50a4c08c297f26e8f54be4');
  assert.equal(new Set(Object.values(ids)).size, 4);
});

test('g02 with an at_most condition receives identity; without it, refused', () => {
  const withBound = submitCandidate({ sourceText: G02, sourceLanguage: 'el', candidateSem: bound('at_most'), provenance });
  assert.equal(withBound.candidateIdentityAvailable, true);
  assert.match(String(withBound.semanticFingerprint), /^lfp:2\.1:/u);
  const without = submitCandidate({ sourceText: G02, sourceLanguage: 'el', candidateSem: bound(null), provenance });
  assert.equal(without.candidateIdentityAvailable, false);
});

test('the frame requires subject and value', () => {
  const sem: LunumSem = JSON.parse(JSON.stringify(bound('at_most')).replace('"subject":{"type":"document","id":"expenses"},', ''));
  assert.ok(!JSON.stringify(sem.clauses[0]?.conditions).includes('subject'));
  const r = submitCandidate({ sourceText: G02, sourceLanguage: 'el', candidateSem: sem, provenance });
  assert.equal(r.candidateIdentityAvailable, false);
});
