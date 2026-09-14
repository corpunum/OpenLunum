import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTenantId,
  tenantScopePrefix,
  scopeSemToTenant,
  recordBelongsToTenant,
  filterByTenant,
  verifyNoCrossTenantLeakage,
  tenantScopedSurfaceFingerprint,
  fingerprintBelongsToTenant,
  auditForSecrets,
  roleAllowsAccess,
  getRoleDefinition,
  verifyEvidenceIsolation,
  parseTenantContext,
  injectTenantHeaders,
  type TenantScopedRecord,
  type TenantEvidence,
  type TenantId,
} from '../src/tenant-isolation.js';

// ── Tenant ID validation ───────────────────────────────────────────

describe('isValidTenantId', () => {
  it('accepts valid alphanumeric tenant IDs', () => {
    assert.strictEqual(isValidTenantId('acme-corp'), true);
    assert.strictEqual(isValidTenantId('tenant_01'), true);
    assert.strictEqual(isValidTenantId('A1b2C3'), true);
  });

  it('rejects empty strings', () => {
    assert.strictEqual(isValidTenantId(''), false);
  });

  it('rejects IDs with spaces or special chars', () => {
    assert.strictEqual(isValidTenantId('acme corp'), false);
    assert.strictEqual(isValidTenantId('acme/corp'), false);
    assert.strictEqual(isValidTenantId('acme.corp'), false);
  });

  it('rejects IDs longer than 128 characters', () => {
    assert.strictEqual(isValidTenantId('a'.repeat(129)), false);
  });

  it('accepts IDs at the maximum length', () => {
    assert.strictEqual(isValidTenantId('a'.repeat(128)), true);
  });
});

// ── Tenant scope prefix ────────────────────────────────────────────

describe('tenantScopePrefix', () => {
  it('produces deterministic 16-char hex prefixes', () => {
    const prefix = tenantScopePrefix('acme-corp');
    assert.strictEqual(prefix.length, 16);
    assert.match(prefix, /^[0-9a-f]{16}$/);
    // Deterministic
    assert.strictEqual(tenantScopePrefix('acme-corp'), prefix);
  });

  it('produces different prefixes for different tenants', () => {
    const prefixA = tenantScopePrefix('tenant-a');
    const prefixB = tenantScopePrefix('tenant-b');
    assert.notStrictEqual(prefixA, prefixB);
  });
});

// ── Tenant-scoped semantic records ─────────────────────────────────

describe('scopeSemToTenant', () => {
  it('scopes a semantic record to a tenant', () => {
    const sem = {
      schema: 'lunum/sem/1.0',
      world: 'world-1',
      kind: 'fact',
      clauses: [{ predicate: 'X holds', roles: {} }],
    };
    const record = scopeSemToTenant(sem, 'acme-corp');

    assert.strictEqual(record.tenantId, 'acme-corp');
    assert.strictEqual(record.recordVersion, '1.0');
    assert.ok(record.fingerprint.startsWith('lfp:1.0:sha256:'));
    assert.strictEqual(record.sem.annotations?.['__tenant__'], 'acme-corp');
  });

  it('rejects invalid tenant IDs', () => {
    assert.throws(
      () => scopeSemToTenant({} as any, ''),
      /Invalid tenant ID/
    );
  });

  it('produces unique fingerprints for different tenants', () => {
    const sem = {
      schema: 'lunum/sem/1.0',
      world: 'w',
      kind: 'f',
      clauses: [{ predicate: 'X holds', roles: {} }],
    };
    const recA = scopeSemToTenant(sem, 'tenant-a');
    const recB = scopeSemToTenant(sem, 'tenant-b');

    assert.notStrictEqual(recA.fingerprint, recB.fingerprint);
  });
});

describe('recordBelongsToTenant', () => {
  it('returns true for matching tenant', () => {
    const record = scopeSemToTenant(
      { schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] },
      'acme-corp'
    );
    assert.strictEqual(recordBelongsToTenant(record, 'acme-corp'), true);
  });

  it('returns false for different tenant', () => {
    const record = scopeSemToTenant(
      { schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] },
      'acme-corp'
    );
    assert.strictEqual(recordBelongsToTenant(record, 'other-corp'), false);
  });
});

