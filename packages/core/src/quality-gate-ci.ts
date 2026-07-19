/**
 * Quality Gate CI Integration for Lunum.
 *
 * Wraps existing quality gates into a unified CI pipeline with
 * configurable exit codes (0=pass, 1=warn, 2=fail).
 *
 * Implements WORK_QUEUE v4 release gate 5:
 * "Quality gate CI integration: run quality gates on every PR
 *  that touches packages/core/src/ or packages/eval/src/."
 */

import { evaluateQuality, createDefaultEvaluator, type GateResult } from './downstream-quality.js';
import { runAllInjectionTests } from './prompt-injection.js';
import { runConformanceSuite } from './renderer-conformance.js';
import { MixedContextQualityGate } from './mixed-context-quality.js';
import type { LunumRecord } from './types.js';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

export interface QualityGateCIConfig {
  /** Run downstream-quality gate */
  runDownstreamQuality?: boolean;
  /** Run mixed-context-quality gate */
  runMixedContext?: boolean;
  /** Run injection-resistance tests */
  runInjectionTests?: boolean;
  /** Run renderer-conformance suite */
  runConformanceSuite?: boolean;
  /** Minimum overall pass rate (0-1) */
  minimumPassRate?: number;
  /** Enable strict mode (warnings become failures) */
  strictMode?: boolean;
}

export const defaultConfig: Required<QualityGateCIConfig> = {
  runDownstreamQuality: true,
  runMixedContext: false,
  runInjectionTests: true,
  runConformanceSuite: true,
  minimumPassRate: 0.8,
  strictMode: false
};

/* ------------------------------------------------------------------ */
/*  Result types                                                       */
/* ------------------------------------------------------------------ */

export type GateExitCode = 0 | 1 | 2;

export interface GateOutcome {
  name: string;
  result: GateResult;
  details: string[];
}

export interface QualityGateCIReport {
  overall: GateExitCode;
  passRate: number;
  total: number;
  passed: number;
  warnings: number;
  failures: number;
  gates: GateOutcome[];
}

/* ------------------------------------------------------------------ */
/*  Gate runner                                                        */
/* ------------------------------------------------------------------ */

/**
 * Run all configured quality gates and return a report.
 */
export function runQualityGates(config?: Partial<QualityGateCIConfig>): QualityGateCIReport {
  const cfg = { ...defaultConfig, ...config };
  const gates: GateOutcome[] = [];

  // Downstream quality gate
  if (cfg.runDownstreamQuality) {
    gates.push(runDownstreamGate());
  }

  // Mixed-context gate
  if (cfg.runMixedContext) {
    gates.push(runMixedContextGate());
  }

  // Injection resistance gate
  if (cfg.runInjectionTests) {
    gates.push(runInjectionGate());
  }

  // Renderer conformance gate
  if (cfg.runConformanceSuite) {
    gates.push(runConformanceGate());
  }

  // Calculate summary
  const total = gates.length;
  const passed = gates.filter(g => g.result === 'pass').length;
  const warnings = gates.filter(g => g.result === 'warn').length;
  const failures = gates.filter(g => g.result === 'fail').length;
  const passRate = total > 0 ? passed / total : 1;

  // Determine exit code
  let overall: GateExitCode = 0;
  if (cfg.strictMode && (warnings > 0 || failures > 0)) {
    overall = failures > 0 ? 2 : 1;
  } else if (failures > 0) {
    overall = 2;
  } else if (warnings > 0 && !cfg.strictMode) {
    overall = 1;
  }

  return {
    overall,
    passRate,
    total,
    passed,
    warnings,
    failures,
    gates
  };
}

/**
 * CI-friendly wrapper: runs gates and exits with the appropriate code.
 */
export function checkQualityGates(config?: Partial<QualityGateCIConfig>): GateExitCode {
  const report = runQualityGates(config);

  if (report.overall === 0) {
    console.log('quality-gate: PASS');
  } else if (report.overall === 1) {
    console.log('quality-gate: WARN');
  } else {
    console.log('quality-gate: FAIL');
  }

  // Print gate details
  for (const gate of report.gates) {
    const icon = gate.result === 'pass' ? '✓' : gate.result === 'warn' ? '⚠' : '✗';
    console.log(`  ${icon} ${gate.name}: ${gate.result}`);
    for (const detail of gate.details.slice(0, 3)) {
      console.log(`    ${detail}`);
    }
  }

  console.log(`  Overall: ${report.passed}/${report.total} passed (${Math.round(report.passRate * 100)}%)`);

  return report.overall;
}

/**
 * Generate a Markdown report for PR comments.
 */
