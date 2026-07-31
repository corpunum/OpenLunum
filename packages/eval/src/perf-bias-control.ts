/**
 * Performance bias control (R14.5).
 *
 * Detects and controls caching, JIT warmup, and execution-order bias
 * in performance measurements.
 */

export interface BiasReport {
  coldWarmRatio: number;
  cacheEffectDetected: boolean;
  firstRunMs: number;
  steadyStateMeanMs: number;
  orderSensitive: boolean;
}

export interface BiasControlConfig {
  warmupRuns: number;
  measurementRuns: number;
  cooldownMs: number;
  cacheBiasThreshold: number;
}

export const DEFAULT_BIAS_CONFIG: BiasControlConfig = {
  warmupRuns: 50,
  measurementRuns: 200,
  cooldownMs: 10,
  cacheBiasThreshold: 2.0,
};

export function shuffleTestOrder<T>(tests: T[]): T[] {
  const shuffled = [...tests];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

export function thermalCooldown(minDelayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, minDelayMs));
}

export function detectCacheBias(
  latenciesMs: number[],
  threshold: number = DEFAULT_BIAS_CONFIG.cacheBiasThreshold,
): BiasReport {
  if (latenciesMs.length < 2) {
    return {
      coldWarmRatio: 1,
      cacheEffectDetected: false,
      firstRunMs: latenciesMs[0] ?? 0,
      steadyStateMeanMs: latenciesMs[0] ?? 0,
      orderSensitive: false,
    };
  }

  const firstRun = latenciesMs[0]!;
  const steadyState = latenciesMs.slice(1);
  const steadyMean = steadyState.reduce((a, b) => a + b, 0) / steadyState.length;
  const ratio = steadyMean > 0 ? firstRun / steadyMean : 1;

  const midpoint = Math.floor(latenciesMs.length / 2);
  const firstHalf = latenciesMs.slice(0, midpoint);
  const secondHalf = latenciesMs.slice(midpoint);
  const firstHalfMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondHalfMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const driftRatio = firstHalfMean > 0 ? secondHalfMean / firstHalfMean : 1;
  const orderSensitive = Math.abs(driftRatio - 1) > 0.2;

  return {
    coldWarmRatio: Math.round(ratio * 1000) / 1000,
    cacheEffectDetected: ratio >= threshold,
    firstRunMs: Math.round(firstRun * 1000) / 1000,
    steadyStateMeanMs: Math.round(steadyMean * 1000) / 1000,
    orderSensitive,
  };
}

export interface BiasControlledResult {
  latencies: number[];
  biasReport: BiasReport;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

export async function runWithBiasControl(
  fn: () => void,
  config: BiasControlConfig = DEFAULT_BIAS_CONFIG,
): Promise<BiasControlledResult> {
  for (let i = 0; i < config.warmupRuns; i++) {
    fn();
  }

  if (config.cooldownMs > 0) {
    await thermalCooldown(config.cooldownMs);
  }

  const latencies: number[] = [];
  for (let i = 0; i < config.measurementRuns; i++) {
    const t0 = performance.now();
    fn();
    latencies.push(performance.now() - t0);
  }

  const biasReport = detectCacheBias(latencies, config.cacheBiasThreshold);
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    latencies,
    biasReport,
    meanMs: Math.round(mean * 1000) / 1000,
    p50Ms: Math.round(percentile(sorted, 50) * 1000) / 1000,
    p95Ms: Math.round(percentile(sorted, 95) * 1000) / 1000,
    p99Ms: Math.round(percentile(sorted, 99) * 1000) / 1000,
  };
}
