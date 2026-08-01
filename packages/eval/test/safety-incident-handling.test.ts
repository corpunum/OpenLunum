/**
 * Tests for rollback and incident handling for semantic safety
 * defects (R6.7, issue #561).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRollbackPlan,
  validateRollbackPlan,
  simulateSafetyIncident,
  SAFETY_DEFECT_SCENARIOS,
  type SafetyDefect,
  type SafetyDefectType,
  type RollbackPlan,
  type IncidentPhaseName,
} from '../src/safety-incident-handling.js';

// ── Helpers ────────────────────────────────────────────────────────

const sampleDefect: SafetyDefect = {
  id: 'TEST-001',
  type: 'false-positive-match',
  description: 'Test defect for unit tests',
  severity: 'high',
  affectedVersions: ['1.0.0', '1.0.1'],
  discoveredAt: '2026-07-01T12:00:00Z',
};

const safeVersion = '0.9.0';

// ── createRollbackPlan ─────────────────────────────────────────────

describe('createRollbackPlan', () => {
  it('generates a plan with 5 steps', () => {
    const plan = createRollbackPlan(sampleDefect, safeVersion);
    assert.strictEqual(plan.steps.length, 5);
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      assert.ok(step, `Step at index ${i} should exist`);
      assert.strictEqual(step.order, i + 1);
    }
  });

  it('includes correct defect and version', () => {
    const plan = createRollbackPlan(sampleDefect, safeVersion);
    assert.deepStrictEqual(plan.defect, sampleDefect);
    assert.strictEqual(plan.rollbackToVersion, safeVersion);
  });
});

// ── validateRollbackPlan ───────────────────────────────────────────

describe('validateRollbackPlan', () => {
  it('passes for a complete plan', () => {
    const plan = createRollbackPlan(sampleDefect, safeVersion);
    const result = validateRollbackPlan(plan);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.issues.length, 0);
  });

  it('fails for a plan with missing verifications', () => {
    const badPlan: RollbackPlan = {
      defect: sampleDefect,
      rollbackToVersion: safeVersion,
      steps: [
        { order: 1, action: 'Step one', automated: true, verification: '' },
        { order: 2, action: 'Step two', automated: false, verification: 'ok' },
        { order: 3, action: 'Step three', automated: true, verification: '' },
      ],
      verificationChecks: ['check-1'],
      estimatedDowntimeMinutes: 10,
    };
    const result = validateRollbackPlan(badPlan);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.length >= 2, 'Should report at least 2 issues for missing verifications');
  });
});

// ── SAFETY_DEFECT_SCENARIOS ────────────────────────────────────────

describe('SAFETY_DEFECT_SCENARIOS', () => {
  it('has 5 entries, one per defect type', () => {
    assert.strictEqual(SAFETY_DEFECT_SCENARIOS.length, 5);

    const expectedTypes: SafetyDefectType[] = [
      'false-positive-match',
      'false-negative-mismatch',
      'role-swap-undetected',
      'negation-missed',
      'literal-corruption',
    ];

    const actualTypes = SAFETY_DEFECT_SCENARIOS.map((s) => s.type);
    for (const t of expectedTypes) {
      assert.ok(actualTypes.includes(t), `Missing defect type: ${t}`);
    }
  });
});

// ── simulateSafetyIncident ─────────────────────────────────────────

describe('simulateSafetyIncident', () => {
  it('has all 6 phases', () => {
    const timeline = simulateSafetyIncident(sampleDefect);

    const expectedPhases: IncidentPhaseName[] = [
      'detection',
      'assessment',
      'containment',
      'rollback',
      'verification',
      'postmortem',
    ];

    assert.strictEqual(timeline.phases.length, 6);
    const phaseNames = timeline.phases.map((p) => p.name);
    assert.deepStrictEqual(phaseNames, expectedPhases);

    for (const phase of timeline.phases) {
      assert.ok(phase.actions.length > 0, `Phase "${phase.name}" should have actions`);
      assert.ok(phase.startedAt, `Phase "${phase.name}" should have startedAt`);
      assert.ok(phase.completedAt, `Phase "${phase.name}" should have completedAt`);
    }
  });

  it('includes lessons learned', () => {
    const timeline = simulateSafetyIncident(sampleDefect);
    assert.ok(timeline.lessonsLearned.length > 0, 'Should include at least one lesson learned');
    assert.strictEqual(timeline.defectId, sampleDefect.id);
    assert.ok(timeline.totalDurationMinutes > 0, 'Total duration should be positive');
  });
});