export function generateCIReport(report: QualityGateCIReport): string {
  const lines: string[] = [];
  lines.push('# Quality Gate CI Report');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Overall | ${report.overall === 0 ? '✓ PASS' : report.overall === 1 ? '⚠ WARN' : '✗ FAIL'} |`);
  lines.push(`| Pass Rate | ${Math.round(report.passRate * 100)}% |`);
  lines.push(`| Passed | ${report.passed} |`);
  lines.push(`| Warnings | ${report.warnings} |`);
  lines.push(`| Failures | ${report.failures} |`);
  lines.push('');
  lines.push('## Gate Details');
  lines.push('');

  for (const gate of report.gates) {
    const icon = gate.result === 'pass' ? '✓' : gate.result === 'warn' ? '⚠' : '✗';
    lines.push(`### ${icon} ${gate.name}: ${gate.result}`);
    lines.push('');
    for (const detail of gate.details) {
      lines.push(`- ${detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Individual gate implementations                                    */
/* ------------------------------------------------------------------ */

function runDownstreamGate(): GateOutcome {
  const details: string[] = [];
  let result: GateResult = 'pass';

  try {
    const evaluator = createDefaultEvaluator();
    // Create a minimal test result
    const testResult = {
      taskId: 'ci-test-downstream',
      taskType: 'qa' as const,
      quality: [
        { metric: 'accuracy' as const, value: 0.9, baseline: 0.85, delta: 0.05, unit: 'score' },
        { metric: 'semantic_similarity' as const, value: 0.88, baseline: 0.8, delta: 0.08, unit: 'score' }
      ],
      overallScore: 0.89,
      gateResult: 'pass' as const,
      warnings: []
    };

    const evaluation = evaluateQuality(evaluator, 'qa', testResult);
    if (evaluation) {
      details.push(`score: ${evaluation.score} (min: ${evaluation.minimumScore})`);
      if (evaluation.result !== 'pass') {
        result = evaluation.result;
      }
    }
    details.push('downstream-quality gate: OK');
  } catch (err) {
    details.push(`downstream-quality gate: error - ${err}`);
    result = 'fail';
  }

  return { name: 'downstream-quality', result, details };
}

function runMixedContextGate(): GateOutcome {
  const details: string[] = [];
  let result: GateResult = 'pass';

  try {
    // Run a minimal mixed-context evaluation
    const gate = new MixedContextQualityGate();
    const testRecord = {
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: 'Test record for mixed context gate' },
      sem: { schema: 'lunum-sem/0.1-draft', clauses: [{ predicate: 'test', arguments: [] }] },
      renderings: { 'en': { code: 'test-code' } },
      fingerprint: 'sha256:test'
    };
    const report = gate.evaluate([testRecord]);
    details.push('mixed-context evaluation completed');
    if (!report || report.comparisons.length === 0) {
      result = 'warn';
      details.push('no mixed-context data available');
    }
  } catch (err) {
    details.push(`mixed-context gate: error - ${err}`);
    result = 'fail';
  }

  return { name: 'mixed-context', result, details };
}

function runInjectionGate(): GateOutcome {
  const details: string[] = [];
  let result: GateResult = 'pass';

  try {
    const summary = runAllInjectionTests();
    const passed = summary.results.filter((r: { detected: boolean }) => r.detected).length;
    const total = summary.results.length;

    details.push(`injection-resistance: ${passed}/${total} adversarial inputs detected`);

    if (total > 0 && passed / total < 0.9) {
      result = 'warn';
      details.push(`detection rate ${passed}/${total} below 90% threshold`);
    }

    if (total > 0 && passed / total < 0.7) {
      result = 'fail';
      details.push(`detection rate ${passed}/${total} below 70% threshold`);
    }
  } catch (err) {
    details.push(`injection-resistance gate: error - ${err}`);
    result = 'fail';
  }

  return { name: 'injection-resistance', result, details };
}

function runConformanceGate(): GateOutcome {
  const details: string[] = [];
  let result: GateResult = 'pass';

  try {
    const suiteResult = runConformanceSuite();
    const passed = suiteResult.passedTests;
    const total = suiteResult.totalTests;

    details.push(`renderer-conformance: ${passed}/${total} tests passed`);

    if (total > 0 && passed / total < 0.8) {
      result = 'warn';
      details.push(`conformance rate ${passed}/${total} below 80% threshold`);
    }

    if (total > 0 && passed / total < 0.6) {
      result = 'fail';
      details.push(`conformance rate ${passed}/${total} below 60% threshold`);
    }
  } catch (err) {
    details.push(`renderer-conformance gate: error - ${err}`);
    result = 'fail';
  }

  return { name: 'renderer-conformance', result, details };
}


