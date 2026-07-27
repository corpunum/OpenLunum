import test from 'node:test';
import assert from 'node:assert/strict';
import { roughTokenCount, ROUGH_TOKEN_COUNTER, createTokenCounter, type TokenCounter } from '../src/derive.js';
import { compileContext } from '../src/context.js';

test('roughTokenCount: ceil(length / 4), min 1', () => {
  assert.equal(roughTokenCount(''), 1);
  assert.equal(roughTokenCount('abcd'), 1);
  assert.equal(roughTokenCount('abcde'), 2);
  assert.equal(roughTokenCount('a'.repeat(100)), 25);
});

test('ROUGH_TOKEN_COUNTER: same as roughTokenCount', () => {
  assert.equal(ROUGH_TOKEN_COUNTER('hello world'), roughTokenCount('hello world'));
});

test('createTokenCounter: wraps encode returning array', () => {
  const counter = createTokenCounter((text: string) => text.split(' '));
  assert.equal(counter('hello world'), 2);
  assert.equal(counter('one two three four'), 4);
});

test('createTokenCounter: wraps encode returning object with length', () => {
  const counter = createTokenCounter((text: string) => ({ length: text.split(' ').length }));
  assert.equal(counter('hello world'), 2);
});

test('compileContext: defaults to estimate/char4 without tokenCounter', () => {
  const result = compileContext([{ role: 'user', content: 'hello world' }]);
  assert.equal(result.tokenCounter, 'estimate/char4');
  assert.equal(result.naturalTokens, roughTokenCount('hello world'));
});

test('compileContext: uses provided tokenCounter and labels as exact', () => {
  const mockCounter: TokenCounter = (text: string) => text.split(' ').length;
  const result = compileContext(
    [{ role: 'user', content: 'hello world test' }],
    { tokenCounter: mockCounter }
  );
  assert.equal(result.tokenCounter, 'exact');
  assert.equal(result.naturalTokens, 3);
});

test('compileContext: exact counter changes savings calculation', () => {
  const short = 'hi';
  const long = 'this is a much longer natural language message';
  const mockCounter: TokenCounter = (text: string) => text.split(' ').length;
  const result = compileContext(
    [{
      role: 'user',
      content: long,
      lunumCode: short,
      lunumMeta: { eligible: true }
    }],
    { mode: 'mixed', tokenCounter: mockCounter }
  );
  assert.equal(result.naturalTokens, long.split(' ').length);
  assert.equal(result.mixedTokens, short.split(' ').length);
  assert.ok(result.estimatedSavings > 0);
});

test('createTokenCounter: falls back to rough count for unexpected return', () => {
  const counter = createTokenCounter(() => ({ notLength: 5 }) as never);
  assert.equal(counter('abcdefgh'), roughTokenCount('abcdefgh'));
});
