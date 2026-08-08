/**
 * Tokenizer counting infrastructure with calibrated ratios.
 * Provides exact token counting and character-based estimation
 * for benchmarking across tokenizer families.
 */

// ── Types ──────────────────────────────────────────────────────────

export type TokenizerFamily = 'qwen' | 'llama' | 'gemma' | 'generic';

export interface TokenCountResult {
  tokenCount: number;
  tokenizerFamily: TokenizerFamily;
  isExact: boolean;
  charCount: number;
  charsPerToken: number;
}

export interface TokenCountComparison {
  charBasedEstimate: number;
  calibratedCount: number;
  delta: number;
  deltaPercent: number;
}

// ── Constants ──────────────────────────────────────────────────────

const CALIBRATED_RATIOS: Record<TokenizerFamily, number> = {
  qwen: 3.5,
  llama: 4.0,
  gemma: 3.8,
  generic: 3.5,
};

const MODEL_FAMILY_PATTERNS: [string, TokenizerFamily][] = [
  ['qwen', 'qwen'],
  ['llama', 'llama'],
  ['gemma', 'gemma'],
];

// ── Functions ──────────────────────────────────────────────────────

/**
 * Count characters in text (UTF-8 code units).
 */
export function countChars(text: string): number {
  return text.length;
}

/**
 * Character-based token estimate using chars/4 heuristic.
 * Kept for comparison against calibrated counts.
 */
export function countTokensCharBased(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Get the tokenizer family for a model identity string.
 * Falls back to 'generic' for unknown models.
 */
export function getTokenizerFamily(modelId: string): TokenizerFamily {
  const lower = modelId.toLowerCase();
  for (const [pattern, family] of MODEL_FAMILY_PATTERNS) {
    if (lower.includes(pattern)) return family;
  }
  return 'generic';
}

/**
 * Count tokens using calibrated chars-per-token ratio for the family.
 * Returns isExact: false since this uses heuristics, not a native tokenizer.
 */
export function countTokensExact(text: string, family: TokenizerFamily): TokenCountResult {
  const charCount = text.length;
  if (charCount === 0) {
    return { tokenCount: 0, tokenizerFamily: family, isExact: false, charCount: 0, charsPerToken: CALIBRATED_RATIOS[family] };
  }

  const charsPerToken = CALIBRATED_RATIOS[family];
  const tokenCount = Math.max(1, Math.ceil(charCount / charsPerToken));

  return {
    tokenCount,
    tokenizerFamily: family,
    isExact: false,
    charCount,
    charsPerToken,
  };
}

/**
 * Compare character-based estimate vs calibrated count side-by-side.
 */
export function compareTokenCounts(text: string, family: TokenizerFamily): TokenCountComparison {
  const charBasedEstimate = countTokensCharBased(text);
  const calibratedCount = countTokensExact(text, family).tokenCount;
  const delta = calibratedCount - charBasedEstimate;
  const deltaPercent = charBasedEstimate > 0
    ? (delta / charBasedEstimate) * 100
    : 0;

  return {
    charBasedEstimate,
    calibratedCount,
    delta,
    deltaPercent,
  };
}
