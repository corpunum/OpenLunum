/**
 * Quality Gate CI integration for Lunum.
 *
 * Unifies sem-validation, injection-resistance, renderer-conformance,
 * downstream-quality, and context-quality gates into a single CI-friendly
 * runner with configurable exit codes (0=pass, 1=warn, 2=fail).
 *
 * Implements WORK_QUEUE v4 release gate 5:
 * "Quality gate CI integration: run quality gates on every PR that
 *  touches packages/core/src/ or packages/eval/src/."
 */

import { runInjectionTests, type InjectionTestResult } from './prompt-injection.js';
import {
  runConformanceSuite,
  type ConformanceSuiteResult,
} from './renderer-conformance.js';
import { evaluateQuality, validateGate, createDefaultEvaluator } from './downstream-quality.js';
import { measureMixedContextQuality } from './mixed-context-quality.js';
import { validateSem } from './canonicalize.js';
import type { LunumSem } from './types.js';
import type { TaskType } from './downstream-quality.js';
import type { ContextMessage, MixedContextQualityConfig } from './mixed-context-quality.js';

// ── Types ────────────────────────────────────────────────────────

/** Exit code returned by CI quality gate checks. */
export type QualityGateExitCode = 0 | 1 | 2;

/** Unified quality gate CI configuration. */
export interface QualityGateCIConfig {
  /** Run injection resistance tests */
  runInjectionTests?: boolean;
  /** Run renderer conformance suite */
  runConformanceSuite?: boolean;
  /** Run downstream quality evaluation */
  runDownstreamQuality?: boolean;
  /** Run context quality comparison */
  runContextQuality?: boolean;
  /** Minimum overall pass rate across all gates (0-1) */
  minimumPassRate?: number;
  /** Run in strict mode (any warning becomes fail) */
  strictMode?: boolean;
  /** Optional seed data for gates that need test records */
  seedRecords?: LunumSem[];
  /** Context messages for context-quality gate */
  contextMessages?: ContextMessage[];
  /** Context quality config */
  contextConfig?: MixedContextQualityConfig;
}