describe('filterByTenant', () => {
  it('returns only records matching the requested tenant', () => {
    const records: TenantScopedRecord[] = [
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-a'),
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-b'),
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-a'),
    ];

    const filtered = filterByTenant(records, 'tenant-a');
    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every((r) => r.tenantId === 'tenant-a'));
  });

  it('returns empty array for non-matching tenant', () => {
    const records: TenantScopedRecord[] = [
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-a'),
    ];
    const filtered = filterByTenant(records, 'tenant-b');
    assert.strictEqual(filtered.length, 0);
  });
});

describe('verifyNoCrossTenantLeakage', () => {
  it('passes when all records are properly scoped', () => {
    const records: TenantScopedRecord[] = [
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-a'),
      scopeSemToTenant({ schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] }, 'tenant-b'),
    ];
    const result = verifyNoCrossTenantLeakage(records);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.violations.length, 0);
  });

  it('detects mismatched tenant annotation', () => {
    const record = scopeSemToTenant(
      { schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] },
      'tenant-a'
    );
    // Manually corrupt the annotation
    (record.sem.annotations as Record<string, unknown>)['__tenant__'] = 'tenant-b';
    const result = verifyNoCrossTenantLeakage([record]);
    assert.strictEqual(result.ok, false);
    assert.ok(result.violations.some((v) => v.includes('tenant annotation')));
  });

  it('detects mismatched fingerprint scope', () => {
    const record = scopeSemToTenant(
      { schema: 'lunum/sem/1.0', world: 'w', kind: 'f', clauses: [{ predicate: 'X holds', roles: {} }] },
      'tenant-a'
    );
    // Manually corrupt the fingerprint via type assertion
    (record as unknown as { fingerprint: string }).fingerprint = 'lfp:1.0:sha256:0000000000000000';
    const result = verifyNoCrossTenantLeakage([record]);
    assert.strictEqual(result.ok, false);
    assert.ok(result.violations.some((v) => v.includes('scope prefix')));
  });
});

// ── Tenant-scoped fingerprints ─────────────────────────────────────

describe('tenantScopedSurfaceFingerprint', () => {
  it('produces deterministic fingerprints', () => {
    const fp1 = tenantScopedSurfaceFingerprint('hello world', 'tenant-a');
    const fp2 = tenantScopedSurfaceFingerprint('hello world', 'tenant-a');
    assert.strictEqual(fp1, fp2);
  });

  it('produces different fingerprints for different tenants', () => {
    const fpA = tenantScopedSurfaceFingerprint('hello', 'tenant-a');
    const fpB = tenantScopedSurfaceFingerprint('hello', 'tenant-b');
    assert.notStrictEqual(fpA, fpB);
  });

  it('produces fingerprints in the expected format', () => {
    const fp = tenantScopedSurfaceFingerprint('test', 'tenant-x');
    assert.match(fp, /^lsf:1\.0:sha256:/);
  });
});

describe('fingerprintBelongsToTenant', () => {
  it('returns true for a fingerprint scoped to the tenant', () => {
    const fp = tenantScopedSurfaceFingerprint('test', 'tenant-a');
    assert.strictEqual(fingerprintBelongsToTenant(fp, 'tenant-a'), true);
  });

  it('returns false for a fingerprint scoped to a different tenant', () => {
    const fp = tenantScopedSurfaceFingerprint('test', 'tenant-a');
    assert.strictEqual(fingerprintBelongsToTenant(fp, 'tenant-b'), false);
  });
});

// ── Secret detection ───────────────────────────────────────────────

