/**
 * Quality Gate CI Integration
 *
 * Unified quality gate runner for CI pipelines. Wraps existing quality gates
 * (downstream-quality, mixed-context-quality, prompt-injection, renderer-conformance)
 * into a single runnable suite suitable for CI.
 *
 * Exit codes:
 *   0 = all gates pass
 *   1 = warnings but overall pass
 *   2 = at least one gate failed
 *
 * This module implements the release gate 5 requirement:
 * "Quality gate CI integration: run quality gates on every PR that touches
 *  packages/core/src/ or packages/eval/src/."
 */

import { evaluateQuality, createDefaultEvaluator, type QualityEvaluator } from './downstream-quality.js';
import { measureMixedContextQuality, type MixedContextQualityReport } from './mixed-context-quality.js';
import { runAllInjectionTests, getAdversarialInputs } from './prompt-injection.js';
import { runConformanceSuite, createTestRecords } from './renderer-conformance.js';
import type { LunumRecord } from './types.js';

// ── Types ──────────────────────────────────────────────────────────

/** Exit code from quality gate run. */
export type GateExitCode = 0 | 1 | 2;

/** Individual gate result for CI reporting. */
export interface GateResultEntry {
  name: string;
  passed: boolean;
  score: number;
  details?: string[];
  warnings?: string[];
}

/** Full CI report from running all quality gates. */
export interface QualityGateCIReport {
  timestamp: number;
  gates: GateResultEntry[];
  overallScore: number;
  exitCode: GateExitCode;
  warnings: string[];
}

/** Configuration for the quality gate CI runner. */
export interface QualityGateCIConfig {
  /** Run downstream quality gates (default: true) */
  runDownstreamQuality?: boolean | undefined;
  /** Run mixed-context quality gates (default: false) */
  runMixedContext?: boolean | undefined;
  /** Run prompt injection resistance tests (default: true) */
  runInjectionTests?: boolean | undefined;
  /** Run renderer conformance tests (default: true) */
  runConformanceSuite?: boolean | undefined;
  /** Minimum overall pass rate (0-1, default: 0.8) */
  minimumPassRate?: number | undefined;
  /** Run in strict mode (warnings also cause exit 1) (default: false) */
  strictMode?: boolean | undefined;
}

// ── Gate Runner ────────────────────────────────────────────────────

/** Run all configured quality gates against Lunum records. */
export function runQualityGates(records: LunumRecord[], config?: QualityGateCIConfig): QualityGateCIReport {
  const cfg = {
    runDownstreamQuality: true,
    runMixedContext: false,
    runInjectionTests: true,
    runConformanceSuite: true,
    minimumPassRate: 0.8,
    strictMode: false
  };

  if (config) {
    if (config.runDownstreamQuality !== undefined) cfg.runDownstreamQuality = config.runDownstreamQuality;
    if (config.runMixedContext !== undefined) cfg.runMixedContext = config.runMixedContext;
    if (config.runInjectionTests !== undefined) cfg.runInjectionTests = config.runInjectionTests;
    if (config.runConformanceSuite !== undefined) cfg.runConformanceSuite = config.runConformanceSuite;
    if (config.minimumPassRate !== undefined) cfg.minimumPassRate = config.minimumPassRate;
    if (config.strictMode !== undefined) cfg.strictMode = config.strictMode;
  }

  const gates: GateResultEntry[] = [];
  const warnings: string[] = [];
  let totalTests = 0;
  let passedTests = 0;

  // 1. Downstream quality gates
  if (cfg.runDownstreamQuality) {
    const evaluator = createDefaultEvaluator();
    const downstreamScore = runDownstreamQualityGate(records, evaluator);
    gates.push(downstreamScore);
    totalTests += 1;
    if (downstreamScore.passed) passedTests += 1;
    if (downstreamScore.warnings) warnings.push(...downstreamScore.warnings);
  }

  // 2. Mixed-context quality gates
  if (cfg.runMixedContext) {
    const ctxScore = runMixedContextQualityGate(records);
    gates.push(ctxScore);
    totalTests += 1;
    if (ctxScore.passed) passedTests += 1;
    if (ctxScore.warnings) warnings.push(...ctxScore.warnings);
  }

  // 3. Prompt injection tests
  if (cfg.runInjectionTests) {
    const injectionScore = runInjectionGate();
    gates.push(injectionScore);
    totalTests += 1;
    if (injectionScore.passed) passedTests += 1;
    if (injectionScore.warnings) warnings.push(...injectionScore.warnings);
  }

  // 4. Renderer conformance suite
  if (cfg.runConformanceSuite) {
    const conformanceScore = runConformanceGate();
    gates.push(conformanceScore);
    totalTests += 1;
    if (conformanceScore.passed) passedTests += 1;
    if (conformanceScore.warnings) warnings.push(...conformanceScore.warnings);
  }

  // Calculate overall score and exit code
  const overallScore = totalTests > 0 ? passedTests / totalTests : 0;
  const passRate = totalTests > 0 ? passedTests / totalTests : 0;
  const minimumPassRate = cfg.minimumPassRate ?? 0.8;

  let exitCode: GateExitCode = 0;
  if (passRate < minimumPassRate) {
    exitCode = 2;
  } else if (warnings.length > 0 && cfg.strictMode) {
    exitCode = 1;
  } else if (gates.some(g => g.warnings && g.warnings.length > 0)) {
    exitCode = 1;
  }

  return {
    timestamp: Date.now(),
    gates,
    overallScore,
    exitCode,
    warnings
  };
}

