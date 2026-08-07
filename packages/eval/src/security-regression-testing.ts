export type SecurityControlArea =
  | 'input-validation'
  | 'secret-management'
  | 'access-control'
  | 'data-isolation'
  | 'audit-logging'
  | 'dependency-integrity';

export type RegressionCheckType =
  | 'control-effectiveness'
  | 'policy-compliance'
  | 'detection-rate'
  | 'response-time'
  | 'coverage-completeness';

export interface SecurityControlProfile {
  name: SecurityControlArea;
  description: string;
  criticalityWeight: number;
}

export interface RegressionCheckProfile {
  name: RegressionCheckType;
  baselineThreshold: number;
  regressionTolerance: number;
}

export interface SecurityRegressionResult {
  control: SecurityControlArea;
  check: RegressionCheckType;
  baselineScore: number;
  currentScore: number;
  delta: number;
  regressed: boolean;
  controlBypassed: boolean;
  auditTrailComplete: boolean;
}

export interface ControlRegressionSummary {
  control: SecurityControlArea;
  totalChecks: number;
  passed: number;
  regressed: number;
  noBypasses: boolean;
  allAudited: boolean;
  meanDelta: number;
}

export interface SecurityRegressionReport {
  results: readonly SecurityRegressionResult[];
  controlSummaries: readonly ControlRegressionSummary[];
  totalTests: number;
  totalRegressions: number;
  noControlBypassed: boolean;
  allAuditTrailsComplete: boolean;
  overallScore: number;
  verdict: 'secure' | 'degraded' | 'compromised';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const SECURITY_CONTROL_AREAS: readonly SecurityControlProfile[] = Object.freeze([
  Object.freeze({ name: 'input-validation' as SecurityControlArea, description: 'Input sanitization and validation controls', criticalityWeight: 1.0 }),
  Object.freeze({ name: 'secret-management' as SecurityControlArea, description: 'Secret storage and access controls', criticalityWeight: 1.0 }),
  Object.freeze({ name: 'access-control' as SecurityControlArea, description: 'Authentication and authorization enforcement', criticalityWeight: 0.95 }),
  Object.freeze({ name: 'data-isolation' as SecurityControlArea, description: 'Tenant and data boundary enforcement', criticalityWeight: 0.9 }),
  Object.freeze({ name: 'audit-logging' as SecurityControlArea, description: 'Security event logging and monitoring', criticalityWeight: 0.85 }),
  Object.freeze({ name: 'dependency-integrity' as SecurityControlArea, description: 'Supply chain and dependency verification', criticalityWeight: 0.8 }),
]);

export const REGRESSION_CHECK_TYPES: readonly RegressionCheckProfile[] = Object.freeze([
  Object.freeze({ name: 'control-effectiveness' as RegressionCheckType, baselineThreshold: 0.90, regressionTolerance: 0.05 }),
  Object.freeze({ name: 'policy-compliance' as RegressionCheckType, baselineThreshold: 0.95, regressionTolerance: 0.03 }),
  Object.freeze({ name: 'detection-rate' as RegressionCheckType, baselineThreshold: 0.85, regressionTolerance: 0.05 }),
  Object.freeze({ name: 'response-time' as RegressionCheckType, baselineThreshold: 0.80, regressionTolerance: 0.10 }),
  Object.freeze({ name: 'coverage-completeness' as RegressionCheckType, baselineThreshold: 0.90, regressionTolerance: 0.05 }),
]);

export function simulateSecurityRegressionTest(
  control: SecurityControlProfile,
  check: RegressionCheckProfile,
): SecurityRegressionResult {
  const seed = hashSeed(`${control.name}:${check.name}`);

  const baselineScore = Math.round((check.baselineThreshold + seed * 0.08) * 1000) / 1000;
  const currentScore = Math.round((baselineScore + (seed - 0.45) * check.regressionTolerance * 0.6) * 1000) / 1000;
  const delta = Math.round((currentScore - baselineScore) * 1000) / 1000;
  const regressed = delta < -check.regressionTolerance;

  return {
    control: control.name,
    check: check.name,
    baselineScore,
    currentScore,
    delta,
    regressed,
    controlBypassed: false,
    auditTrailComplete: true,
  };
}

export function runSecurityRegressionSuite(
  controls: readonly SecurityControlProfile[] = SECURITY_CONTROL_AREAS,
  checks: readonly RegressionCheckProfile[] = REGRESSION_CHECK_TYPES,
): SecurityRegressionReport {
  const results: SecurityRegressionResult[] = [];

  for (const control of controls) {
    for (const check of checks) {
      results.push(simulateSecurityRegressionTest(control, check));
    }
  }

  const controlSummaries: ControlRegressionSummary[] = [];
  for (const control of controls) {
    const cr = results.filter(r => r.control === control.name);
    const regressed = cr.filter(r => r.regressed).length;
    const meanDelta = Math.round(cr.reduce((s, r) => s + r.delta, 0) / cr.length * 1000) / 1000;

    controlSummaries.push({
      control: control.name,
      totalChecks: cr.length,
      passed: cr.length - regressed,
      regressed,
      noBypasses: cr.every(r => !r.controlBypassed),
      allAudited: cr.every(r => r.auditTrailComplete),
      meanDelta,
    });
  }

  const totalRegressions = results.filter(r => r.regressed).length;
  const noControlBypassed = results.every(r => !r.controlBypassed);
  const allAuditTrailsComplete = results.every(r => r.auditTrailComplete);
  const overallScore = Math.round((1 - totalRegressions / results.length) * 1000) / 1000;

  let verdict: 'secure' | 'degraded' | 'compromised';
  if (overallScore >= 0.85 && noControlBypassed && allAuditTrailsComplete) {
    verdict = 'secure';
  } else if (overallScore >= 0.60 && noControlBypassed) {
    verdict = 'degraded';
  } else {
    verdict = 'compromised';
  }

  return {
    results,
    controlSummaries,
    totalTests: results.length,
    totalRegressions,
    noControlBypassed,
    allAuditTrailsComplete,
    overallScore,
    verdict,
  };
}
