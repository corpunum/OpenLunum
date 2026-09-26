import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticFingerprint } from '../src/fingerprint.js';
import { submitCandidate } from '../src/agent-native.js';
import type { LunumSem } from '../src/types.js';

// Golden lfp:2.1 identities for the allow/prohibit `action` role (decisions/0008).
// These pin the new form; existing identities were verified unchanged by
// fingerprinting every Sem in the repository before and after the change.
const allow = (roles: Record<string, unknown>): LunumSem => ({
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
  clauses: [{ predicate: 'allow', roles: { agent: { type: 'actor', id: 'Lena' }, recipient: { type: 'actor', id: 'Tomas' }, ...roles } as never }],
});

test('golden lfp:2.1 vectors for allow with action', () => {
  assert.equal(semanticFingerprint(allow({ action: 'update' })), 'lfp:2.1:sha256:5839e1d7503b331a9d230c76b5318db3');
  assert.equal(semanticFingerprint(allow({ action: 'update', theme: { type: 'document', id: 'P-3' } })), 'lfp:2.1:sha256:cb4cebeb83c162a3cb3dd68dde7480dd');
  assert.equal(semanticFingerprint(allow({ theme: { type: 'document', id: 'P-3' } })), 'lfp:2.1:sha256:b473455f83885f1e1de92e47e687468c');
});

test('action, theme and action+theme are distinct identities', () => {
  const ids = new Set([allow({ action: 'update' }), allow({ theme: { type: 'document', id: 'P-3' } }), allow({ action: 'update', theme: { type: 'document', id: 'P-3' } })].map((sem) => semanticFingerprint(sem)));
  assert.equal(ids.size, 3);
});

test('English and Greek sources that select the same action converge', () => {
  const provenance = { extractorType: 'agent' as const };
  const en = submitCandidate({ sourceText: 'Lena allows Tomas to edit.', sourceLanguage: 'en', candidateSem: allow({ action: 'update' }), provenance });
  const el = submitCandidate({ sourceText: 'Η Lena επιτρέπει στον Tomas να επεξεργαστεί.', sourceLanguage: 'el', candidateSem: allow({ action: 'update' }), provenance });
  assert.equal(en.candidateIdentityAvailable, true);
  assert.equal(en.semanticFingerprint, el.semanticFingerprint);
  assert.notEqual(en.source.sha256, el.source.sha256);
});
