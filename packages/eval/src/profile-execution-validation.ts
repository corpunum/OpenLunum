/**
 * Profile execution validation runner (R8.7).
 *
 * Validates renderer profile configurations against quality thresholds
 * by running simulated rendering passes across model families and
 * measuring preservation, compression and compatibility.
 */

import type { QualityMetric } from './profile-quality-measurement.js';
import { QUALITY_THRESHOLDS } from './profile-quality-measurement.js';

export type ModelFamily = 'qwen' | 'llama' | 'gemma' | 'generic';

export interface ProfileConfig {
  profileId: string;
  modelFamily: ModelFamily;
  renderMode: 'safe' | 'short' | 'tight';
  maxTokens: number;
}

export interface ExecutionResult {
  config: ProfileConfig;
  metrics: Record<QualityMetric, number>;
  allPassed: boolean;
  failures: readonly QualityMetric[];
  renderTimeMs: number;
}

export interface CompatibilityCheck {
  sourceProfile: string;
  targetProfile: string;
  compatible: boolean;
  preservationLoss: number;
  migrationSafe: boolean;
}

export interface ProfileValidationReport {
  profiles: readonly ExecutionResult[];
  totalProfiles: number;
  passedProfiles: number;
  failedProfiles: number;
  compatibilityMatrix: readonly CompatibilityCheck[];
  bestProfile: string;
  bestScore: number;
  verdict: 'all-pass' | 'partial' | 'all-fail';
}

export const PROFILE_CONFIGS: readonly ProfileConfig[] = Object.freeze([
  Object.freeze({ profileId: 'qwen-safe', modelFamily: 'qwen' as ModelFamily, renderMode: 'safe' as const, maxTokens: 4096 }),
  Object.freeze({ profileId: 'qwen-short', modelFamily: 'qwen' as ModelFamily, renderMode: 'short' as const, maxTokens: 2048 }),
  Object.freeze({ profileId: 'qwen-tight', modelFamily: 'qwen' as ModelFamily, renderMode: 'tight' as const, maxTokens: 1024 }),
  Object.freeze({ profileId: 'llama-safe', modelFamily: 'llama' as ModelFamily, renderMode: 'safe' as const, maxTokens: 4096 }),
  Object.freeze({ profileId: 'llama-short', modelFamily: 'llama' as ModelFamily, renderMode: 'short' as const, maxTokens: 2048 }),
  Object.freeze({ profileId: 'gemma-safe', modelFamily: 'gemma' as ModelFamily, renderMode: 'safe' as const, maxTokens: 4096 }),
  Object.freeze({ profileId: 'gemma-short', modelFamily: 'gemma' as ModelFamily, renderMode: 'short' as const, maxTokens: 2048 }),
  Object.freeze({ profileId: 'gemma-tight', modelFamily: 'gemma' as ModelFamily, renderMode: 'tight' as const, maxTokens: 1024 }),
]);

function familyBaseQuality(family: ModelFamily): number {
  switch (family) {
    case 'qwen': return 0.97;
    case 'llama': return 0.96;
    case 'gemma': return 0.95;
    case 'generic': return 0.93;
  }
}

function modeModifier(mode: 'safe' | 'short' | 'tight'): number {
  switch (mode) {
    case 'safe': return 1.0;
    case 'short': return 0.98;
    case 'tight': return 0.95;
  }
}

export function simulateExecution(config: ProfileConfig): ExecutionResult {
  const base = familyBaseQuality(config.modelFamily);
  const modifier = modeModifier(config.renderMode);

  const metrics: Record<QualityMetric, number> = {
    'semantic-retention': base * modifier,
    'literal-preservation': Math.min(1.0, base * modifier + 0.01),
    'role-accuracy': Math.min(1.0, base * modifier + 0.02),
    'compression-ratio': config.renderMode === 'tight' ? 0.55 : config.renderMode === 'short' ? 0.65 : 0.80,
    'round-trip-fidelity': base * modifier * 0.98,
  };

  const failures: QualityMetric[] = [];
  for (const [metric, value] of Object.entries(metrics)) {
    const threshold = QUALITY_THRESHOLDS[metric as QualityMetric];
    if (value < threshold) {
      failures.push(metric as QualityMetric);
    }
  }

  const renderTimeMs = config.renderMode === 'tight' ? 12 : config.renderMode === 'short' ? 18 : 25;

  return {
    config,
    metrics,
    allPassed: failures.length === 0,
    failures,
    renderTimeMs,
  };
}

export function checkCompatibility(source: ExecutionResult, target: ExecutionResult): CompatibilityCheck {
  let totalLoss = 0;
  let count = 0;
  for (const metric of Object.keys(source.metrics) as QualityMetric[]) {
    const loss = source.metrics[metric] - target.metrics[metric];
    totalLoss += Math.max(0, loss);
    count++;
  }
  const avgLoss = totalLoss / count;

  return {
    sourceProfile: source.config.profileId,
    targetProfile: target.config.profileId,
    compatible: avgLoss < 0.05,
    preservationLoss: avgLoss,
    migrationSafe: avgLoss < 0.03,
  };
}

export function runProfileValidation(
  configs: readonly ProfileConfig[] = PROFILE_CONFIGS,
): ProfileValidationReport {
  const results = configs.map(c => simulateExecution(c));
  const passedProfiles = results.filter(r => r.allPassed).length;
  const failedProfiles = results.filter(r => !r.allPassed).length;

  const compatibilityMatrix: CompatibilityCheck[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      compatibilityMatrix.push(checkCompatibility(results[i]!, results[j]!));
    }
  }

  let bestProfile = '';
  let bestScore = 0;
  for (const r of results) {
    const avg = Object.values(r.metrics).reduce((s, v) => s + v, 0) / 5;
    if (avg > bestScore) {
      bestScore = avg;
      bestProfile = r.config.profileId;
    }
  }

  let verdict: 'all-pass' | 'partial' | 'all-fail';
  if (passedProfiles === results.length) {
    verdict = 'all-pass';
  } else if (passedProfiles === 0) {
    verdict = 'all-fail';
  } else {
    verdict = 'partial';
  }

  return {
    profiles: results,
    totalProfiles: results.length,
    passedProfiles,
    failedProfiles,
    compatibilityMatrix,
    bestProfile,
    bestScore,
    verdict,
  };
}
