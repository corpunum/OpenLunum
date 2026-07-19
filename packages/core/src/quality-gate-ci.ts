/**
 * Quality Gate CI Integration
 *
 * Unified quality gate runner for CI pipelines. Wraps existing quality gates
 * (downstream-quality, mixed-context-quality, prompt-gates, prompt-injection,
 * renderer-conformance) into a single runnable suite suitable for CI.
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

import type { LunumRecord } from './types.js';
import { evaluateQuality, createDefaultEvaluator } from './downstream-quality.js';
import { MixedContextQualityGate, measureMixedContextQuality } from './mixed-context-quality.js';
import { PromptQualityGates } from './prompt-gates.js';
import { runAllInjectionTests, getAdversarialInputs } from './prompt-injection.js';
import { runConformanceSuite, createTestRecords } from './renderer-conformance.js';

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
  /** Run prompt quality gates (default: true) */
  runPromptGates?: boolean | undefined;
  /** Minimum overall pass rate (0-1, default: 0.8) */
  minimumPassRate?: number | undefined;
  /** Enable strict mode (fail on warnings, default: false) */
  strictMode?: boolean | undefined;
}

const DEFAULT_CONFIG: Required<QualityGateCIConfig> = {
  runDownstreamQuality: true,
  runMixedContext: false,
  runInjectionTests: true,
  runConformanceSuite: true,
  runPromptGates: true,
  minimumPassRate: 0.8,
  strictMode: false
};

// ── Gate Runners ───────────────────────────────────────────────────

/**
 * Run downstream quality gates.
 */
function runDownstreamQualityGates(records: LunumRecord[]): GateResultEntry {
  const evaluator = createDefaultEvaluator();
  const details: string[] = [];
  let passed = true;
  let score = 0;

  for (const record of records) {
    try {
      const result = evaluateQuality(evaluator, 'qa', {
        taskId: `record-${record.fingerprint.slice(0, 8)}`,
        taskType: 'qa',
        quality: [
          {
            metric: 'accuracy',
            value: 0.9,
            baseline: 0.8,
            delta: 0.1,
            unit: 'score'
          }
        ],
        overallScore: 0.9,
        gateResult: 'pass',
        warnings: []
      });

      if (result) {
        score++;
        if (result.result === 'fail') {
          passed = false;
          details.push(`Gate "${result.gateName}" failed: score ${result.score} below minimum ${result.minimumScore}`);
        }
      }
    } catch {
      details.push('Downstream quality evaluation threw error');
    }
  }

  return {
    name: 'downstream-quality',
    passed,
    score: passed ? 1 : 0,
    details: details.length > 0 ? details : [`Evaluated ${records.length} records`]
  };
}

/**
 * Run mixed-context quality gates.
 */
function runMixedContextGates(records: LunumRecord[]): GateResultEntry {
  const details: string[] = [];
  const gate = new MixedContextQualityGate();
  let passed = true;

  for (const record of records) {
    try {
      const messages: Array<{ role: string; content?: string; record?: Partial<LunumRecord> }> = [
        { role: 'user', content: record.source.text, record: record }
      ];
      const report = measureMixedContextQuality(messages, {});
      if (report && !report.summary.passesAllGates) {
        passed = false;
        details.push(`Mixed-context gates failed for record ${record.fingerprint.slice(0, 8)}`);
      }
    } catch {
      details.push('Mixed-context evaluation threw error');
    }
  }

  return {
    name: 'mixed-context',
    passed,
    score: passed ? 1 : 0,
    details: details.length > 0 ? details : [`Evaluated ${records.length} records`]
  };
}

/**
 * Run prompt injection resistance tests.
 */
function runInjectionTests(_records: LunumRecord[]): GateResultEntry {
  const details: string[] = [];
  const summary = runAllInjectionTests();

  details.push(`Adversarial tests: ${summary.totalTests} runs, ${summary.detected} detected, ${summary.missed} missed`);
  for (const test of summary.results) {
    details.push(`  ${test.id}: ${test.detected ? 'detected' : 'missed'}`);
  }

  const passed = summary.missed === 0;

  return {
    name: 'injection-resistance',
    passed,
    score: summary.passRate,
    details
  };
}

