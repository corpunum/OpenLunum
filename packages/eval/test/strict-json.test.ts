import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictJsonObject } from '../src/strict-json.js';

test('strict JSON accepts nested objects and arrays', () => {
  assert.deepEqual(parseStrictJsonObject('{"a":{"b":[1,true,null]}}'), { a: { b: [1, true, null] } });
});

test('strict JSON rejects duplicate keys at any object depth', () => {
  assert.throws(() => parseStrictJsonObject('{"a":1,"a":2}'), /Duplicate JSON object key: a/u);
  assert.throws(() => parseStrictJsonObject('{"a":{"x":1,"x":2}}'), /Duplicate JSON object key: x/u);
});
