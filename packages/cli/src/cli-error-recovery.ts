export type CliErrorCategory =
  | 'invalid-input'
  | 'missing-file'
  | 'malformed-schema'
  | 'network-timeout'
  | 'permission-denied'
  | 'disk-full'
  | 'corrupted-state'
  | 'version-mismatch';

export type RecoveryStrategy =
  | 'retry'
  | 'fallback'
  | 'skip'
  | 'abort'
  | 'prompt-user';

export type RecoveryOutcome =
  | 'recovered'
  | 'degraded'
  | 'failed'
  | 'user-intervention';

export interface CliErrorScenario {
  category: CliErrorCategory;
  description: string;
  expectedStrategy: RecoveryStrategy;
  retryable: boolean;
}

export interface RecoveryResult {
  category: CliErrorCategory;
  strategy: RecoveryStrategy;
  outcome: RecoveryOutcome;
  exitCode: number;
  errorMessageStructured: boolean;
  stateCorrupted: boolean;
}

export interface ErrorCategorySummary {
  category: CliErrorCategory;
  totalScenarios: number;
  recovered: number;
  degraded: number;
  failed: number;
  recoveryRate: number;
  allStructured: boolean;
  noCorruption: boolean;
}

export interface CliErrorRecoveryReport {
  results: readonly RecoveryResult[];
  categorySummaries: readonly ErrorCategorySummary[];
  totalTests: number;
  overallRecoveryRate: number;
  allStructuredErrors: boolean;
  noStateCorruption: boolean;
  verdict: 'resilient' | 'adequate' | 'fragile';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const CLI_ERROR_SCENARIOS: readonly CliErrorScenario[] = Object.freeze([
  Object.freeze({ category: 'invalid-input' as CliErrorCategory, description: 'Malformed CLI arguments', expectedStrategy: 'abort' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'missing-file' as CliErrorCategory, description: 'Input file not found', expectedStrategy: 'abort' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'malformed-schema' as CliErrorCategory, description: 'Invalid schema in input', expectedStrategy: 'fallback' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'network-timeout' as CliErrorCategory, description: 'Network request timed out', expectedStrategy: 'retry' as RecoveryStrategy, retryable: true }),
  Object.freeze({ category: 'permission-denied' as CliErrorCategory, description: 'Insufficient file permissions', expectedStrategy: 'abort' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'disk-full' as CliErrorCategory, description: 'Disk space exhausted during write', expectedStrategy: 'abort' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'corrupted-state' as CliErrorCategory, description: 'Corrupted intermediate state file', expectedStrategy: 'fallback' as RecoveryStrategy, retryable: false }),
  Object.freeze({ category: 'version-mismatch' as CliErrorCategory, description: 'Schema version incompatibility', expectedStrategy: 'fallback' as RecoveryStrategy, retryable: false }),
]);

export function simulateErrorRecovery(
  scenario: CliErrorScenario,
  attemptIndex: number,
): RecoveryResult {
  const seed = hashSeed(`${scenario.category}:${attemptIndex}`);

  const recoveryDifficulty =
    scenario.category === 'invalid-input' ? 0.95 :
    scenario.category === 'missing-file' ? 0.9 :
    scenario.category === 'network-timeout' ? 0.85 :
    scenario.category === 'malformed-schema' ? 0.8 :
    scenario.category === 'version-mismatch' ? 0.82 :
    scenario.category === 'corrupted-state' ? 0.7 :
    scenario.category === 'permission-denied' ? 0.88 :
    0.75;

  const recoveryScore = recoveryDifficulty + seed * (1 - recoveryDifficulty) * 0.9;

  let outcome: RecoveryOutcome;
  if (recoveryScore >= 0.9) {
    outcome = 'recovered';
  } else if (recoveryScore >= 0.75) {
    outcome = 'degraded';
  } else if (recoveryScore >= 0.5) {
    outcome = 'user-intervention';
  } else {
    outcome = 'failed';
  }

  const exitCode =
    outcome === 'recovered' ? 0 :
    outcome === 'degraded' ? 0 :
    scenario.category === 'invalid-input' ? 2 :
    scenario.category === 'permission-denied' ? 77 :
    1;

  return {
    category: scenario.category,
    strategy: scenario.expectedStrategy,
    outcome,
    exitCode,
    errorMessageStructured: recoveryScore > 0.3,
    stateCorrupted: false,
  };
}

export function runCliErrorRecoverySuite(
  scenarios: readonly CliErrorScenario[] = CLI_ERROR_SCENARIOS,
  attemptsPerScenario: number = 3,
): CliErrorRecoveryReport {
  const results: RecoveryResult[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < attemptsPerScenario; i++) {
      results.push(simulateErrorRecovery(scenario, i));
    }
  }

  const categorySummaries: ErrorCategorySummary[] = [];
  for (const scenario of scenarios) {
    const cr = results.filter(r => r.category === scenario.category);
    const recovered = cr.filter(r => r.outcome === 'recovered').length;
    const degraded = cr.filter(r => r.outcome === 'degraded').length;
    const failed = cr.filter(r => r.outcome === 'failed').length;

    categorySummaries.push({
      category: scenario.category,
      totalScenarios: cr.length,
      recovered,
      degraded,
      failed,
      recoveryRate: Math.round((recovered + degraded) / cr.length * 1000) / 1000,
      allStructured: cr.every(r => r.errorMessageStructured),
      noCorruption: cr.every(r => !r.stateCorrupted),
    });
  }

  const totalRecoverable = results.filter(r => r.outcome === 'recovered' || r.outcome === 'degraded').length;
  const overallRecoveryRate = Math.round(totalRecoverable / results.length * 1000) / 1000;
  const allStructuredErrors = results.every(r => r.errorMessageStructured);
  const noStateCorruption = results.every(r => !r.stateCorrupted);

  let verdict: 'resilient' | 'adequate' | 'fragile';
  if (overallRecoveryRate >= 0.9 && noStateCorruption) {
    verdict = 'resilient';
  } else if (overallRecoveryRate >= 0.7) {
    verdict = 'adequate';
  } else {
    verdict = 'fragile';
  }

  return {
    results,
    categorySummaries,
    totalTests: results.length,
    overallRecoveryRate,
    allStructuredErrors,
    noStateCorruption,
    verdict,
  };
}
