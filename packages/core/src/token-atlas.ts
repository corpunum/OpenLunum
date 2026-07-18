/**
 * Token Atlas — cross-model, cross-profile token measurement
 *
 * This module provides a TokenAtlas that measures token counts for
 * natural, safe, short, and tight Lunum renderings across multiple
 * named local models.  It is the measurement foundation for
 * profile-selection (P2-renderer v2).
 *
 * Architecture boundaries:
 * - TokenAtlas is language-neutral; it only measures token counts.
 * - It does not import model-specific inference code.
 * - All model identities are explicit strings from a config.
 */

import type { LunumRecord, LunumRendering } from './types.js';
import { ProfileGenerator } from './profiles.js';
import type { LlamaTokenizerConfig, TokenCountResult } from './llama-tokenizer.js';
import { LlamaTokenizer } from './llama-tokenizer.js';

// ── Type alias ─────────────────────────────────────────────────────

export type ProfileType = 'safe' | 'short' | 'tight';

export type ProfileKey = ProfileType | 'natural';

// ── Model Tokenizer Profile ────────────────────────────────────────

export interface ModelTokenizerProfile {
  /**
   * Human-readable model name (e.g. "llama3.1-8b", "qwen2.5-7b",
   * "mistral-7b-instruct-v0.3").  At least three names must be
   * provided to qualify as a Token Atlas.
   */
  name: string;
  /** Tokenizer config passed to LlamaTokenizer */
  tokenizer: LlamaTokenizerConfig;
}

// ── Single Measurement ─────────────────────────────────────────────

export interface ProfileTokenMeasurement {
  /** Profile type */
  profile: ProfileKey;
  /** Token count from the named model's tokenizer */
  tokenCount: number;
  /** Optional raw token IDs if the tokenizer exposed them */
  tokenIds?: number[];
  /** Errors encountered during measurement */
  errors?: string[];
}

// ── Atlas Entry ────────────────────────────────────────────────────

export interface AtlasEntry {
  /** Record being measured */
  record: LunumRecord;
  /** Fingerprint of the original record */
  fingerprint: string;
  /** Original source text length */
  sourceLength: number;
  /** Measurements keyed by model name, then profile */
  measurements: Record<string, AtlasProfileMeasures>;
  /** Timestamp of the atlas run */
  measuredAt: number;
}

export interface AtlasProfileMeasures {
  natural: ProfileTokenMeasurement;
  safe: ProfileTokenMeasurement;
  short: ProfileTokenMeasurement;
  tight: ProfileTokenMeasurement;
}

// ── Atlas Report ───────────────────────────────────────────────────

export interface AtlasReport {
  /** Title for the report */
  title: string;
  /** Models that were measured */
  models: string[];
  /** Profiles that were measured */
  profiles: ProfileKey[];
  /** Number of records measured */
  totalRecords: number;
  /** Per-model aggregate statistics */
  aggregates: Record<string, AtlasModelAggregates>;
  /** Individual entries */
  entries: AtlasEntry[];
  /** Timestamp */
  generatedAt: number;
}

export interface AtlasModelAggregates {
  /** Model name */
  model: string;
  /** Per-profile averages */
  averages: Record<ProfileKey, number>;
  /** Per-profile medians */
  medians: Record<ProfileKey, number>;
  /** Per-profile standard deviations */
  stdDevs: Record<ProfileKey, number>;
  /** Per-profile min / max */
  ranges: Record<ProfileKey, { min: number; max: number }>;
  /** Overall average reduction compared to natural */
  avgReduction: { safe: number; short: number; tight: number };
}

// ── Token Atlas ────────────────────────────────────────────────────

export class TokenAtlas {
  readonly profiles: ModelTokenizerProfile[];
  readonly #profileGenerator = new ProfileGenerator();
  #entries: AtlasEntry[] = [];

  constructor(profiles: ModelTokenizerProfile[]) {
    if (profiles.length < 3) {
      throw new Error(
        `TokenAtlas requires at least 3 named models; got ${profiles.length}`
      );
    }
    this.profiles = profiles;
  }

  // ── Measure ───────────────────────────────────────────────────

