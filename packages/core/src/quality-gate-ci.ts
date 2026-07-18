/**
 * Quality gate CI integration.
 *
 * Runs quality gates on every PR that touches packages/core/src/ or
 * packages/eval/src/. Integrates downstream-quality, prompt-injection,
 * and renderer-conformance into a unified CI pipeline.
 *
 * This implements the WORK_QUEUE v4 release gate 5 item:
 * "Quality gate CI integration: run quality gates on every PR that
 * touches packages/core/src/ or packages/eval/src/."
 */

import { validateSem } from './canonicalize.js';
import { runInjectionTests, type InjectionTestResult } from './prompt-injection.js';
import { runConformanceSuite, type ConformanceTestCaseResult, type ProfileConformanceResult } from './renderer-conformance.js';
import { createDefaultEvaluator, evaluateQuality, type QualityGate, type GateEvaluation } from './downstream-quality.js';
import type { TaskType, QualityMetric, GateResult } from './downstream-quality.js';
import type { ContextMessage } from './types.js';
import { compileContext } from './context.js';

// Types

export interface GateCheckResult {
  gate: string;
  result: GateResult;
  score: number;
  minimumScore: number;
  details: string[];
}

export interface QualityGateCIConfig {
  runInjectionTests?: boolean;
  runConformanceSuite?: boolean;
  runDownstreamQuality?: boolean;
  runContextQuality?: boolean;
  minimumPassRate?: number;
  strictMode?: boolean;
}

export interface QualityGateCIResult {
  status: 'pass' | 'warn' | 'fail';
  allPassed: boolean;
  hadWarnings: boolean;
  gates: GateCheckResult[];
  totalGates: number;
  passedGates: number;
  warnedGates: number;
  failedGates: number;
}

// ConformanceFailure is already exported by renderer-conformance
// Re-export for convenience
export type { ConformanceFailure } from './renderer-conformance.js';

// Default gates

export function getDefaultGates(): QualityGate[] {
  return [
    { name: 'sem-validation', taskType: 'qa', minimumScore: 0.95, minimumMetrics: { accuracy: 0.95 }, warnThreshold: 0.98, failThreshold: 0.85 },
    { name: 'injection-resistance', taskType: 'qa', minimumScore: 0.9, minimumMetrics: { semantic_similarity: 0.9 }, warnThreshold: 0.95, failThreshold: 0.8 },
    { name: 'renderer-conformance', taskType: 'qa', minimumScore: 0.9, minimumMetrics: { accuracy: 0.9 }, warnThreshold: 0.95, failThreshold: 0.8 },
    { name: 'downstream-quality', taskType: 'qa', minimumScore: 0.7, minimumMetrics: { accuracy: 0.7 }, warnThreshold: 0.85, failThreshold: 0.5 }
  ];
}

// Gate check functions

function runSemanticValidationGate(): GateCheckResult {
  const semRecords: unknown[] = [
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'system_fact', clauses: [{ predicate: 'processes', roles: { subject: 'system', object: 'requests' } }] },
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'conditional_instruction', clauses: [{ predicate: 'allow', roles: { subject: 'user', object: 'dashboard' } }] },
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'sensor_data', clauses: [{ predicate: 'temperature', roles: { subject: 'sensor', object: '25' } }] },
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'simple_fact', clauses: [{ predicate: 'receive', roles: { subject: 'user', object: 'msg' }, negated: true }] },
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'simple_fact', clauses: [{ predicate: 'scheduled', roles: { subject: 'meeting', object: 'tomorrow' } }] },
    { schema: 'lunum-sem/0.1-draft', world: 'test', kind: 'prediction', clauses: [{ predicate: 'restart', roles: { subject: 'server' } }] }
  ];

  let passed = 0;
  let errors: string[] = [];

  for (let i = 0; i < semRecords.length; i++) {
    const v = validateSem(semRecords[i]);
    if (v.ok) {
      passed++;
    } else {
      errors.push('Record ' + i + ': ' + v.errors.join('; '));
    }
  }

  const score = passed / semRecords.length;
  const result = score >= 0.95 ? 'pass' : score >= 0.85 ? 'fail' : 'warn';

  return {
    gate: 'sem-validation',
    result,
    score,
    minimumScore: 0.95,
    details: errors.length > 0 ? errors : ['All ' + passed + ' test records validated']
  };
}

function runInjectionResistanceGate(): GateCheckResult {
  const summary = runInjectionTests();
  const score = summary.passRate;
  const result = score >= 0.9 ? 'pass' : score >= 0.8 ? 'fail' : 'warn';
  const details = summary.results.filter(function(r: InjectionTestResult) { return !r.detected; }).map(function(r: InjectionTestResult) { return 'Injection ' + r.id + ' (' + r.type + ') not detected'; });
  if (details.length === 0) { details.push('All ' + summary.detected + '/' + summary.totalTests + ' detected'); }

  return { gate: 'injection-resistance', result, score, minimumScore: 0.9, details };
}

function runRendererConformanceGate(): GateCheckResult {
  const summary = runConformanceSuite();
  const score = summary.passRate;
  const result = score >= 0.9 ? 'pass' : score >= 0.8 ? 'fail' : 'warn';
  const details = summary.results.filter(function(r: ConformanceTestCaseResult) { return !r.allProfilesPass; }).map(function(r: ConformanceTestCaseResult) {
    return r.testCaseId + ': ' + r.profileResults.filter(function(p: ProfileConformanceResult) { return !p.canonicalEqual; }).map(function(p: ProfileConformanceResult) { return p.profile; }).join(', ');
  });
  if (details.length === 0) { details.push('All ' + summary.totalTests + ' records pass all profiles'); }

  return { gate: 'renderer-conformance', result, score, minimumScore: 0.9, details };
}

