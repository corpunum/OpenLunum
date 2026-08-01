import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFinding,
  validateSession,
  generateReport,
  ALL_ATTACK_CATEGORIES,
  SAMPLE_REVIEW_SESSION,
  type RedTeamFinding,
  type RedTeamReviewSession,
  type AttackCategory,
  type FindingSeverity,
  type FindingStatus,
} from '../src/redteam-independent-review.js';

function makeFinding(overrides: Partial<RedTeamFinding> = {}): RedTeamFinding {
  return {
    id: 'TEST-001',
    category: 'negation-bypass',
    severity: 'medium',
    status: 'confirmed',
    title: 'Test finding',
    description: 'A test finding',
    reproductionSteps: 'Step 1, step 2',
    input: 'test input',
    expectedBehaviour: 'expected',
    actualBehaviour: 'actual',
    isFalsePositive: false,
    isFalseNegative: false,
    mitigationApplied: '',
    discoveredAt: '2026-08-01T00:00:00Z',
    reviewerId: 'reviewer-1',
    ...overrides,
  };
}

function makeSession(overrides: Partial<RedTeamReviewSession> = {}): RedTeamReviewSession {
  return {
    sessionId: 'session-test',
    reviewerId: 'reviewer-1',
    reviewerIndependent: true,
    startedAt: '2026-08-01T00:00:00Z',
    completedAt: '2026-08-01T02:00:00Z',
    scopeDescription: 'Test scope',
    categoriesTested: ['negation-bypass', 'literal-mutation'],
    findings: [makeFinding()],
    falsePositiveCount: 0,
    falseNegativeCount: 0,
    coverageNotes: 'Partial coverage',
    ...overrides,
  };
}

describe('redteam-independent-review', () => {
  describe('ALL_ATTACK_CATEGORIES', () => {
    it('contains 8 categories', () => {
      assert.equal(ALL_ATTACK_CATEGORIES.length, 8);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(ALL_ATTACK_CATEGORIES));
    });
  });

  describe('validateFinding', () => {
    it('accepts a valid finding', () => {
      const result = validateFinding(makeFinding());
      assert.ok(result.valid);
      assert.equal(result.errors.length, 0);
    });

    it('rejects finding with missing id', () => {
      const result = validateFinding(makeFinding({ id: '' }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('missing finding id')));
    });

    it('rejects critical findings accepted as risk', () => {
      const result = validateFinding(makeFinding({
        severity: 'critical',
        status: 'accepted-risk',
      }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('critical findings cannot be accepted')));
    });

    it('rejects invalid category', () => {
      const result = validateFinding(makeFinding({
        category: 'invalid-cat' as AttackCategory,
      }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('invalid category')));
    });
  });

  describe('validateSession', () => {
    it('accepts a valid session', () => {
      const result = validateSession(makeSession());
      assert.ok(result.valid);
      assert.equal(result.errors.length, 0);
    });

    it('rejects non-independent reviewer', () => {
      const result = validateSession(makeSession({ reviewerIndependent: false }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('reviewer must be independent')));
    });

    it('detects falsePositiveCount mismatch', () => {
      const result = validateSession(makeSession({
        findings: [makeFinding({ isFalsePositive: true })],
        falsePositiveCount: 0,
      }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('falsePositiveCount mismatch')));
    });

    it('detects falseNegativeCount mismatch', () => {
      const result = validateSession(makeSession({
        findings: [makeFinding({ isFalseNegative: true })],
        falseNegativeCount: 0,
      }));
      assert.ok(!result.valid);
      assert.ok(result.errors.some(e => e.includes('falseNegativeCount mismatch')));
    });
  });

  describe('generateReport', () => {
    it('generates report with correct totals', () => {
      const session = makeSession({
        categoriesTested: [...ALL_ATTACK_CATEGORIES],
        findings: [
          makeFinding({ id: 'F1', severity: 'critical', status: 'mitigated', category: 'negation-bypass' }),
          makeFinding({ id: 'F2', severity: 'medium', category: 'literal-mutation', isFalsePositive: true }),
          makeFinding({ id: 'F3', severity: 'low', category: 'encoding-attack', isFalseNegative: true }),
        ],
        falsePositiveCount: 1,
        falseNegativeCount: 1,
      });
      const report = generateReport([session]);
      assert.equal(report.totalFindings, 3);
      assert.equal(report.bySeverity.critical, 1);
      assert.equal(report.bySeverity.medium, 1);
      assert.equal(report.bySeverity.low, 1);
      assert.ok(report.allCriticalMitigated);
      assert.ok(report.overallAssessment.startsWith('PASS'));
    });

    it('blocks on unmitigated critical', () => {
      const session = makeSession({
        categoriesTested: [...ALL_ATTACK_CATEGORIES],
        findings: [makeFinding({ severity: 'critical', status: 'open' })],
      });
      const report = generateReport([session]);
      assert.ok(!report.allCriticalMitigated);
      assert.ok(report.overallAssessment.startsWith('BLOCKED'));
    });

    it('reports partial when categories missing', () => {
      const session = makeSession({
        categoriesTested: ['negation-bypass'],
        findings: [makeFinding()],
      });
      const report = generateReport([session]);
      assert.ok(report.overallAssessment.startsWith('PARTIAL'));
    });

    it('reports incomplete when no findings', () => {
      const session = makeSession({
        categoriesTested: [...ALL_ATTACK_CATEGORIES],
        findings: [],
      });
      const report = generateReport([session]);
      assert.ok(report.overallAssessment.startsWith('INCOMPLETE'));
    });

    it('computes false positive and negative rates', () => {
      const session = makeSession({
        categoriesTested: [...ALL_ATTACK_CATEGORIES],
        findings: [
          makeFinding({ id: 'F1', isFalsePositive: true }),
          makeFinding({ id: 'F2' }),
        ],
        falsePositiveCount: 1,
        falseNegativeCount: 0,
      });
      const report = generateReport([session]);
      assert.equal(report.falsePositiveRate, 0.5);
      assert.equal(report.falseNegativeRate, 0);
    });
  });

  describe('SAMPLE_REVIEW_SESSION', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(SAMPLE_REVIEW_SESSION));
    });

    it('validates successfully', () => {
      const result = validateSession(SAMPLE_REVIEW_SESSION as RedTeamReviewSession);
      assert.ok(result.valid, `validation errors: ${result.errors.join(', ')}`);
    });

    it('covers all 8 attack categories', () => {
      assert.equal(SAMPLE_REVIEW_SESSION.categoriesTested.length, 8);
    });

    it('has correct false positive/negative counts', () => {
      assert.equal(SAMPLE_REVIEW_SESSION.falsePositiveCount, 2);
      assert.equal(SAMPLE_REVIEW_SESSION.falseNegativeCount, 1);
    });
  });
});
