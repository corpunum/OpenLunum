import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContext } from '../src/context.js';
import { submitCandidate } from '../src/agent-native.js';
import type { ContextMessage } from '../src/types.js';

// decisions/0012: natural text, deduplicated only by core-issued lfp:2.1 identity.
const send = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'send', roles: {
  agent: { type: 'actor', id: 'Ari' }, object: { type: 'document', id: 'P-41' }, recipient: { type: 'actor', id: 'C-41' } } }] };
const record = (text: string, language: string) => {
  const submission = submitCandidate({ sourceText: text, sourceLanguage: language, candidateSem: send, provenance: { extractorType: 'agent' } });
  return { content: text, record: submission.semanticFingerprint ? { semanticFingerprint: submission.semanticFingerprint } : {} };
};

test('identity_dedup keeps natural text and drops later messages with the same identity', () => {
  const messages: ContextMessage[] = [
    record('Ari sends document P-41 to courier C-41.', 'en'),
    record('Ο Ari στέλνει το έγγραφο P-41 στον ταχυμεταφορέα C-41.', 'el'),
    { content: 'Transfer 45 EUR from account Q-83.' },
    { content: 'Transfer 45 EUR from account Q-83.' },
  ];
  const result = compileContext(messages, { mode: 'identity_dedup' });
  assert.deepEqual(result.selectedMessages.map((message) => message.content), [
    'Ari sends document P-41 to courier C-41.',
    // Messages without a semantic identity are never merged, even if identical text.
    'Transfer 45 EUR from account Q-83.',
    'Transfer 45 EUR from account Q-83.',
  ]);
  assert.ok(result.identityDedupTokens < result.naturalTokens);
});

test('identity_dedup ignores non-semantic fingerprints', () => {
  const messages = [{ content: 'a', record: { semanticFingerprint: 'lfp:0.1:sha256:x' } }, { content: 'b', record: { semanticFingerprint: 'lfp:0.1:sha256:x' } }];
  assert.equal(compileContext(messages as never, { mode: 'identity_dedup' }).selectedMessages.length, 2);
});
