/**
 * Quality Gate CI Integration
 *
 * Unified gate runner for CI pipelines. Runs configured quality gates
 * and returns exit codes suitable for CI: 0 (pass), 1 (warn), 2 (fail).
 *
 * This implements WORK_QUEUE v4 release gate 5:
 * "Quality gate CI integration: run quality gates on every PR that
 *  touches packages/core/src/ or packages/eval/src/."
 */

import { evaluateQuality, createDefaultEvaluator, validateGate } from './downstream-quality.js';
import type { DownstreamTaskResult, QualityGate, GateResult } from './downstream-quality.js';
import type { LunumRecord } from './types.js';

// ── Gate Exit Code ─────────────────────────────────────────────────

/** Exit code for CI integration. */
export type GateExitCode = 0 | 1 | 2;

// ── Configuration ──────────────────────────────────────────────────

export interface QualityGateCIConfig {
  /** Minimum pass rate for overall gate (0-1). */
  minimumPassRate?: number;
  /** Whether to run in strict mode (warns become failures). */
  strictMode?: boolean;
  /** Custom quality gates to evaluate. */
  gates?: QualityGate[];
}

// ── Result Types ───────────────────────────────────────────────────

export interface GateRunResult {
  /** Gate name. */
  name: string;
  /** Overall result. */
  result: GateResult;
  /** Score achieved. */
  score: number;
  /** Warnings from the gate. */
  warnings: string[];
  /** Whether the gate passed. */
  passed: boolean;
}

export interface QualityGateCIReport {
  /** Total gates run. */
  total: number;
  /** Gates that passed. */
  passed: number;
  /** Gates with warnings. */
  warned: number;
  /** Gates that failed. */
  failed: number;
  /** Exit code for CI. */
  exitCode: GateExitCode;
  /** Individual gate results. */
  gates: GateRunResult[];
  /** Whether overall run passed. */
  ok: boolean;
}

// ── Runner ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<QualityGateCIConfig> = {
  minimumPassRate: 0.8,
  strictMode: false,
  gates: [],
};

/**
 * Run a downstream task result through quality gates.
 */
export function runGate(
  gateName: string,
  taskResult: DownstreamTaskResult,
  gates?: QualityGate[]
): GateRunResult {
  const evaluator = gates && gates.length > 0
    ? { gates, results: [] }
    : createDefaultEvaluator();

  const evalResult = evaluateQuality(evaluator, taskResult.taskType, taskResult);

  if (!evalResult) {
    return {
      name: gateName,
      result: 'warn',
      score: taskResult.overallScore,
      warnings: ['No matching gate found for task type'],
      passed: false
    };
  }

  return {
    name: gateName,
    result: evalResult.result,
    score: taskResult.overallScore,
    warnings: evalResult.warnings,
    passed: evalResult.result === 'pass'
  };
}

/**
 * Run all quality gates and produce a CI report.
 */
export function runQualityGates(
  results: DownstreamTaskResult[],
  config?: QualityGateCIConfig
): QualityGateCIReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const gateResults: GateRunResult[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = runGate(`gate-${i}`, results[i]!, cfg.gates);
    gateResults.push(r);
  }

  let passed = 0;
  let warned = 0;
  let failed = 0;

  for (const g of gateResults) {
    if (cfg.strictMode && g.result === 'warn') {
      g.result = 'fail';
      g.passed = false;
    }
    if (g.result === 'pass') passed++;
    else if (g.result === 'warn') warned++;
    else failed++;
  }

  const total = gateResults.length;
  // Empty results are considered ok (no gates to fail)
  const passRate = total > 0 ? passed / total : 1;
  const ok = passRate >= cfg.minimumPassRate && failed === 0;

  // Exit code: 0=pass, 1=warn, 2=fail
  let exitCode: GateExitCode = 0;
  if (failed > 0 || !ok) exitCode = 2;
  else if (warned > 0) exitCode = 1;

  return {
    total,
    passed,
    warned,
    failed,
    exitCode,
    gates: gateResults,
    ok
  };
}

/**
 * CI-friendly wrapper that returns an exit code.
 * Throws on exit code 2 (fail).
 */
export function checkQualityGates(
  results: DownstreamTaskResult[],
  config?: QualityGateCIConfig
): GateExitCode {
  const report = runQualityGates(results, config);
  if (report.exitCode === 2) {
    const names = report.gates.filter(g => g.result === 'fail').map(g => g.name).join(', ');
    throw new Error(`Quality gates failed (${names})`);
  }
  if (report.exitCode === 1 && report.gates.some(g => g.result === 'warn')) {
    const names = report.gates.filter(g => g.result === 'warn').map(g => g.name).join(', ');
    console.warn(`Quality gate warnings (${names})`);
  }
  return report.exitCode;
}

// ── Validation ─────────────────────────────────────────────────────

/**
 * Validate the quality gate configuration.
 */
export function validateCIConfig(config: QualityGateCIConfig): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.minimumPassRate !== undefined && (config.minimumPassRate < 0 || config.minimumPassRate > 1)) {
    errors.push('minimumPassRate must be between 0 and 1');
  }

  if (config.gates) {
    for (const gate of config.gates) {
      const gateValidation = validateGate(gate);
      if (!gateValidation.ok) {
        errors.push(`Gate "${gate.name || 'unnamed'}": ${gateValidation.errors.join(', ')}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
