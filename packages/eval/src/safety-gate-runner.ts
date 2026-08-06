export type SafetyGateType =
  | 'negation-preservation'
  | 'role-identity'
  | 'protected-literal'
  | 'prohibited-domain'
  | 'modality-preservation'
  | 'condition-integrity'
  | 'obligation-permission';

export type SafetyGateRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type SafetyGateScenario =
  | 'valid-pass'
  | 'boundary-pass'
  | 'boundary-fail'
  | 'clear-fail'
  | 'adversarial';

export interface SafetyGateProfile {
  type: SafetyGateType;
  description: string;
  defaultRisk: SafetyGateRiskLevel;
}

export interface SafetyGateExecutionResult {
  gate: SafetyGateType;
  risk: SafetyGateRiskLevel;
  scenario: SafetyGateScenario;
  triggered: boolean;
  confidence: number;
  falsePositiveRisk: number;
  falseNegativeRisk: number;
}

export interface SafetyGateSummary {
  gate: SafetyGateType;
  totalScenarios: number;
  correctDetections: number;
  detectionRate: number;
  meanConfidence: number;
}

export interface SafetyRiskSummary {
  risk: SafetyGateRiskLevel;
  totalTests: number;
  passed: number;
  passRate: number;
}

export interface SafetyGateReport {
  results: readonly SafetyGateExecutionResult[];
  gateSummaries: readonly SafetyGateSummary[];
  riskSummaries: readonly SafetyRiskSummary[];
  totalTests: number;
  criticalHighPassRate: number;
  verdict: 'safe' | 'conditional' | 'unsafe';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const SAFETY_GATE_TYPES: readonly SafetyGateProfile[] = Object.freeze([
  Object.freeze({ type: 'negation-preservation' as SafetyGateType, description: 'Detects negation flips', defaultRisk: 'critical' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'role-identity' as SafetyGateType, description: 'Detects role swaps', defaultRisk: 'critical' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'protected-literal' as SafetyGateType, description: 'Preserves protected values', defaultRisk: 'high' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'prohibited-domain' as SafetyGateType, description: 'Blocks prohibited domains', defaultRisk: 'critical' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'modality-preservation' as SafetyGateType, description: 'Detects modality changes', defaultRisk: 'high' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'condition-integrity' as SafetyGateType, description: 'Detects condition changes', defaultRisk: 'medium' as SafetyGateRiskLevel }),
  Object.freeze({ type: 'obligation-permission' as SafetyGateType, description: 'Detects obligation-permission swaps', defaultRisk: 'high' as SafetyGateRiskLevel }),
]);

export const RISK_LEVELS: readonly SafetyGateRiskLevel[] = Object.freeze([
  'critical' as SafetyGateRiskLevel,
  'high' as SafetyGateRiskLevel,
  'medium' as SafetyGateRiskLevel,
  'low' as SafetyGateRiskLevel,
]);

export const GATE_SCENARIOS: readonly SafetyGateScenario[] = Object.freeze([
  'valid-pass' as SafetyGateScenario,
  'boundary-pass' as SafetyGateScenario,
  'boundary-fail' as SafetyGateScenario,
  'clear-fail' as SafetyGateScenario,
  'adversarial' as SafetyGateScenario,
]);

function shouldTrigger(scenario: SafetyGateScenario): boolean {
  return scenario === 'boundary-fail' || scenario === 'clear-fail' || scenario === 'adversarial';
}

export function simulateGateExecution(
  gate: SafetyGateProfile,
  risk: SafetyGateRiskLevel,
  scenario: SafetyGateScenario,
): SafetyGateExecutionResult {
  const seed = hashSeed(`${gate.type}:${risk}:${scenario}`);
  const expectTriggered = shouldTrigger(scenario);

  const riskMultiplier =
    risk === 'critical' ? 1.0 :
    risk === 'high' ? 0.9 :
    risk === 'medium' ? 0.8 : 0.7;

  let confidence: number;
  let triggered: boolean;

  if (scenario === 'clear-fail') {
    triggered = true;
    confidence = Math.min(1, 0.92 + riskMultiplier * 0.06 + seed * 0.02);
  } else if (scenario === 'adversarial') {
    triggered = true;
    confidence = Math.min(1, 0.7 + riskMultiplier * 0.15 + seed * 0.05);
  } else if (scenario === 'boundary-fail') {
    triggered = true;
    confidence = Math.min(1, 0.6 + riskMultiplier * 0.2 + seed * 0.08);
  } else if (scenario === 'boundary-pass') {
    triggered = false;
    confidence = Math.min(1, 0.75 + riskMultiplier * 0.1 + seed * 0.05);
  } else {
    triggered = false;
    confidence = Math.min(1, 0.9 + riskMultiplier * 0.05 + seed * 0.03);
  }

  const correctDetection = triggered === expectTriggered;
  const falsePositiveRisk = !expectTriggered && triggered ? 0.8 + seed * 0.2 : seed * 0.05;
  const falseNegativeRisk = expectTriggered && !triggered ? 0.9 + seed * 0.1 : seed * 0.03;

  return {
    gate: gate.type,
    risk,
    scenario,
    triggered,
    confidence: Math.round(confidence * 1000) / 1000,
    falsePositiveRisk: Math.round(falsePositiveRisk * 1000) / 1000,
    falseNegativeRisk: Math.round(falseNegativeRisk * 1000) / 1000,
  };
}

export function runSafetyGateSuite(
  gates: readonly SafetyGateProfile[] = SAFETY_GATE_TYPES,
  risks: readonly SafetyGateRiskLevel[] = RISK_LEVELS,
  scenarios: readonly SafetyGateScenario[] = GATE_SCENARIOS,
): SafetyGateReport {
  const results: SafetyGateExecutionResult[] = [];

  for (const gate of gates) {
    for (const risk of risks) {
      for (const scenario of scenarios) {
        results.push(simulateGateExecution(gate, risk, scenario));
      }
    }
  }

  const gateSummaries: SafetyGateSummary[] = [];
  for (const gate of gates) {
    const gateResults = results.filter(r => r.gate === gate.type);
    let correct = 0;
    for (const r of gateResults) {
      const expected = shouldTrigger(r.scenario);
      if (r.triggered === expected) correct++;
    }
    const meanConf = gateResults.reduce((s, r) => s + r.confidence, 0) / gateResults.length;
    gateSummaries.push({
      gate: gate.type,
      totalScenarios: gateResults.length,
      correctDetections: correct,
      detectionRate: Math.round((correct / gateResults.length) * 1000) / 1000,
      meanConfidence: Math.round(meanConf * 1000) / 1000,
    });
  }

  const riskSummaries: SafetyRiskSummary[] = [];
  for (const risk of risks) {
    const riskResults = results.filter(r => r.risk === risk);
    let passed = 0;
    for (const r of riskResults) {
      const expected = shouldTrigger(r.scenario);
      if (r.triggered === expected) passed++;
    }
    riskSummaries.push({
      risk,
      totalTests: riskResults.length,
      passed,
      passRate: Math.round((passed / riskResults.length) * 1000) / 1000,
    });
  }

  const critHighResults = results.filter(r => r.risk === 'critical' || r.risk === 'high');
  let critHighPassed = 0;
  for (const r of critHighResults) {
    const expected = shouldTrigger(r.scenario);
    if (r.triggered === expected) critHighPassed++;
  }
  const criticalHighPassRate = Math.round((critHighPassed / critHighResults.length) * 1000) / 1000;

  let verdict: 'safe' | 'conditional' | 'unsafe';
  if (criticalHighPassRate >= 0.95) {
    verdict = 'safe';
  } else if (criticalHighPassRate >= 0.8) {
    verdict = 'conditional';
  } else {
    verdict = 'unsafe';
  }

  return {
    results,
    gateSummaries,
    riskSummaries,
    totalTests: results.length,
    criticalHighPassRate,
    verdict,
  };
}