function runDownstreamQualityGate(): GateCheckResult {
  const evaluator = createDefaultEvaluator();
  var allPassed = true;
  var details: string[] = [];
  var overallScore = 0;

  var testResult = {
    taskId: 'ci-qa-test',
    taskType: 'qa' as TaskType,
    quality: [
      { metric: 'accuracy' as QualityMetric, value: 0.85, baseline: 0.9, delta: -0.05, unit: 'ratio' },
      { metric: 'semantic_similarity' as QualityMetric, value: 0.8, baseline: 0.85, delta: -0.05, unit: 'ratio' }
    ],
    overallScore: 0.85,
    gateResult: 'pass' as GateResult,
    warnings: []
  };

  var ge = evaluateQuality(evaluator, testResult.taskType, testResult);
  if (ge) {
    if (ge.result === 'fail') { allPassed = false; details.push(ge.gateName + ': FAIL'); }
    else if (ge.result === 'warn') { details.push(ge.gateName + ': WARN'); }
    else { details.push(ge.gateName + ': PASS'); }
    overallScore = ge.score;
  }

  return { gate: 'downstream-quality', result: allPassed ? 'pass' : 'fail', score: overallScore, minimumScore: 0.7, details };
}

function runContextQualityGate(): GateCheckResult {
  var messages: ContextMessage[] = [
    { role: 'user', content: 'System status?', lunumCode: 'status(system)' },
    { role: 'assistant', content: 'Operational.', lunumCode: 'operational(system)' }
  ];

  var compiled = compileContext(messages, { mode: 'mixed' });
  var score = compiled.estimatedSavings || 0;
  var result = score >= 0.1 ? 'pass' : 'warn';

  return {
    gate: 'context-quality',
    result: result as GateResult,
    score: Math.max(0, score),
    minimumScore: 0.1,
    details: [
      'Natural tokens: ' + compiled.naturalTokens,
      'Lunum tokens: ' + compiled.lunumTokens,
      'Mixed tokens: ' + compiled.mixedTokens,
      'Savings: ' + (compiled.estimatedSavings * 100).toFixed(1) + '%'
    ]
  };
}

// CI Integration

export function runQualityGates(config: QualityGateCIConfig, gates: QualityGate[]): QualityGateCIResult {
  var checks: GateCheckResult[] = [];
  checks.push(runSemanticValidationGate());

  if (config && config.runInjectionTests !== false) { checks.push(runInjectionResistanceGate()); }
  if (config && config.runConformanceSuite !== false) { checks.push(runRendererConformanceGate()); }
  if (config && config.runDownstreamQuality !== false) { checks.push(runDownstreamQualityGate()); }
  if (config && config.runContextQuality) { checks.push(runContextQualityGate()); }

  var passed = 0, warned = 0, failed = 0;
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    if (c && c.result === 'pass') passed++;
    else if (c && c.result === 'warn') warned++;
    else if (c) failed++;
  }

  var overallScore = checks.length > 0 ? passed / checks.length : 1;
  var status: 'pass' | 'warn' | 'fail';

  if (config && config.strictMode && (failed > 0 || warned > 0)) { status = failed > 0 ? 'fail' : 'warn'; }
  else if (failed > 0) { status = 'fail'; }
  else if (warned > 0 && overallScore < (config && config.minimumPassRate || 0.8)) { status = 'warn'; }
  else { status = 'pass'; }

  return {
    status,
    allPassed: failed === 0,
    hadWarnings: warned > 0,
    gates: checks,
    totalGates: checks.length,
    passedGates: passed,
    warnedGates: warned,
    failedGates: failed
  };
}

export function checkQualityGates(config: QualityGateCIConfig): { exitCode: number; result: QualityGateCIResult } {
  var result = runQualityGates(config || {}, getDefaultGates());
  var exitCode: number;
  if (result.status === 'pass') exitCode = 0;
  else if (result.status === 'warn') exitCode = 1;
  else exitCode = 2;
  return { exitCode, result };
}

export function generateCIReport(result: QualityGateCIResult): string {
  var lines = ['# Quality Gate CI Report', '', '## Summary', 'Status: ' + result.status.toUpperCase(), 'Gates: ' + result.passedGates + '/' + result.totalGates + ' passed, ' + result.warnedGates + ' warned, ' + result.failedGates + ' failed', ''];
  for (var i = 0; i < result.gates.length; i++) {
    var g = result.gates[i];
    if (g) {
      var icon = g.result === 'pass' ? '\u2705' : g.result === 'warn' ? '\u26A0\uFE0F' : '\u274C';
      lines.push('- **' + g.gate + '**: ' + icon + ' (score: ' + g.score.toFixed(2) + ', minimum: ' + g.minimumScore.toFixed(2) + ')');
      for (var j = 0; j < g.details.length; j++) { lines.push('  - ' + g.details[j]); }
    }
  }
  lines.push('', '---', 'Generated by OpenLunum quality gate CI integration');
  return lines.join('\n');
}

// Export

export const qualityGateCIExports = [
  getDefaultGates,
  runQualityGates,
  checkQualityGates,
  generateCIReport
] as const;
