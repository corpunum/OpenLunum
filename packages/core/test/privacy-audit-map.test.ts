import { strictEqual, deepStrictEqual, ok, throws, strict } from 'node:assert';
import { describe, it } from 'node:test';
import {
  ALL_DATA_CATEGORIES,
  ALL_AUDIT_EVENT_TYPES,
  DATA_SENSITIVITY_MAP,
  DEFAULT_RETENTION_POLICIES,
  DEFAULT_AUDIT_TAMPER_CONFIG,
  PII_PATTERNS,
  buildAuditMap,
  classifyDataCategory,
  getRetentionPolicy,
  isLikelyPii,
  retentionPoliciesAreComplete,
  verifyDataCategoryCoverage,
  verifyAuditTrailCompleteness,
  verifyAuditMapCompleteness,
  type DataCategory,
  type DataSensitivity,
  type AuditEventType,
  type PrivacyRetentionPolicy,
  type AuditEvent,
  type AuditTamperConfig,
} from '../src/privacy-audit-map.js';

describe('privacy-audit-map', () => {
  describe('ALL_DATA_CATEGORIES', () => {
    it('has exactly 10 data categories', () => {
      strictEqual(ALL_DATA_CATEGORIES.length, 10);
    });

    it('includes pii', () => {
      ok(ALL_DATA_CATEGORIES.includes('pii'));
    });

    it('includes semantic-content', () => {
      ok(ALL_DATA_CATEGORIES.includes('semantic-content'));
    });

    it('includes metadata', () => {
      ok(ALL_DATA_CATEGORIES.includes('metadata'));
    });

    it('includes all required categories: pii, semantic-content, metadata, evidence, audit-log, correlation-trace', () => {
      const required: DataCategory[] = [
        'pii',
        'semantic-content',
        'metadata',
        'evidence',
        'audit-log',
        'correlation-trace',
      ];
      for (const cat of required) {
        ok(ALL_DATA_CATEGORIES.includes(cat), `${cat} is missing from ALL_DATA_CATEGORIES`);
      }
    });
  });

  describe('ALL_AUDIT_EVENT_TYPES', () => {
    it('has 10 event types', () => {
      strictEqual(ALL_AUDIT_EVENT_TYPES.length, 10);
    });

    it('includes all required event types', () => {
      const required: AuditEventType[] = [
        'access',
        'create',
        'update',
        'delete',
        'export',
        'classify',
        'retention-expiry',
        'deletion',
        'tamper-detect',
        'policy-change',
      ];
      for (const evt of required) {
        ok(ALL_AUDIT_EVENT_TYPES.includes(evt), `${evt} is missing from ALL_AUDIT_EVENT_TYPES`);
      }
    });
  });

  describe('DATA_SENSITIVITY_MAP', () => {
    it('maps every data category to a valid sensitivity level', () => {
      const validSensitivities = new Set<DataSensitivity>(['public', 'internal', 'sensitive', 'restricted']);
      for (const [category, sensitivity] of Object.entries(DATA_SENSITIVITY_MAP)) {
        ok(validSensitivities.has(sensitivity), `Sensitivity "${sensitivity}" for ${category} is not valid`);
      }
    });

    it('maps exactly the same categories as ALL_DATA_CATEGORIES', () => {
      strictEqual(Object.keys(DATA_SENSITIVITY_MAP).length, ALL_DATA_CATEGORIES.length);
      for (const cat of ALL_DATA_CATEGORIES) {
        ok(cat in DATA_SENSITIVITY_MAP, `${cat} is missing from DATA_SENSITIVITY_MAP`);
      }
    });

    it('pii is sensitive', () => {
      strictEqual(DATA_SENSITIVITY_MAP['pii'], 'sensitive');
    });

    it('credential is restricted', () => {
      strictEqual(DATA_SENSITIVITY_MAP['credential'], 'restricted');
    });

    it('evidence is public', () => {
      strictEqual(DATA_SENSITIVITY_MAP['evidence'], 'public');
    });
  });

  describe('DEFAULT_RETENTION_POLICIES', () => {
    it('has a policy for every data category', () => {
      strictEqual(DEFAULT_RETENTION_POLICIES.length, ALL_DATA_CATEGORIES.length);
      for (const cat of ALL_DATA_CATEGORIES) {
        ok(
          DEFAULT_RETENTION_POLICIES.some((p) => p.category === cat),
          `No retention policy for ${cat}`,
        );
      }
    });

    it('all retention days are positive', () => {
      for (const policy of DEFAULT_RETENTION_POLICIES) {
        strict(policy.retentionDays > 0, `retentionDays for ${policy.category} is not positive`);
      }
    });

    it('all deletion methods are valid', () => {
      const validMethods = new Set<PrivacyRetentionPolicy['deletionMethod']>(['delete', 'secure-delete', 'archive']);
      for (const policy of DEFAULT_RETENTION_POLICIES) {
        ok(
          validMethods.has(policy.deletionMethod),
          `Invalid deletionMethod "${policy.deletionMethod}" for ${policy.category}`,
        );
      }
    });

    it('pii and credential use secure-delete', () => {
      const piiPolicy = getRetentionPolicy('pii');
      const credPolicy = getRetentionPolicy('credential');
      strictEqual(piiPolicy?.deletionMethod, 'secure-delete');
      strictEqual(credPolicy?.deletionMethod, 'secure-delete');
    });

    it('evidence and audit-log use archive', () => {
      const evidencePolicy = getRetentionPolicy('evidence');
      const auditPolicy = getRetentionPolicy('audit-log');
      strictEqual(evidencePolicy?.deletionMethod, 'archive');
      strictEqual(auditPolicy?.deletionMethod, 'archive');
    });

    it('credential has the shortest retention (1 day)', () => {
      const credPolicy = getRetentionPolicy('credential');
      strictEqual(credPolicy?.retentionDays, 1);
    });

    it('evidence has the longest retention (3650 days / 10 years)', () => {
      const evidencePolicy = getRetentionPolicy('evidence');
      strictEqual(evidencePolicy?.retentionDays, 3650);
    });

    it('audit-log has the longest retention (3650 days / 10 years)', () => {
      const auditPolicy = getRetentionPolicy('audit-log');
      strictEqual(auditPolicy?.retentionDays, 3650);
    });

    it('pii requires audit on deletion', () => {
      const piiPolicy = getRetentionPolicy('pii');
      strictEqual(piiPolicy?.auditRequired, true);
    });

    it('credential requires audit on deletion', () => {
      const credPolicy = getRetentionPolicy('credential');
      strictEqual(credPolicy?.auditRequired, true);
    });

    it('evidence requires audit', () => {
      const evidencePolicy = getRetentionPolicy('evidence');
      strictEqual(evidencePolicy?.auditRequired, true);
    });

    it('audit-log requires audit', () => {
      const auditPolicy = getRetentionPolicy('audit-log');
      strictEqual(auditPolicy?.auditRequired, true);
    });

    it('user-input requires audit on deletion', () => {
      const userInputPolicy = getRetentionPolicy('user-input');
      strictEqual(userInputPolicy?.auditRequired, true);
    });

    it('correlation-trace does not require audit', () => {
      const tracePolicy = getRetentionPolicy('correlation-trace');
      strictEqual(tracePolicy?.auditRequired, false);
    });

    it('configuration does not require audit', () => {
      const configPolicy = getRetentionPolicy('configuration');
      strictEqual(configPolicy?.auditRequired, false);
    });
  });

  describe('PII_PATTERNS', () => {
    it('has 12 patterns', () => {
      strictEqual(PII_PATTERNS.length, 12);
    });

    it('detects email as PII', () => {
      ok(isLikelyPii('email'));
      ok(isLikelyPii('user_email'));
    });

    it('detects phone as PII', () => {
      ok(isLikelyPii('phone'));
      ok(isLikelyPii('mobile_number'));
    });

    it('detects SSN as PII', () => {
      ok(isLikelyPii('ssn'));
      ok(isLikelyPii('social_security_number'));
    });

    it('detects IP address as PII', () => {
      ok(isLikelyPii('ip_address'));
      ok(isLikelyPii('ipaddr'));
    });

    it('rejects non-PII fields', () => {
      ok(!isLikelyPii('correlationId'));
      ok(!isLikelyPii('timestamp'));
      ok(!isLikelyPii('lunumSemVersion'));
    });
  });

  describe('getRetentionPolicy', () => {
    it('returns the correct policy for pii', () => {
      const policy = getRetentionPolicy('pii');
      ok(policy);
      strictEqual(policy!.category, 'pii');
      strictEqual(policy!.retentionDays, 90);
      strictEqual(policy!.deletionMethod, 'secure-delete');
      strictEqual(policy!.auditRequired, true);
    });

    it('returns the correct policy for semantic-content', () => {
      const policy = getRetentionPolicy('semantic-content');
      ok(policy);
      strictEqual(policy!.category, 'semantic-content');
      strictEqual(policy!.retentionDays, 365);
      strictEqual(policy!.deletionMethod, 'delete');
    });

    it('returns undefined for unknown categories', () => {
      strictEqual(getRetentionPolicy('nonexistent' as DataCategory), undefined);
    });
  });

  describe('retentionPoliciesAreComplete', () => {
    it('returns true when all categories have policies', () => {
      ok(retentionPoliciesAreComplete());
    });
  });

  describe('classifyDataCategory', () => {
    it('returns the correct sensitivity for each category', () => {
      deepStrictEqual(
        ALL_DATA_CATEGORIES.map((cat) => classifyDataCategory(cat)),
        ALL_DATA_CATEGORIES.map((cat) => DATA_SENSITIVITY_MAP[cat]),
      );
    });
  });

  describe('verifyDataCategoryCoverage', () => {
    it('returns true when all categories are covered', () => {
      ok(verifyDataCategoryCoverage());
    });
  });

  describe('verifyAuditTrailCompleteness', () => {
    it('returns true when critical categories have audit logging', () => {
      ok(verifyAuditTrailCompleteness());
    });
  });

  describe('buildAuditMap', () => {
    it('returns one entry per data category', () => {
      const map = buildAuditMap();
      strictEqual(map.length, ALL_DATA_CATEGORIES.length);
    });

    it('each entry has non-empty applicable audit events', () => {
      const map = buildAuditMap();
      for (const entry of map) {
        strict(entry.applicableAuditEvents.length > 0, `${entry.category} has no applicable audit events`);
      }
    });

    it('categories requiring audit have more event types than those that do not', () => {
      const map = buildAuditMap();
      const auditEntry = map.find((e) => e.auditRequired)!;
      const noAuditEntry = map.find((e) => !e.auditRequired)!;
      strict(
        auditEntry.applicableAuditEvents.length > noAuditEntry.applicableAuditEvents.length,
        'Audit-required category should have more applicable events',
      );
    });

    it('each entry preserves category, sensitivity, and retention from source data', () => {
      const map = buildAuditMap();
      for (const entry of map) {
        strictEqual(entry.sensitivity, classifyDataCategory(entry.category));
        const policy = getRetentionPolicy(entry.category);
        strictEqual(entry.retention.category, policy!.category);
        strictEqual(entry.retention.retentionDays, policy!.retentionDays);
        strictEqual(entry.retention.deletionMethod, policy!.deletionMethod);
        strictEqual(entry.auditRequired, policy!.auditRequired);
      }
    });
  });

  describe('verifyAuditMapCompleteness', () => {
    it('returns true when the audit map is complete', () => {
      ok(verifyAuditMapCompleteness());
    });
  });

  describe('DEFAULT_AUDIT_TAMPER_CONFIG', () => {
    it('has hashContent enabled', () => {
      strictEqual(DEFAULT_AUDIT_TAMPER_CONFIG.hashContent, true);
    });

    it('has chainIntegrity enabled', () => {
      strictEqual(DEFAULT_AUDIT_TAMPER_CONFIG.chainIntegrity, true);
    });

    it('has chain retention of 10 years', () => {
      strictEqual(DEFAULT_AUDIT_TAMPER_CONFIG.chainRetentionDays, 3650);
    });
  });
});
