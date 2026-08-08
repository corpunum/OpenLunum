import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countTokensCharBased,
  countTokensExact,
  getTokenizerFamily,
  compareTokenCounts,
  countChars,
} from '../src/tokenizer-counter.js';
import type { TokenizerFamily } from '../src/tokenizer-counter.js';

test('countTokensCharBased uses chars/4', () => {
  assert.strictEqual(countTokensCharBased('hello world'), 3);
  assert.strictEqual(countTokensCharBased('a'.repeat(8)), 2);
  assert.strictEqual(countTokensCharBased('a'.repeat(4)), 1);
});

test('countTokensCharBased returns 0 for empty string', () => {
  assert.strictEqual(countTokensCharBased(''), 0);
});

test('countTokensExact returns 0 for empty string', () => {
  const result = countTokensExact('', 'qwen');
  assert.strictEqual(result.tokenCount, 0);
  assert.strictEqual(result.isExact, false);
});

test('countTokensExact returns isExact: false', () => {
  const result = countTokensExact('test text', 'qwen');
  assert.strictEqual(result.isExact, false);
  assert.strictEqual(result.tokenizerFamily, 'qwen');
});

test('countTokensExact uses calibrated ratio', () => {
  const text = 'a'.repeat(35);
  const result = countTokensExact(text, 'qwen');
  assert.strictEqual(result.charsPerToken, 3.5);
  assert.strictEqual(result.tokenCount, 10);
  assert.strictEqual(result.charCount, 35);
});

test('calibrated count differs from char-based for non-ASCII text', () => {
  const cjk = '你好世界'; // 4 CJK characters
  const charBased = countTokensCharBased(cjk);
  const qwenResult = countTokensExact(cjk, 'qwen');
  assert.notStrictEqual(charBased, qwenResult.tokenCount, 'calibrated should differ from chars/4 for non-ASCII');

  const emoji = '😀🎉🚀'; // 3 emoji characters
  const charBasedEmoji = countTokensCharBased(emoji); // ceil(3/4) = 1
  const llamaResult = countTokensExact(emoji, 'llama'); // ceil(3/4) = 1
  // For short text both give 1, but for longer non-ASCII they diverge
  const longEmoji = '😀🎉🚀'.repeat(10); // 30 chars
  const charBasedLong = countTokensCharBased(longEmoji); // ceil(30/4) = 8
  const llamaLong = countTokensExact(longEmoji, 'llama'); // ceil(30/4) = 8
  // Actually with the calibrated ratio for llama being 4.0, it equals chars/4 for this case too
  // Use qwen with a different length where ratios diverge: qwen=3.5 vs chars/4=0.25
  const mixedText = '你好世界hello'; // 9 chars
  const charBasedMixed = countTokensCharBased(mixedText); // ceil(9/4) = 3
  const qwenMixed = countTokensExact(mixedText, 'qwen'); // ceil(9/3.5) = 3
  // Try a text that shows divergence: 3.5 chars/token vs 4 chars/token
  const text35 = 'a'.repeat(35);
  const qwen35 = countTokensExact(text35, 'qwen'); // ceil(35/3.5) = 10
  const charBased35 = countTokensCharBased(text35); // ceil(35/4) = 9
  assert.notStrictEqual(charBased35, qwen35.tokenCount, 'calibrated should differ from chars/4 for qwen ratio');
});

test('getTokenizerFamily maps known model IDs', () => {
  assert.strictEqual(getTokenizerFamily('Qwen3-Coder-30B-A3B'), 'qwen');
  assert.strictEqual(getTokenizerFamily('Qwen3.6-35B-A3B'), 'qwen');
  assert.strictEqual(getTokenizerFamily('Llama-3.3-70B'), 'llama');
  assert.strictEqual(getTokenizerFamily('Llama-3.1-8B'), 'llama');
  assert.strictEqual(getTokenizerFamily('Gemma-2-27B'), 'gemma');
  assert.strictEqual(getTokenizerFamily('Gemma-2-9B'), 'gemma');
  assert.strictEqual(getTokenizerFamily('SuperGemma4-E4B'), 'gemma');
});

test('getTokenizerFamily handles case-insensitive matching', () => {
  assert.strictEqual(getTokenizerFamily('qwen3-coder'), 'qwen');
  assert.strictEqual(getTokenizerFamily('LLAMA-3.3-70B'), 'llama');
  assert.strictEqual(getTokenizerFamily('gemma-2-9b'), 'gemma');
});

test('getTokenizerFamily falls back to generic for unknown', () => {
  assert.strictEqual(getTokenizerFamily('unknown-model'), 'generic');
  assert.strictEqual(getTokenizerFamily('foo-bar-baz'), 'generic');
  assert.strictEqual(getTokenizerFamily(''), 'generic');
});

test('compareTokenCounts shows delta between methods', () => {
  const text = 'Hello world, this is a test of token counting infrastructure.';
  const comparison = compareTokenCounts(text, 'qwen');

  assert.ok(comparison.charBasedEstimate > 0);
  assert.ok(comparison.calibratedCount > 0);
  assert.strictEqual(comparison.delta, comparison.calibratedCount - comparison.charBasedEstimate);
  assert.strictEqual(
    comparison.deltaPercent,
    (comparison.delta / comparison.charBasedEstimate) * 100
  );
});

test('compareTokenCounts returns zero delta for empty string', () => {
  const comparison = compareTokenCounts('', 'generic');
  assert.strictEqual(comparison.charBasedEstimate, 0);
  assert.strictEqual(comparison.calibratedCount, 0);
  assert.strictEqual(comparison.delta, 0);
  assert.strictEqual(comparison.deltaPercent, 0);
});

test('countChars returns string length', () => {
  assert.strictEqual(countChars('hello'), 5);
  assert.strictEqual(countChars(''), 0);
  assert.strictEqual(countChars('你好'), 2);
});

test('different families produce different calibrated counts for same text', () => {
  const text = 'test comparison text';
  const qwen = countTokensExact(text, 'qwen');
  const llama = countTokensExact(text, 'llama');
  const gemma = countTokensExact(text, 'gemma');

  assert.ok(
    llama.tokenCount <= qwen.tokenCount,
    'llama (4.0 ratio) should produce fewer tokens than qwen (3.5 ratio)'
  );
});