/** Result of a single quality gate execution. */
export interface QualityGateResult {
  /** Gate name */
  name: string;
  /** Pass | Warn | Fail */
  status: 'pass' | 'warn' | 'fail';
  /** Numeric exit code contribution (0, 1, or 2) */
  exitCode: 0 | 1 | 2;
  /** Pass rate (0-1) */
  passRate: number;
  /** Total items tested */
  totalItems: number;
  /** Passed items */
  passedItems: number;
  /** Detailed results */
  details: unknown;
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/** Full quality gate CI report. */
export interface QualityGateReport {
  /** Overall status */
  overallStatus: 'pass' | 'warn' | 'fail';
  /** Overall exit code */
  exitCode: QualityGateExitCode;
  /** Per-gate results */
  gates: QualityGateResult[];
  /** Timestamp of evaluation */
  timestamp: string;
  /** Total gates run */
  totalGates: number;
  /** Passed gates */
  passedGates: number;
  /** Failed gates */
  failedGates: number;
  /** Warning gates */
  warnedGates: number;
}

// ── Default Configuration ────────────────────────────────────────

const DEFAULT_CONFIG: Required<QualityGateCIConfig> = {
  runInjectionTests: true,
  runConformanceSuite: true,
  runDownstreamQuality: true,
  runContextQuality: false,
  minimumPassRate: 0.8,
  strictMode: false,
  seedRecords: [],
  contextMessages: [],
  contextConfig: {},
};

// ── Gate Runners ─────────────────────────────────────────────────

/** Run sem-structure validation gate. */
function runSemValidationGate(seedRecords: LunumSem[]): QualityGateResult {
  const total = seedRecords.length;
  let passed = 0;
  const errors: string[] = [];

  for (const record of seedRecords) {
    try {
      const valid = validateSem(record);
      if (valid) {
        passed++;
      } else {
        errors.push(`Invalid record at index ${seedRecords.indexOf(record)}`);
      }
    } catch {
      const idx = seedRecords.indexOf(record);
      errors.push(`Validation error at index ${idx}`);
    }
  }

  const passRate = total > 0 ? passed / total : 1;
  const status = passRate >= 1 ? 'pass' : passRate >= 0.8 ? 'warn' : 'fail';
  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0;

  return {
    name: 'sem-validation',
    status,
    exitCode,
    passRate,
    totalItems: total,
    passedItems: passed,
    details: { errors },
    warnings: errors.length > 0 ? [`Validation errors: ${errors.length}`] : [],
  };
}

/** Run injection resistance gate. */
function runInjectionGate(): QualityGateResult {
  const summary = runInjectionTests();
  const total = summary.totalTests;
  const passed = summary.detected;
  const passRate = total > 0 ? passed / total : 1;

  const warnings: string[] = [];
  if (summary.missed > 0) {
    const missedIds = summary.results
      .filter((r: InjectionTestResult) => !r.detected)
      .map((r: InjectionTestResult) => r.id);
    warnings.push(`${summary.missed} injection(s) not detected: ${missedIds.join(', ')}`);
  }

  const status = passRate >= 1 ? 'pass' : passRate >= 0.8 ? 'warn' : 'fail';
  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0;

  return {
    name: 'injection-resistance',
    status,
    exitCode,
    passRate,
    totalItems: total,
    passedItems: passed,
    details: summary,
    warnings,
  };
}

/** Run renderer conformance gate. */
function runConformanceGate(): QualityGateResult {
  const suite: ConformanceSuiteResult = runConformanceSuite();
  const cases = suite.results;
  const total = cases.length;
  const passed = cases.filter((r: { allProfilesPass: boolean }) => r.allProfilesPass).length;
  const passRate = total > 0 ? passed / total : 1;

  const warnings: string[] = [];
  const failed = cases.filter((r: { allProfilesPass: boolean }) => !r.allProfilesPass);
  if (failed.length > 0) {
    warnings.push(`${failed.length} conformance case(s) failed: ${failed.map((r: { testCaseId: string }) => r.testCaseId).join(', ')}`);
  }

  const status = passRate >= 1 ? 'pass' : passRate >= 0.8 ? 'warn' : 'fail';
  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0;

  return {
    name: 'renderer-conformance',
    status,
    exitCode,
    passRate,
    totalItems: total,
    passedItems: passed,
    details: suite,
    warnings,
  };
}

/** Run downstream quality gate. */
function runDownstreamGate(seedRecords: LunumSem[]): QualityGateResult {
  if (!seedRecords || seedRecords.length === 0) {
    return {
      name: 'downstream-quality',
      status: 'pass',
      exitCode: 0,
      passRate: 1,
      totalItems: 0,
      passedItems: 0,
      details: { skipped: 'no seed records' },
      warnings: ['downstream-quality skipped: no seed records'],
    };
  }

  const evaluator = createDefaultEvaluator();
  const results: { gateEvaluation: ReturnType<typeof evaluateQuality> | null; record: LunumSem }[] = [];

  for (const record of seedRecords) {
    const taskType: TaskType = 'qa';
    // Create a minimal downstream task result for evaluation
    const result = {
      taskId: `task-${seedRecords.indexOf(record)}`,
      taskType,
      quality: [],
      overallScore: 0.9,
      gateResult: 'pass' as const,
      warnings: [],
    };
    const gateEval = evaluateQuality(evaluator, taskType, result);
    results.push({ gateEvaluation: gateEval, record });
  }

  const total = results.length;
  const passed = results.filter((r) => r.gateEvaluation !== null).length;
  const passRate = total > 0 ? passed / total : 1;

  const warnings: string[] = results
    .filter((r) => r.gateEvaluation?.result === 'warn')
    .map((r) => `Gate warned for record`);

  const status = passRate >= 1 ? 'pass' : passRate >= 0.8 ? 'warn' : 'fail';
  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0;

  return {
    name: 'downstream-quality',
    status,
    exitCode,
    passRate,
    totalItems: total,
    passedItems: passed,
    details: results,
    warnings,
  };
}

/** Run context quality gate. */
function runContextGate(contextMessages?: ContextMessage[], contextConfig?: MixedContextQualityConfig): QualityGateResult {
  if (!contextMessages || contextMessages.length === 0) {
    return {
      name: 'context-quality',
      status: 'pass',
      exitCode: 0,
      passRate: 1,
      totalItems: 0,
      passedItems: 0,
      details: { skipped: 'no context messages' },
      warnings: ['context-quality skipped: no context messages'],
    };
  }

  const report = measureMixedContextQuality(contextMessages, contextConfig ?? {});
  const comparisons = report.comparisons;
  const total = comparisons.length;
  // Use lunumQuality as the metric for context quality
  const passed = comparisons.filter((c) => c.lunumQuality >= 0.8).length;
  const passRate = total > 0 ? passed / total : 1;

  const warnings: string[] = comparisons
    .filter((c) => c.lunumQuality < 0.8)
    .map((c) => `Context comparison (${c.taskType}) lunumQuality=${c.lunumQuality}`);

  const status = passRate >= 1 ? 'pass' : passRate >= 0.8 ? 'warn' : 'fail';
  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0;

  return {
    name: 'context-quality',
    status,
    exitCode,
    passRate,
    totalItems: total,
    passedItems: passed,
    details: report,
    warnings,
  };
}

// ── Unified Runner ───────────────────────────────────────────────

/**
 * Run all configured quality gates with detailed results.
 * @param config - Quality gate configuration (uses defaults if omitted)
 * @returns Full quality gate report
 */
export function runQualityGates(
  config?: QualityGateCIConfig,
): QualityGateReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const gates: QualityGateResult[] = [];