describe('auditForSecrets', () => {
  it('detects OpenAI-style API keys', () => {
    const content = 'config.apiKey = "sk-abc123def456ghi789jkl012mno345";\n';
    const findings = auditForSecrets(content);
    const openai = findings.find((f) => f.pattern === 'openai-api-key');
    assert.ok(openai);
    assert.strictEqual(openai!.kind, 'api-key');
    assert.strictEqual(openai!.line, 1);
    assert.ok(openai!.excerpt.includes('***'));
  });

  it('detects AWS access keys', () => {
    const content = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE12345\n';
    const findings = auditForSecrets(content);
    const aws = findings.find((f) => f.pattern === 'aws-access-key');
    assert.ok(aws);
    assert.strictEqual(aws!.kind, 'api-key');
  });

  it('detects bearer tokens', () => {
    const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz\n';
    const findings = auditForSecrets(content);
    const bearer = findings.find((f) => f.pattern === 'bearer-token');
    assert.ok(bearer);
    assert.strictEqual(bearer!.kind, 'bearer-token');
  });

  it('detects Basic auth credentials', () => {
    const content = 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=\n';
    const findings = auditForSecrets(content);
    const basic = findings.find((f) => f.pattern === 'basic-auth');
    assert.ok(basic);
    assert.strictEqual(basic!.kind, 'basic-auth');
  });

  it('detects env var credential patterns', () => {
    const content = 'API_KEY=supersecretvalue123\nSECRET=anothersecretval456\nTOKEN=mytokenvalue789abc\nPASSWORD=hunter2hunter2hunter2\n';
    const findings = auditForSecrets(content);
    assert.ok(findings.some((f) => f.pattern === 'env-api-key'));
    assert.ok(findings.some((f) => f.pattern === 'env-secret'));
    assert.ok(findings.some((f) => f.pattern === 'env-token'));
    assert.ok(findings.some((f) => f.pattern === 'env-password'));
  });

  it('detects credential file paths', () => {
    const content = 'sslCert: /etc/ssl/private/server.pem\nsshKey: ~/.ssh/id_rsa\ntlsKey: /opt/certs/tls.key\n';
    const findings = auditForSecrets(content);
    assert.ok(findings.some((f) => f.pattern === 'pem-file'));
    assert.ok(findings.some((f) => f.pattern === 'ssh-private-key'));
    assert.ok(findings.some((f) => f.pattern === 'key-file'));
  });

  it('does not flag normal variable names', () => {
    const content = [
      'const apiKeyName = "my-service";',
      '// This function validates the key format',
      'function getTokenCount(text: string): number { return 0; }',
    ].join('\n');
    const findings = auditForSecrets(content);
    assert.strictEqual(findings.length, 0);
  });

  it('reports correct line numbers', () => {
    const content = 'line one\nline two\nAPI_KEY=reallylongsecretvalue\nline four\n';
    const findings = auditForSecrets(content);
    assert.ok(findings.length > 0);
    assert.strictEqual(findings[0]!.line, 3);
  });

  it('redacts matched excerpts', () => {
    const content = 'key = "sk-abcdefghijklmnopqrstuvwxyz1234567890"\n';
    const findings = auditForSecrets(content);
    assert.ok(findings.length > 0);
    assert.ok(findings[0]!.excerpt.includes('***'));
    // The original value should not appear in the excerpt
    assert.ok(!findings[0]!.excerpt.includes('abcdefghijklmnopqrstuvwxyz1234567890'));
  });
});

// ── Least-privilege API consumer roles ─────────────────────────────

describe('roleAllowsAccess', () => {
  it('read-only can GET semantics', () => {
    assert.strictEqual(roleAllowsAccess('read-only', 'GET', '/api/v1/semantics'), true);
  });

  it('read-only cannot POST semantics', () => {
    assert.strictEqual(roleAllowsAccess('read-only', 'POST', '/api/v1/semantics'), false);
  });

  it('parse can GET and POST semantics', () => {
    assert.strictEqual(roleAllowsAccess('parse', 'GET', '/api/v1/semantics'), true);
    assert.strictEqual(roleAllowsAccess('parse', 'POST', '/api/v1/semantics'), true);
  });

  it('parse cannot DELETE semantics', () => {
    assert.strictEqual(roleAllowsAccess('parse', 'DELETE', '/api/v1/semantics'), false);
  });

  it('admin has full access to all endpoints', () => {
    assert.strictEqual(roleAllowsAccess('admin', 'GET', '/api/v1/semantics'), true);
    assert.strictEqual(roleAllowsAccess('admin', 'POST', '/api/v1/semantics'), true);
    assert.strictEqual(roleAllowsAccess('admin', 'DELETE', '/api/v1/semantics'), true);
    assert.strictEqual(roleAllowsAccess('admin', 'GET', '/api/v1/tenants'), true);
    assert.strictEqual(roleAllowsAccess('admin', 'POST', '/api/v1/tenants'), true);
  });

  it('read-only cannot access tenants', () => {
    assert.strictEqual(roleAllowsAccess('read-only', 'GET', '/api/v1/tenants'), false);
  });

  it('returns false for unknown roles', () => {
    assert.strictEqual(
      roleAllowsAccess('nonexistent' as any, 'GET', '/api/v1/semantics'),
      false
    );
  });

  it('returns false for unknown endpoints', () => {
    assert.strictEqual(
      roleAllowsAccess('read-only', 'GET', '/api/v1/unknown'),
      false
    );
  });
});

