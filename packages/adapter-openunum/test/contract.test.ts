import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLunumShadowContext, deriveLunumSidecar } from '../src/index.js';

test('OpenUnum compatibility adapter preserves expected sidecar keys', () => {
  const value = deriveLunumSidecar({ role: 'assistant', content: 'The API failed after deployment.' });
  assert.deepEqual(Object.keys(value).sort(), ['lunumCode', 'lunumFp', 'lunumMeta', 'lunumSem']);
});

test('OpenUnum shadow compiler preserves expected metrics', () => {
  const value = compileLunumShadowContext([{ role: 'user', content: 'A natural message', lunumCode: 'R natural message', lunumMeta: { eligible: true } }]);
  for (const key of ['naturalMessages', 'mixedMessages', 'naturalTokens', 'mixedTokens', 'ratio', 'estimatedSavings']) assert.ok(key in value);
});