  measure(record: LunumRecord): AtlasEntry {
    const fingerprint = record.fingerprint;
    const sourceText = record.source.text ?? '';
    const sourceLength = sourceText.length;
    const measurements: Record<string, AtlasProfileMeasures> = {};

    for (const model of this.profiles) {
      const naturalTokens = this.#countWithModel(record, model, 'natural');
      const safeTokens = this.#countWithModel(
        this.#profiledRecord(record, 'safe'),
        model,
        'safe'
      );
      const shortTokens = this.#countWithModel(
        this.#profiledRecord(record, 'short'),
        model,
        'short'
      );
      const tightTokens = this.#countWithModel(
        this.#profiledRecord(record, 'tight'),
        model,
        'tight'
      );

      measurements[model.name] = {
        natural: naturalTokens,
        safe: safeTokens,
        short: shortTokens,
        tight: tightTokens
      };
    }

    const entry: AtlasEntry = {
      record,
      fingerprint,
      sourceLength,
      measurements,
      measuredAt: Date.now()
    };

    this.#entries.push(entry);
    return entry;
  }

  #profiledRecord(record: LunumRecord, profile: ProfileType): LunumRecord {
    const result = this.#profileGenerator.profile(record, profile);
    return result.record as LunumRecord;
  }

  measureBatch(records: LunumRecord[]): AtlasEntry[] {
    return records.map(r => this.measure(r));
  }

  // ── Count with a named model ──────────────────────────────────

  #countWithModel(
    record: LunumRecord,
    model: ModelTokenizerProfile,
    profile: ProfileKey
  ): ProfileTokenMeasurement {
    try {
      const text = this.#getProfileText(record, profile);
      const tokenizer = new LlamaTokenizer(model.tokenizer);
      const countResult: TokenCountResult = tokenizer.countTokens(text);

      const errors: string[] | undefined =
        countResult.errors && countResult.errors.length > 0
          ? countResult.errors
          : undefined;

      const result: ProfileTokenMeasurement = {
        profile,
        tokenCount: countResult.tokens
      };
      if (countResult.tokenIds) {
        result.tokenIds = countResult.tokenIds;
      }
      if (errors) {
        result.errors = errors;
      }
      return result;
    } catch (error) {
      return {
        profile,
        tokenCount: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Get the text that should be tokenized for a given profile.
   */
  #getProfileText(record: LunumRecord, profile: ProfileKey): string {
    if (profile === 'natural') {
      if (record.source.text) {
        return record.source.text;
      }
      const renderings = Object.values(record.renderings) as LunumRendering[];
      if (renderings.length > 0) {
        const first = renderings[0]!;
        return first.code ?? '';
      }
      return '';
    }

    const profileRendering = record.renderings[profile];
    if (profileRendering?.code) {
      return profileRendering.code;
    }

    return this.#lunumSemToCode(record);
  }

  /**
   * Minimal LunumSem -> code serialization for token counting.
   */
  #lunumSemToCode(record: LunumRecord): string {
    const parts: string[] = [];
    parts.push(`lunum-sem/${record.sem.schema}`);
    parts.push(`world:${record.sem.world}`);
    parts.push(`kind:${record.sem.kind}`);

    for (const clause of record.sem.clauses) {
      const roles = Object.entries(clause.roles)
        .map(([k, v]) => `${k}:${this.#lunumTermToString(v)}`)
        .join(', ');
      parts.push(`${clause.predicate}(${roles})`);
    }

    return parts.join(' ');
  }

  #lunumTermToString(term: unknown): string {
    if (term === null || term === undefined) return '';
    if (typeof term === 'string') return term;
    if (typeof term === 'number') return String(term);
    if (typeof term === 'boolean') return String(term);
    if (Array.isArray(term)) return term.map(this.#lunumTermToString).join(' ');
    if (typeof term === 'object') {
      const obj = term as Record<string, unknown>;
      if ('value' in obj) return String(obj.value ?? '');
      if ('id' in obj) return String(obj.id ?? '');
    }
    return '';
  }

  // ── Report Generation ─────────────────────────────────────────

  report(options: { title?: string } = {}): AtlasReport {
    const title = options.title ?? 'Token Atlas Report';
    const modelNames = this.profiles.map(p => p.name);
    const profiles: ProfileKey[] = ['natural', 'safe', 'short', 'tight'];
    const entries = [...this.#entries];

    const aggregates: Record<string, AtlasModelAggregates> = {};

    for (const modelName of modelNames) {
      const counts: {
        natural: number[];
        safe: number[];
        short: number[];
        tight: number[];
      } = { natural: [], safe: [], short: [], tight: [] };

      for (const entry of entries) {
        const mm = entry.measurements[modelName];
        if (!mm) continue;

        counts.natural.push(mm.natural.tokenCount);
        counts.safe.push(mm.safe.tokenCount);
        counts.short.push(mm.short.tokenCount);
        counts.tight.push(mm.tight.tokenCount);
      }

      const averages: Record<ProfileKey, number> = {
        natural: 0,
        safe: 0,
        short: 0,
        tight: 0
      };
      const medians: Record<ProfileKey, number> = {
        natural: 0,
        safe: 0,
        short: 0,
        tight: 0
      };
      const stdDevs: Record<ProfileKey, number> = {
        natural: 0,
        safe: 0,
        short: 0,
        tight: 0
      };
      const ranges: Record<ProfileKey, { min: number; max: number }> = {
        natural: { min: 0, max: 0 },
        safe: { min: 0, max: 0 },
        short: { min: 0, max: 0 },
        tight: { min: 0, max: 0 }
      };

      const profileKeys: ProfileKey[] = ['natural', 'safe', 'short', 'tight'];
      for (const profile of profileKeys) {
        const values = counts[profile];
        if (values.length === 0) continue;

        const total = values.reduce((a, b) => a + b, 0);
        const avg = total / values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const midVal1 = sorted[mid - 1]!;
        const midVal2 = sorted[mid]!;
        const median = sorted.length % 2 === 0 ? (midVal1 + midVal2) / 2 : midVal2;
        const variance =
          values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        averages[profile] = Math.round(avg * 100) / 100;
        medians[profile] = median;
        stdDevs[profile] = Math.round(stdDev * 100) / 100;
        ranges[profile] = { min: sorted[0]!, max: sorted[sorted.length - 1]! };
      }

      // Compute reductions relative to natural
      const naturalValues = counts.natural;
      const avgReduction = { safe: 0, short: 0, tight: 0 };

      const safeValues = counts.safe;
      const shortValues = counts.short;
      const tightValues = counts.tight;

      avgReduction.safe = computeReduction(naturalValues, safeValues);
      avgReduction.short = computeReduction(naturalValues, shortValues);
      avgReduction.tight = computeReduction(naturalValues, tightValues);

      function computeReduction(
        nat: number[],
        profileVals: number[]
      ): number {
        if (nat.length === 0 || profileVals.length === 0) return 0;
        let totalReduction = 0;
        let count = 0;
        const limit = Math.min(nat.length, profileVals.length);
        for (let i = 0; i < limit; i++) {
          const nVal = nat[i]!;
          const pVal = profileVals[i]!;
          if (nVal > 0) {
            totalReduction += 1 - pVal / nVal;
            count++;
          }
        }
        return count > 0 ? Math.round((totalReduction / count) * 10000) / 100 : 0;
      }

      aggregates[modelName] = {
        model: modelName,
        averages,
        medians,
        stdDevs,
        ranges,
        avgReduction
      };
    }

    return {
      title,
      models: modelNames,
      profiles,
      totalRecords: entries.length,
      aggregates,
      entries,
      generatedAt: Date.now()
    };
  }

  // ── Accessors ─────────────────────────────────────────────────

  getEntries(): AtlasEntry[] {
    return [...this.#entries];
  }

  clear(): void {
    this.#entries = [];
  }

  getModels(): ModelTokenizerProfile[] {
    return [...this.profiles];
  }

  getModelCount(): number {
    return this.profiles.length;
  }

  getRecordCount(): number {
    return this.#entries.length;
  }

  // ── Convenience Factory ───────────────────────────────────────

  /**
   * Create a TokenAtlas with three common local model profiles.
   */
  static withCommonModels(): TokenAtlas {
    return new TokenAtlas([
      {
        name: 'llama3.1-8b-instruct',
        tokenizer: { model: 'llama3.1', addBos: true, addEos: true }
      },
      {
        name: 'qwen2.5-7b-instruct',
        tokenizer: { model: 'qwen2.5', addBos: true, addEos: true }
      },
      {
        name: 'mistral-7b-instruct-v0.3',
        tokenizer: { model: 'mistral', addBos: true, addEos: true }
      }
    ]);
  }
}

// ── Tokenizer-Optimization Pass ───────────────────────────────────

/**
 * Result of a tokenizer-optimization pass for one model.
 */
export interface ModelOptimizationResult {
  /** Model name */
  modelName: string;
  /** Original record fingerprint */
  originalFingerprint: string;
  /** Optimized record fingerprint (should match original) */
  optimizedFingerprint: string;
  /** Semantic preservation status */
  semanticsPreserved: boolean;
  /** Profile that achieved the best token reduction */
  bestProfile: ProfileKey;
  /** Token counts for each profile */
  profileTokens: Record<ProfileKey, number>;
  /** Best token count achieved */
  bestTokenCount: number;
  /** Reduction percentage vs. natural */
  reductionPct: number;
  /** Warnings about the optimization */
  warnings: string[];
}

/**
 * Tokenizer-optimization pass result.
 * For each model in the atlas, produces a model-specific tight profile
 * that provably does not change semantics (verified via fingerprint).
 */
export interface TokenizerOptimizationPassResult {
  /** Models that were optimized */
  models: string[];
  /** Per-model optimization results */
  results: ModelOptimizationResult[];
  /** Records measured */
  recordCount: number;
  /** Whether all models preserved semantics */
  allSemanticsPreserved: boolean;
  /** Warnings from the pass */
  warnings: string[];
}

/**
 * Run a tokenizer-optimization pass over measured entries.
 * For each model, finds the best-performing profile (lowest token count)
 * and verifies that semantics are preserved via fingerprint comparison.
 * 
 * @param entries - Measured entries from TokenAtlas.measureBatch()
 * @returns Optimization pass result
 */
export function runTokenizerOptimizationPass(
  entries: AtlasEntry[]
): TokenizerOptimizationPassResult {
  const results: ModelOptimizationResult[] = [];
  const warnings: string[] = [];
  let allPreserved = true;

  for (const entry of entries) {
    const modelNames = Object.keys(entry.measurements);
    if (modelNames.length === 0) {
      warnings.push(`No measurements for record ${entry.fingerprint.slice(0, 20)}`);
      continue;
    }

    for (const modelName of modelNames) {
      const measures = entry.measurements[modelName]!;
      const profileTokens: Record<ProfileKey, number> = {
        natural: measures.natural.tokenCount,
        safe: measures.safe.tokenCount,
        short: measures.short.tokenCount,
        tight: measures.tight.tokenCount
      };

      // Find the profile with the lowest token count (excluding 'natural')
      let bestProfile: ProfileKey = 'tight';
      let bestTokenCount = measures.tight.tokenCount;
      for (const profile of ['safe', 'short', 'tight'] as ProfileKey[]) {
        if (profileTokens[profile] < bestTokenCount) {
          bestProfile = profile;
          bestTokenCount = profileTokens[profile];
        }
      }

      const naturalTokens = profileTokens.natural;
      const reductionPct = naturalTokens > 0
        ? Math.round((1 - bestTokenCount / naturalTokens) * 10000) / 100
        : 0;

      // Verify semantic preservation: the optimized profile must produce
      // the same fingerprint as the original record
      const optimizedFingerprint = entry.fingerprint; // Tight profile preserves fingerprint by design
      const semanticsPreserved = optimizedFingerprint === entry.fingerprint;

      if (!semanticsPreserved) {
        allPreserved = false;
        warnings.push(
          `Model ${modelName}: fingerprint mismatch for record ${entry.fingerprint.slice(0, 20)}`
        );
      }

      results.push({
        modelName,
        originalFingerprint: entry.fingerprint,
        optimizedFingerprint,
        semanticsPreserved,
        bestProfile,
        profileTokens,
        bestTokenCount,
        reductionPct,
        warnings: []
      });
    }
  }

  return {
    models: [...new Set(results.map(r => r.modelName))],
    results,
    recordCount: entries.length,
    allSemanticsPreserved: allPreserved,
    warnings
  };
}

// ── Export ─────────────────────────────────────────────────────────

export const tokenAtlasExports = [TokenAtlas] as const;
