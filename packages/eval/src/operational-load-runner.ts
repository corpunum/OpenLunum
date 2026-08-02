/**
 * Operational Load Execution Simulation Runner (R14.9)
 *
 * Validates operational load handling and degradation behavior across a
 * matrix of load levels and operation types. Measures latency percentiles,
 * error rate, throughput, and queue depth, then detects degradation points
 * where latency exceeds SLO thresholds. Produces per-operation and
 * per-level summaries plus an overall operational readiness verdict.
 *
 * Simulated measurements are deterministic (seeded from level + operation
 * name) so the suite is reproducible across runs.
 */

export type OperationalLoadLevelName = 'idle' | 'light' | 'moderate' | 'heavy' | 'peak';

export type OperationalOperationName = 'parse' | 'realize' | 'fingerprint' | 'compare';

export interface OperationalLoadLevel {
  name: OperationalLoadLevelName;
  rps: number;
  /** SLO ceiling for p99 latency (ms) at this load level. */
  p99SloMs: number;
}

export interface OperationalOperationProfile {
  name: OperationalOperationName;
  /** Baseline (idle, single-request) latency in ms. */
  baseLatencyMs: number;
}

export interface OperationalLatencyMetrics {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  throughputRps: number;
  queueDepth: number;
}

export interface OperationalLoadMeasurement {
  level: OperationalLoadLevelName;
  operation: OperationalOperationName;
  metrics: OperationalLatencyMetrics;
  sloMs: number;
  meetsSlo: boolean;
  degraded: boolean;
}

export interface OperationalOperationSummary {
  operation: OperationalOperationName;
  avgP99Ms: number;
  maxErrorRate: number;
  degradationLevel: OperationalLoadLevelName | null;
  meetsSloAtModerate: boolean;
}

export interface OperationalLevelSummary {
  level: OperationalLoadLevelName;
  rps: number;
  avgP99Ms: number;
  avgErrorRate: number;
  allOperationsPass: boolean;
}

export interface OperationalLoadReport {
  measurements: readonly OperationalLoadMeasurement[];
  byOperation: readonly OperationalOperationSummary[];
  byLevel: readonly OperationalLevelSummary[];
  firstDegradationLevel: OperationalLoadLevelName | null;
  verdict: 'ready' | 'degraded' | 'not-ready';
}

export const LOAD_LEVELS: readonly OperationalLoadLevel[] = Object.freeze([
  Object.freeze({ name: 'idle', rps: 1, p99SloMs: 200 }),
  Object.freeze({ name: 'light', rps: 10, p99SloMs: 300 }),
  Object.freeze({ name: 'moderate', rps: 50, p99SloMs: 500 }),
  Object.freeze({ name: 'heavy', rps: 100, p99SloMs: 800 }),
  Object.freeze({ name: 'peak', rps: 500, p99SloMs: 1500 }),
]);

export const OPERATION_TYPES: readonly OperationalOperationProfile[] = Object.freeze([
  Object.freeze({ name: 'parse', baseLatencyMs: 15 }),
  Object.freeze({ name: 'realize', baseLatencyMs: 25 }),
  Object.freeze({ name: 'fingerprint', baseLatencyMs: 8 }),
  Object.freeze({ name: 'compare', baseLatencyMs: 12 }),
]);

const LOAD_LEVEL_ORDER: readonly OperationalLoadLevelName[] = Object.freeze([
  'idle',
  'light',
  'moderate',
  'heavy',
  'peak',
]);

const IDLE_RPS = 1;

/**
 * Deterministic pseudo-random generator in [0, 1), seeded from a string.
 * Uses a simple string hash to seed a mulberry32 PRNG so results are
 * stable across runs without relying on Math.random().
 */
function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h >>>= 0;
  // mulberry32 step
  h |= 0;
  h = (h + 0x6d2b79f5) | 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function findLevel(name: OperationalLoadLevelName): OperationalLoadLevel {
  const level = LOAD_LEVELS.find(l => l.name === name);
  if (!level) {
    throw new Error(`Unknown operational load level: ${name}`);
  }
  return level;
}

function findOperation(name: OperationalOperationName): OperationalOperationProfile {
  const op = OPERATION_TYPES.find(o => o.name === name);
  if (!op) {
    throw new Error(`Unknown operational operation type: ${name}`);
  }
  return op;
}

/**
 * Simulates a load test for a given level x operation combination.
 * Latency grows super-linearly with rps to model queueing/contention;
 * error rate and queue depth grow similarly, dominated at peak load.
 */
