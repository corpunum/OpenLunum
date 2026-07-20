import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { fingerprintSem } from './fingerprint.js';
import { LlamaTokenizer } from './llama-tokenizer.js';
import { ProfileGenerator } from './profiles.js';
import type { ProfileResult, ProfileType } from './profiles.js';
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
  modelProfiles: ModelTokenizerProfile[];
  sourceRendererProfile?: string;
}

const PROFILE_TYPES: readonly ProfileType[] = ['safe', 'short', 'tight'];

function reductionPercentage(natural: number, optimized: number): number {
  if (natural <= 0) return 0;
  return Math.round((1 - optimized / natural) * 10000) / 100;
}

function artifactId(model: ModelTokenizerProfile, sourceRendererProfile: string): string {
  const encode = (value: string): string => encodeURIComponent(value).replaceAll('%', '_');
  return `tight/${encode(model.name)}/${encode(model.tokenizer.model ?? 'unspecified')}/${encode(sourceRendererProfile)}`;
}

function naturalMeasurementText(record: LunumRecord): string {
  if (record.source.text) return record.source.text;
  return Object.values(record.renderings)[0]?.code ?? '';
}

function measurementErrors(
  entry: AtlasEntry,
  modelProfile: ModelTokenizerProfile,
  generated: Record<ProfileType, ProfileResult>,
): string[] {
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

  const tokenizer = new LlamaTokenizer(modelProfile.tokenizer);
  const texts: Record<ProfileKey, string> = {
    natural: naturalMeasurementText(entry.record),
    safe: generated.safe.record.renderings.safe?.code ?? '',
    short: generated.short.record.renderings.short?.code ?? '',
    tight: generated.tight.record.renderings.tight?.code ?? '',
  };

  for (const profile of ['natural', 'safe', 'short', 'tight'] as const) {
    const measurement = measures[profile];
    if (measurement.profile !== profile) errors.push(`${modelName}/${profile}: measurement is labelled ${measurement.profile}`);
    if (!Number.isSafeInteger(measurement.tokenCount) || measurement.tokenCount <= 0) {
      errors.push(`${modelName}/${profile}: tokenCount must be a positive safe integer`);
    }
    for (const error of measurement.errors ?? []) errors.push(`${modelName}/${profile}: ${error}`);

    if (profile !== 'natural' && texts[profile].length === 0) {
      errors.push(`${modelName}/${profile}: current renderer did not emit profile code`);
      continue;
    }
    const current = tokenizer.countTokens(texts[profile]);
    for (const error of current.errors ?? []) errors.push(`${modelName}/${profile}: current tokenizer error: ${error}`);
    if (current.tokens !== measurement.tokenCount) {
      errors.push(
        `${modelName}/${profile}: measured tokenCount ${measurement.tokenCount} does not match current output count ${current.tokens}`,
      );
    }
  }
  return errors;
}

function candidateFor(
  profileResult: ProfileResult,
  profile: ProfileType,
  tokenCount: number,
  originalCanonical: string,
  originalFingerprint: string,
): VerifiedProfileCandidate {
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
 * preservation. Attached fingerprints and token measurements are untrusted:
 * source fingerprints are recomputed, every current profile is rendered,
 * current output is re-tokenized with the bound tokenizer, and only exact
 * measurement matches may enter a model-specific artifact.
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
  if (duplicateModels.length > 0) passWarnings.push(`Duplicate model profiles: ${[...new Set(duplicateModels)].join(', ')}`);

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

      if (entry.fingerprint !== originalFingerprint || entry.record.fingerprint !== originalFingerprint) {
        artifactErrors.push(`${originalFingerprint}: attached fingerprint is stale or inconsistent with canonical semantic content`);
        continue;
      }

      let generated: Record<ProfileType, ProfileResult>;
      try {
        generated = {
          safe: generator.profile(entry.record, 'safe'),
          short: generator.profile(entry.record, 'short'),
          tight: generator.profile(entry.record, 'tight'),
        };
      } catch (error) {
        artifactErrors.push(`${originalFingerprint}: renderer generation failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      const invalidMeasurements = measurementErrors(entry, modelProfile, generated);
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

      const candidates = PROFILE_TYPES
        .map((profile) => candidateFor(
          generated[profile],
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
        const warning = `Model ${modelName}: no measured profile preserved semantics for ${originalFingerprint.slice(0, 24)}`;
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
    if (uniqueFingerprints.size !== recordFingerprints.length) artifactErrors.push('Record coverage contains duplicate canonical fingerprints');

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
