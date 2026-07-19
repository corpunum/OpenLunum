import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { fingerprintSem } from './fingerprint.js';
import { ProfileGenerator } from './profiles.js';
import type { ProfileType } from './profiles.js';
import type { AtlasEntry, ModelTokenizerProfile, ProfileKey } from './token-atlas.js';
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
  artifactId: string;
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

export interface VerifiedTightProfileSelection {
  recordFingerprint: string;
  selectedProfile: ProfileType;
  tokenCount: number;
  optimizedFingerprint: string;
  profileTokens: Record<ProfileKey, number>;
}

/**
 * Reproducible output of one model-specific optimization pass.  This is an
 * evidence artifact, rather than an assertion inferred from a model name: it
 * binds the selected renderer behavior to the tokenizer configuration and to
 * every record that was measured.
 */
export interface VerifiedModelSpecificTightProfileArtifact {
  schema: 'openlunum-model-specific-tight-profile/0.1';
  id: string;
  modelName: string;
  sourceRendererProfile: string;
  tokenizer: ModelTokenizerProfile['tokenizer'];
  expectedRecordCount: number;
  verifiedRecordCount: number;
  recordFingerprints: string[];
  selections: VerifiedTightProfileSelection[];
  valid: boolean;
  errors: string[];
}

export interface VerifiedTokenizerOptimizationPassResult {
  models: string[];
  results: VerifiedModelOptimizationResult[];
  artifacts: VerifiedModelSpecificTightProfileArtifact[];
  recordCount: number;
  allSemanticsPreserved: boolean;
  warnings: string[];
}

export interface VerifiedTokenizerOptimizationPassOptions {
  profileGenerator?: ProfileGenerator;
  /** Named tokenizer configurations that the generated artifacts bind to. */
  modelProfiles: ModelTokenizerProfile[];
  /** Renderer version from which candidates are derived. */
  sourceRendererProfile?: string;
}

function reductionPercentage(natural: number, optimized: number): number {
  if (natural <= 0) return 0;
  return Math.round((1 - optimized / natural) * 10000) / 100;
}

function artifactId(model: ModelTokenizerProfile, sourceRendererProfile: string): string {
  const encode = (value: string): string => encodeURIComponent(value).replaceAll('%', '_');
  return `tight/${encode(model.name)}/${encode(model.tokenizer.model ?? 'unspecified')}/${encode(sourceRendererProfile)}`;
}

function measurementErrors(entry: AtlasEntry, modelProfile: ModelTokenizerProfile): string[] {
  const modelName = modelProfile.name;
  const measures = entry.measurements[modelName];
  if (!measures) return [`Missing measurement for model ${modelName}`];

  const errors: string[] = [];
  const measuredTokenizer = entry.tokenizerProfiles[modelName];
  if (!measuredTokenizer) {
    errors.push(`${modelName}: missing tokenizer configuration for measurement`);
  } else if (stableStringify(measuredTokenizer) !== stableStringify(modelProfile.tokenizer)) {
    errors.push(`${modelName}: measured tokenizer configuration does not match artifact configuration`);
  }
  for (const profile of ['natural', 'safe', 'short', 'tight'] as const) {
    const measurement = measures[profile];
    if (measurement.profile !== profile) {
      errors.push(`${modelName}/${profile}: measurement is labelled ${measurement.profile}`);
    }
    if (!Number.isSafeInteger(measurement.tokenCount) || measurement.tokenCount <= 0) {
      errors.push(`${modelName}/${profile}: tokenCount must be a positive safe integer`);
    }
    for (const error of measurement.errors ?? []) {
      errors.push(`${modelName}/${profile}: ${error}`);
    }
  }
  return errors;
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
  options: VerifiedTokenizerOptimizationPassOptions,
): VerifiedTokenizerOptimizationPassResult {
  const generator = options.profileGenerator ?? new ProfileGenerator();
  const sourceRendererProfile = options.sourceRendererProfile ?? 'generic-en-pivot/0.1';
  const results: VerifiedModelOptimizationResult[] = [];
  const passWarnings: string[] = [];
  const artifacts: VerifiedModelSpecificTightProfileArtifact[] = [];
  const modelNames = options.modelProfiles.map((profile) => profile.name);
  const duplicateModels = modelNames.filter((name, index) => modelNames.indexOf(name) !== index);
  let hasUnconfiguredMeasurements = false;

  if (entries.length === 0) passWarnings.push('Optimization requires at least one measured record');
  if (modelNames.length === 0) passWarnings.push('Optimization requires at least one named model profile');
  if (duplicateModels.length > 0) {
    passWarnings.push(`Duplicate model profiles: ${[...new Set(duplicateModels)].join(', ')}`);
  }

  const configuredModels = new Set(modelNames);
  for (const entry of entries) {
    for (const measuredModel of Object.keys(entry.measurements)) {
      if (!configuredModels.has(measuredModel)) {
        hasUnconfiguredMeasurements = true;
        passWarnings.push(`Measurement for unconfigured model ${measuredModel} cannot be bound to an artifact`);
      }
    }
  }

  for (const modelProfile of options.modelProfiles) {
    const modelName = modelProfile.name;
    const id = artifactId(modelProfile, sourceRendererProfile);
    const artifactErrors: string[] = [];
    const selections: VerifiedTightProfileSelection[] = [];
    const recordFingerprints: string[] = [];

    for (const entry of entries) {
      const originalCanonical = stableStringify(canonicalizeSem(entry.record.sem));
      const originalFingerprint = fingerprintSem(entry.record.sem);
      recordFingerprints.push(originalFingerprint);
      const invalidMeasurements = measurementErrors(entry, modelProfile);
      if (invalidMeasurements.length > 0) {
        artifactErrors.push(...invalidMeasurements.map((error) => `${originalFingerprint}: ${error}`));
        continue;
      }

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
        artifactId: id,
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

      if (selected) {
        selections.push({
          recordFingerprint: originalFingerprint,
          selectedProfile: selected.profile,
          tokenCount: selected.tokenCount,
          optimizedFingerprint: selected.optimizedFingerprint,
          profileTokens,
        });
      } else {
        artifactErrors.push(`${originalFingerprint}: no candidate preserved semantics`);
      }
    }

    const uniqueFingerprints = new Set(recordFingerprints);
    if (uniqueFingerprints.size !== recordFingerprints.length) {
      artifactErrors.push('Record coverage contains duplicate canonical fingerprints');
    }

    artifacts.push({
      schema: 'openlunum-model-specific-tight-profile/0.1',
      id,
      modelName,
      sourceRendererProfile,
      tokenizer: { ...modelProfile.tokenizer },
      expectedRecordCount: entries.length,
      verifiedRecordCount: selections.length,
      recordFingerprints,
      selections,
      valid: entries.length > 0 && selections.length === entries.length && artifactErrors.length === 0,
      errors: artifactErrors,
    });
    passWarnings.push(...artifactErrors.map((error) => `${modelName}: ${error}`));
  }

  const artifactsValid = artifacts.length > 0 && artifacts.every((artifact) => artifact.valid);

  return {
    models: [...new Set(modelNames)],
    results,
    artifacts,
    recordCount: entries.length,
    allSemanticsPreserved:
      duplicateModels.length === 0 &&
      !hasUnconfiguredMeasurements &&
      artifactsValid &&
      results.length === entries.length * modelNames.length &&
      results.every((result) => result.semanticsPreserved),
    warnings: passWarnings,
  };
}