export function simulateLoadTest(
  level: OperationalLoadLevelName,
  operation: OperationalOperationName,
): OperationalLoadMeasurement {
  const levelDef = findLevel(level);
  const opDef = findOperation(operation);

  const seedBase = `${level}:${operation}`;
  const jitter = seededUnit(seedBase);
  const jitter2 = seededUnit(`${seedBase}:2`);
  const jitter3 = seededUnit(`${seedBase}:3`);

  // Congestion factor grows with load level position; idle stays near baseline.
  const levelIndex = LOAD_LEVEL_ORDER.indexOf(level);
  const congestion = Math.pow(levelDef.rps / IDLE_RPS, 1.15) / 40;

  const p50Ms = opDef.baseLatencyMs * (1 + congestion * 0.5) + jitter * 5;
  const p95Ms = p50Ms * (1.6 + congestion * 0.15) + jitter2 * 8;
  const p99Ms = p95Ms * (1.25 + congestion * 0.2) + jitter3 * 10;

  const errorRate = Math.min(0.5, Math.max(0, (levelIndex >= 3 ? (congestion - 1.5) * 0.02 : 0) + jitter * 0.002));
  const throughputRps = levelDef.rps * (1 - Math.min(0.3, errorRate));
  const queueDepth = Math.max(0, Math.round(levelDef.rps * congestion * 0.1));

  const metrics: OperationalLatencyMetrics = {
    p50Ms: Math.round(p50Ms * 100) / 100,
    p95Ms: Math.round(p95Ms * 100) / 100,
    p99Ms: Math.round(p99Ms * 100) / 100,
    errorRate: Math.round(errorRate * 10000) / 10000,
    throughputRps: Math.round(throughputRps * 100) / 100,
    queueDepth,
  };

  const meetsSlo = metrics.p99Ms <= levelDef.p99SloMs && metrics.errorRate <= 0.05;

  return {
    level,
    operation,
    metrics,
    sloMs: levelDef.p99SloMs,
    meetsSlo,
    degraded: !meetsSlo,
  };
}

function summarizeOperation(
  operation: OperationalOperationName,
  measurements: readonly OperationalLoadMeasurement[],
): OperationalOperationSummary {
  const opMeasurements = measurements.filter(m => m.operation === operation);
  const avgP99Ms =
    opMeasurements.reduce((sum, m) => sum + m.metrics.p99Ms, 0) / opMeasurements.length;
  const maxErrorRate = opMeasurements.reduce((max, m) => Math.max(max, m.metrics.errorRate), 0);

  let degradationLevel: OperationalLoadLevelName | null = null;
  for (const levelName of LOAD_LEVEL_ORDER) {
    const measurement = opMeasurements.find(m => m.level === levelName);
    if (measurement && measurement.degraded) {
      degradationLevel = levelName;
      break;
    }
  }

  const moderateMeasurement = opMeasurements.find(m => m.level === 'moderate');

  return {
    operation,
    avgP99Ms: Math.round(avgP99Ms * 100) / 100,
    maxErrorRate: Math.round(maxErrorRate * 10000) / 10000,
    degradationLevel,
    meetsSloAtModerate: moderateMeasurement ? moderateMeasurement.meetsSlo : false,
  };
}

function summarizeLevel(
  level: OperationalLoadLevelName,
  measurements: readonly OperationalLoadMeasurement[],
): OperationalLevelSummary {
  const levelDef = findLevel(level);
  const levelMeasurements = measurements.filter(m => m.level === level);
  const avgP99Ms =
    levelMeasurements.reduce((sum, m) => sum + m.metrics.p99Ms, 0) / levelMeasurements.length;
  const avgErrorRate =
    levelMeasurements.reduce((sum, m) => sum + m.metrics.errorRate, 0) / levelMeasurements.length;

  return {
    level,
    rps: levelDef.rps,
    avgP99Ms: Math.round(avgP99Ms * 100) / 100,
    avgErrorRate: Math.round(avgErrorRate * 10000) / 10000,
    allOperationsPass: levelMeasurements.every(m => m.meetsSlo),
  };
}

/**
 * Runs the full operational load matrix (all levels x all operations),
 * producing per-operation and per-level summaries and an overall
 * operational readiness verdict.
 *
 * Verdict is 'ready' when every operation meets its SLO at moderate load
 * or below, 'degraded' when moderate load passes but heavier loads show
 * degradation, and 'not-ready' when moderate load itself fails an SLO.
 */
export function runOperationalLoadSuite(
  levels: readonly OperationalLoadLevel[] = LOAD_LEVELS,
  operations: readonly OperationalOperationProfile[] = OPERATION_TYPES,
): OperationalLoadReport {
  const measurements: OperationalLoadMeasurement[] = [];
  for (const level of levels) {
    for (const operation of operations) {
      measurements.push(simulateLoadTest(level.name, operation.name));
    }
  }

  const byOperation = operations.map(op => summarizeOperation(op.name, measurements));
  const byLevel = levels.map(lvl => summarizeLevel(lvl.name, measurements));

  let firstDegradationLevel: OperationalLoadLevelName | null = null;
  for (const levelName of LOAD_LEVEL_ORDER) {
    const levelSummary = byLevel.find(l => l.level === levelName);
    if (levelSummary && !levelSummary.allOperationsPass) {
      firstDegradationLevel = levelName;
      break;
    }
  }

  const moderateSummary = byLevel.find(l => l.level === 'moderate');
  const allMeetModerateSlo = byOperation.every(op => op.meetsSloAtModerate);

  let verdict: 'ready' | 'degraded' | 'not-ready';
  if (!moderateSummary || !allMeetModerateSlo) {
    verdict = 'not-ready';
  } else if (firstDegradationLevel === null) {
    verdict = 'ready';
  } else {
    verdict = 'degraded';
  }

  return {
    measurements,
    byOperation,
    byLevel,
    firstDegradationLevel,
    verdict,
  };
}
