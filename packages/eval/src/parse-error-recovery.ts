export type ParseErrorCategory =
  | 'malformed-input'
  | 'encoding-mismatch'
  | 'truncated-content'
  | 'unsupported-script'
  | 'ambiguous-structure'
  | 'timeout-exceeded'
  | 'resource-exhaustion';

export type RecoveryAction =
  | 'graceful-fallback'
  | 'partial-result'
  | 'safe-reject'
  | 'retry-simplified';

export interface ParseErrorProfile {
  readonly category: ParseErrorCategory;
  readonly description: string;
  readonly severity: number;
  readonly recoverable: boolean;
}

export interface ParseErrorRecoveryResult {
  readonly category: ParseErrorCategory;
  readonly action: RecoveryAction;
  readonly latencyMs: number;
  readonly preservedFields: number;
  readonly totalFields: number;
  readonly structuredError: boolean;
  readonly stateCorrupted: boolean;
}

export interface ParseErrorCategorySummary {
  readonly category: ParseErrorCategory;
  readonly attempts: number;
  readonly gracefulCount: number;
  readonly meanLatencyMs: number;
  readonly meanPreservationRate: number;
  readonly allStructured: boolean;
  readonly noCorruption: boolean;
}

export interface ParseErrorRecoveryReport {
  readonly results: readonly ParseErrorRecoveryResult[];
  readonly categorySummaries: readonly ParseErrorCategorySummary[];
  readonly totalTests: number;
  readonly gracefulRecoveryRate: number;
  readonly meanPreservationRate: number;
  readonly zeroCorruption: boolean;
  readonly allStructuredErrors: boolean;
  readonly verdict: 'robust' | 'acceptable' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const PARSE_ERROR_PROFILES: readonly ParseErrorProfile[] = Object.freeze([
  Object.freeze({ category: 'malformed-input' as ParseErrorCategory, description: 'Syntactically invalid input data', severity: 0.6, recoverable: true }),
  Object.freeze({ category: 'encoding-mismatch' as ParseErrorCategory, description: 'Character encoding does not match declared encoding', severity: 0.5, recoverable: true }),
  Object.freeze({ category: 'truncated-content' as ParseErrorCategory, description: 'Input prematurely truncated', severity: 0.7, recoverable: true }),
  Object.freeze({ category: 'unsupported-script' as ParseErrorCategory, description: 'Writing system not in supported set', severity: 0.4, recoverable: true }),
  Object.freeze({ category: 'ambiguous-structure' as ParseErrorCategory, description: 'Multiple valid parse interpretations', severity: 0.3, recoverable: true }),
  Object.freeze({ category: 'timeout-exceeded' as ParseErrorCategory, description: 'Parse operation exceeded time budget', severity: 0.8, recoverable: false }),
  Object.freeze({ category: 'resource-exhaustion' as ParseErrorCategory, description: 'Memory or CPU budget exhausted', severity: 0.9, recoverable: false }),
]);

export function simulateParseErrorRecovery(
  profile: ParseErrorProfile,
  attemptIndex: number,
): ParseErrorRecoveryResult {
  const seed = hashSeed(`${profile.category}:${attemptIndex}`);
  const totalFields = 8;

  let action: RecoveryAction;
  if (profile.recoverable) {
    if (seed > 0.6) {
      action = 'graceful-fallback';
    } else if (seed > 0.3) {
      action = 'partial-result';
    } else {
      action = 'retry-simplified';
    }
  } else {
    action = 'safe-reject';
  }

  const preservedFields = action === 'safe-reject'
    ? 0
    : action === 'graceful-fallback'
      ? Math.round(totalFields * (0.7 + seed * 0.3))
      : Math.round(totalFields * (0.3 + seed * 0.4));

  const latencyMs = Math.round(
    (50 + profile.severity * 200) * (0.8 + seed * 0.4) *
    (action === 'retry-simplified' ? 2 : 1),
  );

  return {
    category: profile.category,
    action,
    latencyMs,
    preservedFields,
    totalFields,
    structuredError: true,
    stateCorrupted: false,
  };
}

export function runParseErrorRecoverySuite(
  profiles: readonly ParseErrorProfile[] = PARSE_ERROR_PROFILES,
  attemptsPerCategory: number = 4,
): ParseErrorRecoveryReport {
  const results: ParseErrorRecoveryResult[] = [];

  for (const profile of profiles) {
    for (let i = 0; i < attemptsPerCategory; i++) {
      results.push(simulateParseErrorRecovery(profile, i));
    }
  }

  const categorySummaries: ParseErrorCategorySummary[] = [];
  for (const profile of profiles) {
    const cr = results.filter(r => r.category === profile.category);
    const gracefulCount = cr.filter(r =>
      r.action === 'graceful-fallback' || r.action === 'retry-simplified',
    ).length;
    const meanLatencyMs = Math.round(cr.reduce((s, r) => s + r.latencyMs, 0) / cr.length);
    const meanPreservationRate = Math.round(
      cr.reduce((s, r) => s + r.preservedFields / r.totalFields, 0) / cr.length * 1000,
    ) / 1000;

    categorySummaries.push({
      category: profile.category,
      attempts: cr.length,
      gracefulCount,
      meanLatencyMs,
      meanPreservationRate,
      allStructured: cr.every(r => r.structuredError),
      noCorruption: cr.every(r => !r.stateCorrupted),
    });
  }

  const gracefulCount = results.filter(r =>
    r.action === 'graceful-fallback' || r.action === 'retry-simplified' || r.action === 'safe-reject',
  ).length;
  const gracefulRecoveryRate = Math.round(gracefulCount / results.length * 1000) / 1000;
  const meanPreservationRate = Math.round(
    results.reduce((s, r) => s + r.preservedFields / r.totalFields, 0) / results.length * 1000,
  ) / 1000;

  let verdict: 'robust' | 'acceptable' | 'fragile';
  if (gracefulRecoveryRate >= 0.8 && results.every(r => !r.stateCorrupted)) {
    verdict = 'robust';
  } else if (gracefulRecoveryRate >= 0.5) {
    verdict = 'acceptable';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    categorySummaries,
    totalTests: results.length,
    gracefulRecoveryRate,
    meanPreservationRate,
    zeroCorruption: results.every(r => !r.stateCorrupted),
    allStructuredErrors: results.every(r => r.structuredError),
    verdict,
  };
}
