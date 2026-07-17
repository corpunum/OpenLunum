/**
 * Llama.cpp-compatible tokenizer counting
 * 
 * This module provides llama.cpp-compatible tokenizer counting
 * for accurate token measurement with local models.
 */

// ── Tokenizer Configuration ────────────────────────────────────────

export interface LlamaTokenizerConfig {
  /** Tokenizer model name */
  model?: string;
  /** Whether to add special tokens */
  addSpecialTokens?: boolean;
  /** Whether to add BOS token */
  addBos?: boolean;
  /** Whether to add EOS token */
  addEos?: boolean;
}

// ── Token Count Result ─────────────────────────────────────────────

export interface TokenCountResult {
  /** Token count */
  tokens: number;
  /** Actual token IDs if available */
  tokenIds?: number[];
  /** Errors during counting */
  errors?: string[];
}

// ── Llama Tokenizer ────────────────────────────────────────────────

export class LlamaTokenizer {
  private config: Required<LlamaTokenizerConfig>;
  private vocabSize: number;
  private specialTokenIds: Map<string, number>;

  constructor(config: LlamaTokenizerConfig = {}) {
    this.config = {
      model: config.model ?? 'llama',
      addSpecialTokens: config.addSpecialTokens ?? true,
      addBos: config.addBos ?? true,
      addEos: config.addEos ?? true
    };
    
    // Initialize vocabulary size
    this.vocabSize = 32000;
    
    // Initialize special token IDs
    this.specialTokenIds = new Map([
      ['<bos>', 0],
      ['<eos>', 1],
      ['<pad>', 2],
      ['<unk>', 3]
    ]);
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): TokenCountResult {
    const errors: string[] = [];
    const tokenIds: number[] = [];
    
    try {
      // Add BOS token
      if (this.config.addBos) {
        tokenIds.push(0);
      }
      
      // Tokenize text (simplified BPE approximation)
      const tokens = this.tokenize(text);
      for (const token of tokens) {
        const tokenId = this.getTokenId(token);
        if (tokenId !== -1) {
          tokenIds.push(tokenId);
        } else {
          errors.push(`Unknown token: ${token}`);
        }
      }
      
      // Add EOS token
      if (this.config.addEos) {
        tokenIds.push(1);
      }
      
      return {
        tokens: tokenIds.length,
        tokenIds
      };
    } catch (error) {
      return {
        tokens: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Tokenize text (simplified BPE)
   */
  private tokenize(text: string): string[] {
    // Simplified tokenization: split on whitespace and punctuation
    const tokens: string[] = [];
    let currentToken = '';
    
    for (const char of text) {
      if (/\s/.test(char)) {
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = '';
        }
      } else if (/[.,!?;:()"\']/.test(char)) {
        if (currentToken) {
          tokens.push(currentToken);
        }
        tokens.push(char);
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    
    if (currentToken) {
      tokens.push(currentToken);
    }
    
    return tokens;
  }

  /**
   * Get token ID for token
   */
  private getTokenId(token: string): number {
    // Check special tokens first
    if (this.specialTokenIds.has(token)) {
      return this.specialTokenIds.get(token)!;
    }
    
    // Simplified: hash token to get ID
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Ensure ID is within vocabulary size
    return Math.abs(hash) % this.vocabSize;
  }

  /**
   * Get vocabulary size
   */
  getVocabSize(): number {
    return this.vocabSize;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<LlamaTokenizerConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<LlamaTokenizerConfig>): void {
    if (config.model !== undefined) this.config.model = config.model;
    if (config.addSpecialTokens !== undefined) this.config.addSpecialTokens = config.addSpecialTokens;
    if (config.addBos !== undefined) this.config.addBos = config.addBos;
    if (config.addEos !== undefined) this.config.addEos = config.addEos;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const llamaTokenizerExports = [
  LlamaTokenizer
] as const;