describe('getRoleDefinition', () => {
  it('returns the correct role definition', () => {
    const adminRole = getRoleDefinition('admin');
    assert.ok(adminRole);
    assert.strictEqual(adminRole!.role, 'admin');
    assert.strictEqual(adminRole!.canManageTenants, true);
  });

  it('returns undefined for unknown roles', () => {
    const unknown = getRoleDefinition('nonexistent' as any);
    assert.strictEqual(unknown, undefined);
  });
});

// ── Tenant-scoped evidence isolation ───────────────────────────────

describe('verifyEvidenceIsolation', () => {
  it('passes when evidence records are properly isolated', () => {
    const evidence: TenantEvidence[] = [
      {
        tenantId: 'tenant-a',
        evidenceId: 'ev-001',
        fingerprint: 'fp-a-001',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only', 'parse', 'admin'],
      },
      {
        tenantId: 'tenant-b',
        evidenceId: 'ev-002',
        fingerprint: 'fp-b-002',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only', 'parse', 'admin'],
      },
    ];
    const result = verifyEvidenceIsolation(evidence);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.violations.length, 0);
  });

  it('detects fingerprint shared across tenants', () => {
    const evidence: TenantEvidence[] = [
      {
        tenantId: 'tenant-a',
        evidenceId: 'ev-001',
        fingerprint: 'shared-fp',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only'],
      },
      {
        tenantId: 'tenant-b',
        evidenceId: 'ev-002',
        fingerprint: 'shared-fp',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only'],
      },
    ];
    const result = verifyEvidenceIsolation(evidence);
    assert.strictEqual(result.ok, false);
    assert.ok(
      result.violations.some((v) => v.includes('shared by tenants'))
    );
  });

  it('rejects invalid tenant IDs', () => {
    const evidence: TenantEvidence[] = [
      {
        tenantId: '',
        evidenceId: 'ev-001',
        fingerprint: 'fp-001',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only'],
      },
    ];
    const result = verifyEvidenceIsolation(evidence);
    assert.strictEqual(result.ok, false);
    assert.ok(
      result.violations.some((v) => v.includes('invalid tenant ID'))
    );
  });

  it('allows same fingerprint for same tenant', () => {
    const evidence: TenantEvidence[] = [
      {
        tenantId: 'tenant-a',
        evidenceId: 'ev-001',
        fingerprint: 'same-fp',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['read-only'],
      },
      {
        tenantId: 'tenant-a',
        evidenceId: 'ev-002',
        fingerprint: 'same-fp',
        recordVersion: '1.0',
        kind: 'parse',
        accessibleTo: ['parse'],
      },
    ];
    const result = verifyEvidenceIsolation(evidence);
    assert.strictEqual(result.ok, true);
  });
});

// ── Tenant context propagation ─────────────────────────────────────

describe('parseTenantContext', () => {
  it('extracts tenant ID from x-tenant-id header', () => {
    const ctx = parseTenantContext({ 'x-tenant-id': 'acme-corp' });
    assert.strictEqual(ctx.tenantId, 'acme-corp');
    assert.strictEqual(ctx.scoped, true);
  });

  it('defaults to "default" for missing tenant header', () => {
    const ctx = parseTenantContext({});
    assert.strictEqual(ctx.tenantId, 'default');
    assert.strictEqual(ctx.scoped, false);
  });

  it('defaults to "default" for invalid tenant IDs', () => {
    const ctx = parseTenantContext({ 'x-tenant-id': 'invalid tenant' });
    assert.strictEqual(ctx.tenantId, 'default');
  });

  it('preserves correlation ID when present', () => {
    const ctx = parseTenantContext({
      'x-tenant-id': 'acme-corp',
      'x-correlation-id': 'corr-123',
    });
    assert.strictEqual(ctx.correlationId, 'corr-123');
  });
});

describe('injectTenantHeaders', () => {
  it('includes x-tenant-id for scoped contexts', () => {
    const ctx = parseTenantContext({ 'x-tenant-id': 'acme-corp' });
    const headers = injectTenantHeaders(ctx, {});
    assert.strictEqual(headers['x-tenant-id'], 'acme-corp');
  });

  it('omits x-tenant-id for unscoped contexts', () => {
    const ctx = parseTenantContext({});
    const headers = injectTenantHeaders(ctx, {});
    assert.ok(!('x-tenant-id' in headers));
  });
});
