import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { fingerprintSem } from './fingerprint.js';
import { ProfileGenerator } from './profiles.js';
import type { ProfileType } from './profiles.js';
import type { AtlasEntry, ProfileKey } from './token-atlas.js';
import type { LunumRecord } from './types.js';

export interface VerifiedProfileCandidate {
  profile: ProfileType;
  tokenCount: number;
  canonicalMatch: boolean;
  fingerprintMatch: boolean;
  semanticsPreserved: boolean;
  optimizedFingerprint: string;
  record: LunumRecord;
  warnings: string[];
}

export interface VerifiedModelOptimizationResult {
  modelName: string;
  attachedFingerprint: string;
  originalFingerprint: string;
  selectedProfile: ProfileType | null;
  optimizedFingerprint: string | null;
  optimizedRecord: LunumRecord | null;
  semanticsPreserved: boolean;
  profileTokens: Record<ProfileKey, number>;
  bestTokenCount: number | null;
  reductionPct: number | null;
  candidates: VerifiedProfileCandidate[];
  warnings: string[];
}

export interface VerifiedTokenizerOptimizationPassResult {
  models: string[];
  results: VerifiedModelOptimizationResult[];
  recordCount: number;
  allSemanticsPreserved: boolean;
  warnings: string[];
}

function reductionPercentage(natural: number, optimized: number): number {
  if (natural <= 0) return 0;
  return Math.round((1 - optimized / natural) * 10000) / 100;
}

function candidateFor(
  generator: ProfileGenerator,
  entry: AtlasEntry,
  profile: ProfileType,
  tokenCount: number,
  originalCanonical: string,
  originalFingerprint: string,
): VerifiedProfileCandidate {
  const profileResult = generator.profile(entry.record, profile);
  const record = profileResult.record;
  const optimizedCanonical = stableStringify(canonicalizeSem(record.sem));
  const optimizedFingerprint = fingerprintSem(record.sem);
  const canonicalMatch = optimizedCanonical === originalCanonical;
  const fingerprintMatch = optimizedFingerprint === originalFingerprint;

  return {
    profile,
    tokenCount,
    canonicalMatch,
    fingerprintMatch,
    semanticsPreserved: canonicalMatch && fingerprintMatch,
    optimizedFingerprint,
    record,
    warnings: [...(profileResult.warnings ?? [])],
  };
}

/**
 * Select the lowest-token profile that independently proves semantic
 * preservation. Attached fingerprints are treated as untrusted metadata:
 * both the source and profiled fingerprints are recomputed from semantic
 * content, and canonical semantic forms must also match.
 */
export function runVerifiedTokenizerOptimizationPass(
  entries: AtlasEntry[],
  options: { profileGenerator?: ProfileGenerator } = {},
): VerifiedTokenizerOptimizationPassResult {
  const generator = options.profileGenerator ?? new ProfileGenerator();
  const results: VerifiedModelOptimizationResult[] = [];
  const passWarnings: string[] = [];

  for (const entry of entries) {
    const originalCanonical = stableStringify(canonicalizeSem(entry.record.sem));
    const originalFingerprint = fingerprintSem(entry.record.sem);
    const modelNames = Object.keys(entry.measurements).sort();

    if (modelNames.length === 0) {
      passWarnings.push(`No model measurements for ${entry.fingerprint.slice(0, 24)}`);
      continue;
    }

    for (const modelName of modelNames) {
      const measures = entry.measurements[modelName]!;
      const profileTokens: Record<ProfileKey, number> = {
        natural: measures.natural.tokenCount,
        safe: measures.safe.tokenCount,
        short: measures.short.tokenCount,
        tight: measures.tight.tokenCount,
      };

      const candidates = (['safe', 'short', 'tight'] as const)
        .map((profile) => candidateFor(
          generator,
          entry,
          profile,
          profileTokens[profile],
          originalCanonical,
          originalFingerprint,
        ))
        .sort((left, right) => left.tokenCount - right.tokenCount || left.profile.localeCompare(right.profile));

      const selected = candidates.find((candidate) => candidate.semanticsPreserved) ?? null;
      const warnings = candidates
        .filter((candidate) => !candidate.semanticsPreserved)
        .map((candidate) => `${candidate.profile} rejected: canonicalMatch=${candidate.canonicalMatch}, fingerprintMatch=${candidate.fingerprintMatch}`);

      if (!selected) {
        const warning = `Model ${modelName}: no measured profile preserved semantics for ${entry.fingerprint.slice(0, 24)}`;
        warnings.push(warning);
        passWarnings.push(warning);
      }

      results.push({
        modelName,
        attachedFingerprint: entry.fingerprint,
        originalFingerprint,
        selectedProfile: selected?.profile ?? null,
        optimizedFingerprint: selected?.optimizedFingerprint ?? null,
        optimizedRecord: selected?.record ?? null,
        semanticsPreserved: selected !== null,
        profileTokens,
        bestTokenCount: selected?.tokenCount ?? null,
        reductionPct: selected ? reductionPercentage(profileTokens.natural, selected.tokenCount) : null,
        candidates,
        warnings,
      });
    }
  }

  return {
    models: [...new Set(results.map((result) => result.modelName))],
    results,
    recordCount: entries.length,
    allSemanticsPreserved: results.every((result) => result.semanticsPreserved),
    warnings: passWarnings,
  };
}
