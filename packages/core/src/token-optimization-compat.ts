import { TokenAtlas } from './token-atlas.js';
import { runVerifiedTokenizerOptimizationPass } from './token-optimization.js';
import type {
  AtlasEntry,
  ModelOptimizationResult,
  ModelTokenizerProfile,
  TokenizerOptimizationPassResult
} from './token-atlas.js';

function inferredModelProfiles(entries: AtlasEntry[]): ModelTokenizerProfile[] {
  const modelNames = [...new Set(entries.flatMap((entry) => Object.keys(entry.measurements)))].sort();
  return modelNames.map((name) => ({
    name,
    tokenizer: entries.find((entry) => entry.tokenizerProfiles[name] !== undefined)?.tokenizerProfiles[name] ?? {}
  }));
}

/**
 * Backwards-compatible public entry point for tokenizer optimization.
 *
 * The historical implementation in token-atlas compared an attached
 * fingerprint to itself. The package root now exports this wrapper instead:
 * it delegates to the verified implementation, recomputes fingerprints,
 * compares canonical semantics, validates token measurements and tokenizer
 * identity, and selects only from candidates that preserve semantics.
 */
export function runTokenizerOptimizationPass(entries: AtlasEntry[]): TokenizerOptimizationPassResult {
  const verified = runVerifiedTokenizerOptimizationPass(entries, {
    modelProfiles: inferredModelProfiles(entries)
  });

  const results: ModelOptimizationResult[] = verified.results.map((result) => ({
    modelName: result.modelName,
    originalFingerprint: result.originalFingerprint,
    optimizedFingerprint: result.optimizedFingerprint ?? '',
    semanticsPreserved: result.semanticsPreserved,
    bestProfile: result.selectedProfile ?? 'safe',
    profileTokens: result.profileTokens,
    bestTokenCount: result.bestTokenCount ?? 0,
    reductionPct: result.reductionPct ?? 0,
    warnings: [...result.warnings]
  }));

  return {
    models: verified.models,
    results,
    recordCount: verified.recordCount,
    allSemanticsPreserved: verified.allSemanticsPreserved,
    warnings: [...verified.warnings]
  };
}

/** Backwards-compatible aggregate export containing only the verified path. */
export const tokenAtlasExports = [TokenAtlas, runTokenizerOptimizationPass] as const;
