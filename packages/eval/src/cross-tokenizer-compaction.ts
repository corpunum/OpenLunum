/**
 * Cross-Tokenizer Compaction Benchmarks (R7.8)
 *
 * Estimates token counts and compression ratios across different
 * tokenizer/model families (qwen, llama, gemma, generic) using
 * bytes-per-token heuristics. No external tokenizer dependencies.
 */

// ── Types ──────────────────────────────────────────────────────────

export type TokenizerFamily = 'qwen' | 'llama' | 'gemma' | 'generic';

export interface TokenizerProfile {
  family: TokenizerFamily;
  name: string;
  bytesPerToken: number;
  vocabSize: number;
}

export interface CrossTokenizerResult {
  profile: TokenizerProfile;
  naturalTokens: number;
  lunumTokens: number;
  compressionRatio: number;
  savingsPercent: number;
}

export interface CrossTokenizerReport {
  timestamp: string;
  results: CrossTokenizerResult[];
  bestFamily: TokenizerFamily;
  worstFamily: TokenizerFamily;
  meanSavingsPercent: number;
}

export interface ProfileVersionEntry {
  family: TokenizerFamily;
  profileName: string;
  version: string;
  bytesPerToken: number;
  validatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────

export const TOKENIZER_PROFILES: TokenizerProfile[] = [
  { family: 'qwen', name: 'Qwen (ChatML)', bytesPerToken: 3.4, vocabSize: 152064 },
  { family: 'llama', name: 'Llama 3', bytesPerToken: 3.5, vocabSize: 128256 },
  { family: 'gemma', name: 'Gemma 2', bytesPerToken: 3.6, vocabSize: 256000 },
  { family: 'generic', name: 'Generic BPE', bytesPerToken: 3.5, vocabSize: 32000 },
];

export const PROFILE_VERSIONS: ProfileVersionEntry[] = TOKENIZER_PROFILES.map(p => ({
  family: p.family,
  profileName: p.name,
  version: '1.0',
  bytesPerToken: p.bytesPerToken,
  validatedAt: '2026-07-30T00:00:00Z',
}));

// ── Functions ──────────────────────────────────────────────────────

/**
 * Estimate token count for a text using a tokenizer profile's
 * bytes-per-token ratio.
 */
export function estimateTokenCount(text: string, profile: TokenizerProfile): number {
  if (text.length === 0) return 0;
  const byteLen = Buffer.byteLength(text, 'utf8');
  return Math.ceil(byteLen / profile.bytesPerToken);
}

/**
 * Compare compression across all tokenizer profiles.
 * Returns a report with per-profile results, best/worst family,
 * and mean savings.
 */
export function compareCrossTokenizer(
  naturalText: string,
  lunumText: string,
  profiles?: TokenizerProfile[],
): CrossTokenizerReport {
  const activeProfiles = profiles ?? TOKENIZER_PROFILES;

  const results: CrossTokenizerResult[] = activeProfiles.map(profile => {
    const naturalTokens = estimateTokenCount(naturalText, profile);
    const lunumTokens = estimateTokenCount(lunumText, profile);
    const compressionRatio = naturalTokens > 0 ? lunumTokens / naturalTokens : 1;
    const savingsPercent = naturalTokens > 0
      ? ((naturalTokens - lunumTokens) / naturalTokens) * 100
      : 0;

    return { profile, naturalTokens, lunumTokens, compressionRatio, savingsPercent };
  });

  const meanSavingsPercent = results.length > 0
    ? results.reduce((sum, r) => sum + r.savingsPercent, 0) / results.length
    : 0;

  // Best = highest savings, worst = lowest savings
  const sorted = [...results].sort((a, b) => b.savingsPercent - a.savingsPercent);
  const bestFamily = sorted[0]?.profile.family ?? 'generic';
  const worstFamily = sorted[sorted.length - 1]?.profile.family ?? 'generic';

  return {
    timestamp: new Date().toISOString(),
    results,
    bestFamily,
    worstFamily,
    meanSavingsPercent,
  };
}
