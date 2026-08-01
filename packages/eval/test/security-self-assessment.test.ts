import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_CONTROLS,
  assessControl,
  assessDomain,
  generateAssessmentReport,
  runSampleAssessment,
  type SecurityControl,
  type SecurityDomain,
  type MaturityLevel,
  type EvidenceKind,
} from '../src/security-self-assessment.js';

describe('security-self-assessment', () => {
  describe('SECURITY_CONTROLS', () => {
    it('has 14 controls', () => {
      assert.equal(SECURITY_CONTROLS.length, 14);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(SECURITY_CONTROLS));
    });

    it('covers all 8 security domains', () => {
      const domains = new Set(SECURITY_CONTROLS.map(c => c.domain));
      assert.equal(domains.size, 8);
    });

    it('each control has non-zero weight', () => {
      for (const control of SECURITY_CONTROLS) {
        assert.ok(control.weight > 0, `${control.id} has zero weight`);
      }
    });
  });

  describe('assessControl', () => {
    const control: SecurityControl = SECURITY_CONTROLS[0]!;

    it('reports no gaps when all evidence provided', () => {
      const result = assessControl(control, 'managed', [...control.requiredEvidence], ['ref1']);
      assert.equal(result.gaps.length, 0);
    });

    it('reports missing evidence', () => {
      const result = assessControl(control, 'managed', [], []);
      assert.ok(result.gaps.length > 0);
      assert.ok(result.gaps.some(g => g.includes('missing')));
    });

    it('reports not-implemented gap for none maturity', () => {
      const result = assessControl(control, 'none', [...control.requiredEvidence], ['ref1']);
      assert.ok(result.gaps.some(g => g.includes('not implemented')));
    });
  });

  describe('assessDomain', () => {
    it('calculates domain percentage', () => {
      const controls = SECURITY_CONTROLS.filter(c => c.domain === 'access-control');
      const assessments = controls.map(c =>
        assessControl(c, 'managed', [...c.requiredEvidence], ['ref']),
      );
      const result = assessDomain('access-control', assessments);
      assert.ok(result.percentage > 0);
      assert.ok(result.percentage <= 1);
      assert.equal(result.overallMaturity, 'managed');
    });

    it('returns none maturity for empty assessments', () => {
      const result = assessDomain('access-control', []);
      assert.equal(result.maturityScore, 0);
      assert.equal(result.overallMaturity, 'none');
    });

    it('returns optimized for max-maturity assessments', () => {
      const controls = SECURITY_CONTROLS.filter(c => c.domain === 'input-validation');
      const assessments = controls.map(c =>
        assessControl(c, 'optimized', [...c.requiredEvidence], ['ref']),
      );
      const result = assessDomain('input-validation', assessments);
      assert.equal(result.percentage, 1);
      assert.equal(result.overallMaturity, 'optimized');
    });
  });

  describe('generateAssessmentReport', () => {
    it('computes overall scores from domain assessments', () => {
      const controls = SECURITY_CONTROLS.filter(c => c.domain === 'access-control');
      const assessments = controls.map(c =>
        assessControl(c, 'defined', [...c.requiredEvidence], ['ref']),
      );
      const da = assessDomain('access-control', assessments);
      const report = generateAssessmentReport([da], 'test-assessor');
      assert.equal(report.assessor, 'test-assessor');
      assert.ok(report.overallScore > 0);
      assert.ok(report.overallPercentage > 0);
      assert.equal(report.version, '1.0.0');
    });

    it('identifies critical gaps', () => {
      const controls = SECURITY_CONTROLS.filter(c => c.domain === 'secret-management');
      const assessments = controls.map(c =>
        assessControl(c, 'none', [], []),
      );
      const da = assessDomain('secret-management', assessments);
      const report = generateAssessmentReport([da], 'test');
      assert.ok(report.criticalGaps.length > 0);
    });

    it('adds low-posture recommendation', () => {
      const da = assessDomain('access-control', []);
      const report = generateAssessmentReport([da], 'test');
      assert.ok(report.recommendations.some(r => r.includes('below minimum')));
    });
  });

  describe('runSampleAssessment', () => {
    it('produces a complete report', () => {
      const report = runSampleAssessment();
      assert.equal(report.version, '1.0.0');
      assert.ok(report.domains.length >= 8);
      assert.ok(report.overallScore > 0);
      assert.ok(report.overallPercentage > 0);
    });

    it('has managed maturity in sample', () => {
      const report = runSampleAssessment();
      assert.equal(report.overallMaturity, 'managed');
    });

    it('has no critical gaps in sample', () => {
      const report = runSampleAssessment();
      assert.equal(report.criticalGaps.length, 0);
    });
  });
});
