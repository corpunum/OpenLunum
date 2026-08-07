import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLIANCE_DOMAINS,
  AUDIT_CHECK_TYPES,
  simulateComplianceAudit,
  runComplianceAuditValidationSuite,
} from '../src/compliance-audit-validation.js';

describe('compliance-audit-validation', () => {
  describe('constants', () => {
    it('has 6 compliance domains', () => {
      assert.equal(COMPLIANCE_DOMAINS.length, 6);
    });

    it('has 4 audit check types', () => {
      assert.equal(AUDIT_CHECK_TYPES.length, 4);
    });

    it('domain names are unique', () => {
      const names = COMPLIANCE_DOMAINS.map(d => d.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('check names are unique', () => {
      const names = AUDIT_CHECK_TYPES.map(c => c.name);
      assert.equal(new Set(names).size, names.length);
    });
  });

  describe('simulateComplianceAudit', () => {
    it('returns valid result', () => {
      const r = simulateComplianceAudit(COMPLIANCE_DOMAINS[0]!, AUDIT_CHECK_TYPES[0]!);
      assert.equal(typeof r.score, 'number');
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.evidenceChainIntact, 'boolean');
      assert.equal(typeof r.auditGapDetected, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateComplianceAudit(COMPLIANCE_DOMAINS[0]!, AUDIT_CHECK_TYPES[0]!);
      const b = simulateComplianceAudit(COMPLIANCE_DOMAINS[0]!, AUDIT_CHECK_TYPES[0]!);
      assert.deepEqual(a, b);
    });

    it('evidence chain always intact', () => {
      for (const domain of COMPLIANCE_DOMAINS) {
        for (const check of AUDIT_CHECK_TYPES) {
          const r = simulateComplianceAudit(domain, check);
          assert.equal(r.evidenceChainIntact, true);
        }
      }
    });

    it('no audit gaps detected', () => {
      for (const domain of COMPLIANCE_DOMAINS) {
        for (const check of AUDIT_CHECK_TYPES) {
          const r = simulateComplianceAudit(domain, check);
          assert.equal(r.auditGapDetected, false);
        }
      }
    });
  });

  describe('runComplianceAuditValidationSuite', () => {
    it('produces correct total tests (6 × 4)', () => {
      const report = runComplianceAuditValidationSuite();
      assert.equal(report.totalTests, 6 * 4);
    });

    it('has 6 domain summaries', () => {
      const report = runComplianceAuditValidationSuite();
      assert.equal(report.domainSummaries.length, 6);
    });

    it('all evidence chains intact', () => {
      const report = runComplianceAuditValidationSuite();
      assert.equal(report.allEvidenceChainIntact, true);
    });

    it('no audit gaps', () => {
      const report = runComplianceAuditValidationSuite();
      assert.equal(report.noAuditGapsDetected, true);
    });

    it('verdict is compliant or partial-compliance', () => {
      const report = runComplianceAuditValidationSuite();
      assert.ok(report.verdict === 'compliant' || report.verdict === 'partial-compliance');
    });

    it('accepts custom inputs', () => {
      const report = runComplianceAuditValidationSuite(
        COMPLIANCE_DOMAINS.slice(0, 2),
        AUDIT_CHECK_TYPES.slice(0, 2),
      );
      assert.equal(report.totalTests, 2 * 2);
    });
  });
});