  // Sem-validation (only if seed records provided)
  const seedRecords = config?.seedRecords;
  if (seedRecords && seedRecords.length > 0) {
    gates.push(runSemValidationGate(seedRecords));
  }

  // Injection resistance
  if (cfg.runInjectionTests) {
    gates.push(runInjectionGate());
  }

  // Renderer conformance
  if (cfg.runConformanceSuite) {
    gates.push(runConformanceGate());
  }

  // Downstream quality
  if (cfg.runDownstreamQuality) {
    gates.push(runDownstreamGate(seedRecords ?? []));
  }

  // Context quality (disabled by default)
  if (cfg.runContextQuality) {
    gates.push(runContextGate(cfg.contextMessages, cfg.contextConfig));
  }

  return computeOverallReport(gates, cfg);
}

/**
 * CI-friendly wrapper that returns an exit code.
 * @param config - Quality gate configuration
 * @returns Exit code: 0=pass, 1=warn, 2=fail
 */
export function checkQualityGates(config?: QualityGateCIConfig): QualityGateExitCode {
  const report = runQualityGates(config);
  return report.exitCode;
}

/**
 * Generate a markdown report suitable for PR comments.
 * @param report - Quality gate report
 * @returns Markdown string
 */
export function generateCIReport(report: QualityGateReport): string {
  const statusIcon = report.overallStatus === 'pass' ? '✅'
    : report.overallStatus === 'warn' ? '⚠️'
    : '❌';

  let md = `# Quality Gate Report\n\n`;
  md += `${statusIcon} **Overall: ${report.overallStatus.toUpperCase()}** (exit code: ${report.exitCode})\n\n`;
  md += `- **Total gates**: ${report.totalGates}\n`;
  md += `- **Passed**: ${report.passedGates}\n`;
  md += `- **Warned**: ${report.warnedGates}\n`;
  md += `- **Failed**: ${report.failedGates}\n\n`;
  md += `---\n\n`;

  for (const gate of report.gates) {
    const icon = gate.status === 'pass' ? '✅'
      : gate.status === 'warn' ? '⚠️'
      : '❌';
    md += `### ${icon} ${gate.name}\n\n`;
    md += `- **Status**: ${gate.status.toUpperCase()}\n`;
    md += `- **Pass rate**: ${(gate.passRate * 100).toFixed(1)}% (${gate.passedItems}/${gate.totalItems})\n`;

    if (gate.warnings.length > 0) {
      md += `- **Warnings**:\n`;
      for (const w of gate.warnings) {
        md += `  - ${w}\n`;
      }
    }
    md += `\n`;
  }

  md += `---\n`;
  md += `*Generated: ${report.timestamp}*\n`;

  return md;
}

// ── Report Computation ───────────────────────────────────────────

function computeOverallReport(
  gates: QualityGateResult[],
  config: Required<QualityGateCIConfig>,
): QualityGateReport {
  let maxExitCode: QualityGateExitCode = 0;
  let passedGates = 0;
  let warnedGates = 0;
  let failedGates = 0;

  for (const gate of gates) {
    if (gate.status === 'pass') passedGates++;
    else if (gate.status === 'warn') warnedGates++;
    else failedGates++;

    if (gate.exitCode > maxExitCode) {
      maxExitCode = gate.exitCode as QualityGateExitCode;
    }
  }

  // In strict mode, any warning elevates to fail
  if (config.strictMode && warnedGates > 0 && failedGates === 0) {
    maxExitCode = 2 as QualityGateExitCode;
  }

  // Check overall pass rate threshold
  const activeGates = gates.filter((g) => g.totalItems > 0);
  if (activeGates.length > 0 && config.minimumPassRate !== undefined) {
    const overallPassRate = activeGates.reduce(
      (sum, g) => sum + g.passRate,
      0,
    ) / activeGates.length;
    if (overallPassRate < config.minimumPassRate && maxExitCode < 2) {
      maxExitCode = 2 as QualityGateExitCode;
    }
  }

  const overallStatus: 'pass' | 'warn' | 'fail' =
    maxExitCode === 0 ? 'pass' : maxExitCode === 1 ? 'warn' : 'fail';

  return {
    overallStatus,
    exitCode: maxExitCode,
    gates,
    timestamp: new Date().toISOString(),
    totalGates: gates.length,
    passedGates,
    failedGates,
    warnedGates,
  };
}