function runDownstreamQualityGate(records: LunumRecord[], evaluator: QualityEvaluator): GateResultEntry {
  let passed = true;
  const details: string[] = [];
  const warnings: string[] = [];
  let score = 1;

  for (const result of evaluator.results) {
    const evaluation = evaluateQuality(evaluator, result.taskType, result);
    if (evaluation) {
      if (evaluation.result === 'fail') {
        passed = false;
        score = Math.min(score, evaluation.score);
        details.push(`FAIL: ${evaluation.gateName} score ${evaluation.score}`);
        if (evaluation.warnings) warnings.push(...evaluation.warnings);
      } else if (evaluation.result === 'warn') {
        score = Math.min(score, evaluation.score);
        details.push(`WARN: ${evaluation.gateName} score ${evaluation.score}`);
        if (evaluation.warnings) warnings.push(...evaluation.warnings);
      } else {
        details.push(`PASS: ${evaluation.gateName} score ${evaluation.score}`);
      }
    }
  }

  if (evaluator.results.length === 0) {
    details.push('No downstream task results to evaluate');
  }

  const entry: GateResultEntry = {
    name: 'downstream-quality',
    passed,
    score,
    details
  };
  if (warnings.length > 0) {
    entry.warnings = warnings;
  }
  return entry;
}

function runMixedContextQualityGate(records: LunumRecord[]): GateResultEntry {
  try {
    const report = measureMixedContextQuality(records);
    const passed = report.summary.overallScore >= 0.8;
    const entry: GateResultEntry = {
      name: 'mixed-context-quality',
      passed,
      score: report.summary.overallScore,
      details: [`Overall score: ${report.summary.overallScore.toFixed(4)}`]
    };
    if (!passed) {
      entry.warnings = ['Overall score below 0.8 threshold'];
    }
    return entry;
  } catch (error) {
    return {
      name: 'mixed-context-quality',
      passed: false,
      score: 0,
      details: [`Error: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function runInjectionGate(): GateResultEntry {
  const summary = runAllInjectionTests();
  const passed = summary.detected === summary.totalTests;
  const score = summary.totalTests > 0 ? summary.detected / summary.totalTests : 0;
  const entry: GateResultEntry = {
    name: 'injection-resistance',
    passed,
    score,
    details: [`${summary.detected}/${summary.totalTests} adversarial inputs detected`]
  };
  if (!passed) {
    entry.warnings = ['Some adversarial inputs were not detected'];
  }
  return entry;
}

function runConformanceGate(): GateResultEntry {
  const result = runConformanceSuite();
  const passed = result.passedTests === result.totalTests;
  const score = result.totalTests > 0 ? result.passedTests / result.totalTests : 0;
  const failedDetails = result.results
    .filter(r => r.allProfilesPass === false)
    .map(r => `${r.testCaseId}: ${r.profileResults.filter(p => !p.roundTripPass).map(p => `${p.profile}: canonical mismatch`).join('; ')}`);
  const entry: GateResultEntry = {
    name: 'renderer-conformance',
    passed,
    score,
    details: [`${result.passedTests}/${result.totalTests} tests passed conformance`]
  };
  if (failedDetails.length > 0) {
    entry.warnings = failedDetails;
  }
  return entry;
}

/**
 * CI-friendly wrapper that returns an exit code.
 * Suitable for use in CI scripts.
 */
export function checkQualityGates(records: LunumRecord[], config?: QualityGateCIConfig): GateExitCode {
  const report = runQualityGates(records, config);
  return report.exitCode;
}

/**
 * Generate a markdown report suitable for PR comments.
 */
export function generateCIReport(report: QualityGateCIReport): string {
  const lines = [
    '# Quality Gate CI Report',
    '',
    `**Timestamp:** ${new Date(report.timestamp).toISOString()}`,
    `**Overall Score:** ${report.overallScore.toFixed(4)}`,
    `**Exit Code:** ${report.exitCode}`,
    ''
  ];

  for (const gate of report.gates) {
    const icon = gate.passed ? '✅' : '❌';
    lines.push(`### ${icon} ${gate.name}`);
    lines.push(`- Score: ${gate.score.toFixed(4)}`);
    if (gate.details) {
      for (const detail of gate.details) {
        lines.push(`- ${detail}`);
      }
    }
    if (gate.warnings) {
      for (const warning of gate.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
    }
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push('### Warnings');
    for (const warning of report.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by OpenLunum Quality Gate CI*');

  return lines.join('\n');
}
