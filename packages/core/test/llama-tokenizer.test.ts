import { test } from 'node:test';
import assert from 'node:assert';
import { LlamaTokenizer } from '../src/llama-tokenizer.js';

test('LlamaTokenizer counts tokens', () => {
  const tokenizer = new LlamaTokenizer();
  
  const result = tokenizer.countTokens('Hello world');
  
  assert.ok(result.tokens > 0);
  assert.ok(result.tokenIds);
  assert.ok(result.tokenIds!.length > 0);
});

test('LlamaTokenizer adds BOS token', () => {
  const tokenizer = new LlamaTokenizer({ addBos: true });
  
  const result = tokenizer.countTokens('Hello');
  
  assert.ok(result.tokenIds);
  assert.strictEqual(result.tokenIds![0], 0);
});

test('LlamaTokenizer adds EOS token', () => {
  const tokenizer = new LlamaTokenizer({ addEos: true });
  
  const result = tokenizer.countTokens('Hello');
  
  assert.ok(result.tokenIds);
  assert.strictEqual(result.tokenIds![result.tokenIds!.length - 1], 1);
});

test('LlamaTokenizer skips special tokens when disabled', () => {
  const tokenizer = new LlamaTokenizer({
    addBos: false,
    addEos: false
  });
  
  const result = tokenizer.countTokens('Hello');
  
  assert.ok(result.tokenIds);
  assert.strictEqual(result.tokenIds!.length, 1);
});

test('LlamaTokenizer gets vocabulary size', () => {
  const tokenizer = new LlamaTokenizer();
  
  const vocabSize = tokenizer.getVocabSize();
  
  assert.strictEqual(vocabSize, 32000);
});

test('LlamaTokenizer config can be updated', () => {
  const tokenizer = new LlamaTokenizer();
  
  tokenizer.setConfig({ addBos: false, addEos: false });
  
  const config = tokenizer.getConfig();
  assert.strictEqual(config.addBos, false);
  assert.strictEqual(config.addEos, false);
});