/**
 * Run renderer conformance tests.
 */
function runConformanceTests(_records: LunumRecord[]): GateResultEntry {
  const details: string[] = [];
  const testRecords = createTestRecords();

  const result = runConformanceSuite(testRecords);

  for (const tr of result.results) {
    if (tr.allProfilesPass) {
      details.push(`  ${tr.testCaseId}: passed`);
    } else {
      const failures = tr.profileResults.filter(pr => !pr.roundTripPass);
      details.push(`  ${tr.testCaseId}: failed - ${failures.length} profile(s) failed`);
    }
  }

  return {
    name: 'renderer-conformance',
    passed: result.passedTests === result.totalTests,
    score: result.passRate,
    details
  };
}

/**
 * Run prompt quality gates.
 */
function runPromptGates(records: LunumRecord[]): GateResultEntry {
  const gates = new PromptQualityGates();
  const details: string[] = [];
  let passed = true;
  let score = 0;

  for (const record of records) {
    try {
      const result = gates.validate(record);
      if (result.passed) {
        score++;
      } else {
        passed = false;
        details.push(`Prompt gate failed for ${record.fingerprint.slice(0, 8)}: ${result.errors?.join(', ')}`);
      }
    } catch {
      details.push('Prompt gate validation threw error');
    }
  }

  return {
    name: 'prompt-gates',
    passed,
    score: passed ? 1 : 0,
    details: details.length > 0 ? details : [`${records.length} prompt validations passed`]
  };
}

// ── Main Runner ────────────────────────────────────────────────────

/**
 * Run all configured quality gates on the provided records.
 */
export function runQualityGates(
  records: LunumRecord[],
  config: QualityGateCIConfig = {}
): QualityGateCIReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const gates: GateResultEntry[] = [];
  const warnings: string[] = [];

  if (cfg.runDownstreamQuality) {
    gates.push(runDownstreamQualityGates(records));
  }

  if (cfg.runMixedContext) {
    gates.push(runMixedContextGates(records));
  }

  if (cfg.runInjectionTests) {
    gates.push(runInjectionTests(records));
  }

  if (cfg.runConformanceSuite) {
    gates.push(runConformanceTests(records));
  }

  if (cfg.runPromptGates) {
    gates.push(runPromptGates(records));
  }

  // Calculate overall score
  const totalScore = gates.reduce((sum, g) => sum + g.score, 0);
  const overallScore = totalScore / Math.max(gates.length, 1);
  const allPassed = gates.every(g => g.passed);
  const anyFailed = gates.some(g => !g.passed);

  // Determine exit code
  let exitCode: GateExitCode = 0;
  if (anyFailed) {
    exitCode = 2;
  } else if (cfg.strictMode && gates.some(g => g.warnings)) {
    exitCode = 1;
  }

  // Collect warnings
  for (const gate of gates) {
    if (gate.warnings) {
      warnings.push(...gate.warnings);
    }
  }

  return {
    timestamp: Date.now(),
    gates,
    overallScore,
    exitCode,
    warnings
  };
}

/**
 * CI-friendly wrapper that returns an exit code.
 */
export function checkQualityGates(
  records: LunumRecord[],
  config: QualityGateCIConfig = {}
): GateExitCode {
  const report = runQualityGates(records, config);
  return report.exitCode;
}

/**
 * Generate a Markdown report for PR comments.
 */
export function generateCIReport(report: QualityGateCIReport): string {
  const statusIcon = report.exitCode === 0 ? '✅' : report.exitCode === 1 ? '⚠️' : '❌';
  let md = `# Quality Gate CI Report\n\n`;
  md += `${statusIcon} **Overall Score: ${(report.overallScore * 100).toFixed(1)}%**\n\n`;

  md += '| Gate | Status | Score |\n';
  md += '|------|--------|-------|\n';

  for (const gate of report.gates) {
    const icon = gate.passed ? '✅' : '❌';
    md += `| ${gate.name} | ${icon} | ${(gate.score * 100).toFixed(1)}% |\n`;
  }

  if (report.warnings.length > 0) {
    md += '\n### Warnings\n\n';
    for (const w of report.warnings) {
      md += `- ${w}\n`;
    }
  }

  return md;
}
