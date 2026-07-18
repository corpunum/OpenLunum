# Llama.cpp-compatible Tokenizer Counting

This document describes the llama.cpp-compatible tokenizer counting for accurate token measurement with local models.

## Overview

The llama tokenizer counting provides:
- BPE tokenization approximation
- Special token handling (BOS, EOS, PAD, UNK)
- Accurate token counting for local models
- Configuration for custom models

## Tokenizer Configuration

### LlamaTokenizerConfig

```typescript
interface LlamaTokenizerConfig {
  /** Tokenizer model name */
  model?: string;
  /** Whether to add special tokens */
  addSpecialTokens?: boolean;
  /** Whether to add BOS token */
  addBos?: boolean;
  /** Whether to add EOS token */
  addEos?: boolean;
}
```

### Default Values

```typescript
{
  model: 'llama',
  addSpecialTokens: true,
  addBos: true,
  addEos: true
}
```

## Token Count Result

### TokenCountResult

```typescript
interface TokenCountResult {
  /** Token count */
  tokens: number;
  /** Actual token IDs if available */
  tokenIds?: number[];
  /** Errors during counting */
  errors?: string[];
}
```

## Usage Examples

### Basic Tokenization

```typescript
import { LlamaTokenizer } from '@corpunum/lunum';

const tokenizer = new LlamaTokenizer();

// Count tokens
const result = tokenizer.countTokens('Hello world');
console.log('Tokens:', result.tokens);
console.log('Token IDs:', result.tokenIds);
```

### Custom Configuration

```typescript
const tokenizer = new LlamaTokenizer({
  model: 'llama3',
  addBos: true,
  addEos: true
});

const result = tokenizer.countTokens('Text to count');
console.log('Tokens:', result.tokens);
```

### Get Vocabulary Size

```typescript
const vocabSize = tokenizer.getVocabSize();
console.log('Vocabulary size:', vocabSize);
```

## Special Tokens

The tokenizer supports the following special tokens:

| Token | ID | Description |
|-------|-----|-------------|
| `<bos>` | 0 | Beginning of sequence |
| `<eos>` | 1 | End of sequence |
| `<pad>` | 2 | Padding |
| `<unk>` | 3 | Unknown |

## Integration with Local Models

### Using with llama.cpp

```typescript
import { LlamaTokenizer } from '@corpunum/lunum';

const tokenizer = new LlamaTokenizer({
  model: 'llama3'
});

// Count tokens for prompt
const prompt = 'Your prompt here';
const result = tokenizer.countTokens(prompt);

// Use with llama.cpp
console.log('Tokens:', result.tokens);
```

## Best Practices

### 1. Enable Special Tokens
```typescript
const tokenizer = new LlamaTokenizer({
  addBos: true,
  addEos: true
});
```

### 2. Monitor Token Counts
```typescript
const result = tokenizer.countTokens(text);
if (result.tokens > 4096) {
  console.warn('Token count exceeds limit');
}
```

### 3. Handle Errors
```typescript
const result = tokenizer.countTokens(text);
if (result.errors && result.errors.length > 0) {
  console.warn('Tokenization errors:', result.errors);
}
```

## Limitations

- Simplified BPE approximation
- No actual model file required
- Token IDs are hashed, not from real vocabulary

## Future Enhancements

### Planned Features
- Real model file integration
- Full BPE implementation
- Custom vocabulary support
- Performance optimization

### Integrations
- llama.cpp binding
- Model loading
- Vocabulary loading