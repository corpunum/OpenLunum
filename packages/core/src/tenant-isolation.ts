/**
 * Tenant isolation, secret detection, and least-privilege roles.
 *
 * Implements R15.3 for security readiness: typed tenant boundaries,
 * secret scanning for configuration and API payloads, least-privilege
 * API-consumer roles, and tenant-scoping of semantic records,
 * fingerprints, and evidence.
 *
 * @module tenant-isolation
 */

import { createHash } from 'node:crypto';
import type { LunumSem, LunumRecord } from './types.js';
import { fingerprintSem, surfaceFingerprint } from './fingerprint.js';

// ── Tenant identity ────────────────────────────────────────────────

/** A tenant identifier: opaque, URL-safe, non-empty string. */
export type TenantId = string;

/**
 * Validate a tenant identifier.
 * Must be non-empty, URL-safe alphanumeric plus hyphens, 1–128 chars.
 */
export function isValidTenantId(id: string): id is TenantId {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/**
 * Derive a deterministic scoping prefix from a tenant ID.
 * Uses SHA-256 to avoid leaking human-readable tenant names in indices.
 */
export function tenantScopePrefix(tenantId: TenantId): string {
  return createHash('sha256').update(tenantId).digest('hex').slice(0, 16);
}

// ── Tenant-scoped semantic records ─────────────────────────────────

export interface TenantScopedRecord {
  readonly tenantId: TenantId;
  readonly recordVersion: string;
  readonly source: LunumRecord['source'];
  readonly sem: LunumSem;
  /** Fingerprint scoped to tenant scope. */
  readonly fingerprint: string;
}

/**
 * Wrap a semantic record in a tenant scope.
 * The fingerprint is computed from the tenant-prefixed canonical form,
 * ensuring cross-tenant uniqueness.
 */
export function scopeSemToTenant(
  sem: LunumSem,
  tenantId: TenantId,
  options: { recordVersion?: string; source?: LunumRecord['source'] } = {}
): TenantScopedRecord {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID: ${JSON.stringify(tenantId)}`);
  }

  const scopedSem: LunumSem = {
    ...sem,
    annotations: {
      ...sem.annotations,
      '__tenant__': tenantId,
    },
  };

  const prefix = tenantScopePrefix(tenantId);
  const digest = createHash('sha256')
    .update(prefix + JSON.stringify(sem))
    .digest('hex');
  const fingerprint = `lfp:1.0:sha256:${digest.slice(0, 16)}${prefix}`;

  return {
    tenantId,
    recordVersion: options.recordVersion ?? '1.0',
    source: options.source ?? { text: '', language: null, role: null, ref: null },
    sem: scopedSem,
    fingerprint,
  };
}

/**
 * Check whether a semantic record belongs to the given tenant.
 */
export function recordBelongsToTenant(record: TenantScopedRecord, tenantId: TenantId): boolean {
  return record.tenantId === tenantId;
}

/**
 * Filter records by tenant. Returns records that belong to the requested tenant.
 */
export function filterByTenant<T extends { tenantId: string }>(
  records: readonly T[],
  tenantId: TenantId
): T[] {
  return records.filter((r) => r.tenantId === tenantId);
}

/**
 * Verify that no cross-tenant leakage exists in a batch of records.
 * Every record's annotations.__tenant__ must match its tenantId,
 * and its fingerprint must include its scope prefix.
 */
export function verifyNoCrossTenantLeakage(records: TenantScopedRecord[]): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const record of records) {
    const semTenant = (record.sem.annotations as Record<string, unknown>)?.['__tenant__'];
    if (semTenant !== record.tenantId) {
      violations.push(
        `Record fingerprint ${record.fingerprint.slice(0, 20)}… has tenant annotation '${semTenant}' but record.tenantId is '${record.tenantId}'`
      );
    }

    const expectedPrefix = tenantScopePrefix(record.tenantId);
    if (!record.fingerprint.endsWith(expectedPrefix)) {
      violations.push(
        `Record fingerprint ${record.fingerprint.slice(0, 20)}… does not end with tenant scope prefix '${expectedPrefix}'`
      );
    }
  }

  return { ok: violations.length === 0, violations };
}

// ── Tenant-scoped fingerprints ─────────────────────────────────────

/**
 * Compute a tenant-scoped surface fingerprint for source text.
 */
export function tenantScopedSurfaceFingerprint(
  text: string,
  tenantId: TenantId
): string {
  const prefix = tenantScopePrefix(tenantId);
  const normalized = text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const scoped = prefix + normalized;
  const digest = createHash('sha256').update(scoped).digest('hex');
  return `lsf:1.0:sha256:${digest.slice(0, 16)}${prefix}`;
}

/**
 * Verify that a fingerprint was computed for the given tenant.
 */
export function fingerprintBelongsToTenant(
  fingerprint: string,
  tenantId: TenantId
): boolean {
  const expectedPrefix = tenantScopePrefix(tenantId);
  const validPrefixes = ['lfp:1.0:sha256:', 'lsf:1.0:sha256:'];
  const isVersionedFingerprint = validPrefixes.some((p) => fingerprint.startsWith(p));
  return isVersionedFingerprint ? fingerprint.endsWith(expectedPrefix) : false;
}

// ── Secret detection ───────────────────────────────────────────────

export type SecretKind =
  | 'api-key'
  | 'bearer-token'
  | 'basic-auth'
  | 'env-credential'
  | 'credential-file';

export interface SecretFinding {
  /** Pattern name that matched. */
  readonly pattern: string;
  /** Classification of the detected secret. */
  readonly kind: SecretKind;
  /** Redacted excerpt (partial reveal for identification). */
  readonly excerpt: string;
  /** 1-based line number in the scanned content. */
  readonly line: number;
}

interface SecretPattern {
  readonly name: string;
  readonly kind: SecretKind;
  readonly regex: RegExp;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'openai-api-key', kind: 'api-key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'generic-key-prefix', kind: 'api-key', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([A-Za-z0-9]{16,})/i },
  { name: 'aws-access-key', kind: 'api-key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'bearer-token', kind: 'bearer-token', regex: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
  { name: 'basic-auth', kind: 'basic-auth', regex: /Basic\s+[A-Za-z0-9+/=]{16,}/ },
  { name: 'env-api-key', kind: 'env-credential', regex: /(?:API_KEY|APIKEY|API-KEY)\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-secret', kind: 'env-credential', regex: /SECRET\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-token', kind: 'env-credential', regex: /TOKEN\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-password', kind: 'env-credential', regex: /PASSWORD\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'pem-file', kind: 'credential-file', regex: /[\w/\\.~-]+\.pem\b/ },
  { name: 'key-file', kind: 'credential-file', regex: /[\w/\\.~-]+\.key\b/ },
  { name: 'ssh-private-key', kind: 'credential-file', regex: /[\w/\\.~-]*id_rsa\b/ },
];

function redactSecret(match: string): string {
  if (match.length <= 8) return '***';
  return match.slice(0, 4) + '***' + match.slice(-4);
}

/**
 * Scan text content for exposed secrets.
 *
 * Returns findings sorted by line number, then by pattern name.
 */
export function auditForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pat of SECRET_PATTERNS) {
      const regex = new RegExp(pat.regex.source, pat.regex.flags);
      const m = regex.exec(line);
      if (m && m[0] !== undefined) {
        findings.push({
          pattern: pat.name,
          kind: pat.kind,
          excerpt: redactSecret(m[0]),
          line: i + 1,
        });
      }
    }
  }

  findings.sort((a, b) => a.line - b.line || a.pattern.localeCompare(b.pattern));
  return findings;
}

// ── Least-privilege API consumer roles ─────────────────────────────

export type ApiConsumerRole = 'read-only' | 'parse' | 'admin';

export interface ApiPermission {
  readonly endpoint: string;
  readonly methods: readonly string[];
}

export interface RoleDefinition {
  /** Human-readable role identifier. */
  readonly role: ApiConsumerRole;
  /** Permissions granted to this role. */
  readonly permissions: ApiPermission[];
  /** Whether this role can access tenant-scoped evidence. */
  readonly canAccessEvidence: boolean;
  /** Whether this role can modify tenant configuration. */
  readonly canManageTenants: boolean;
}

export const API_CONSUMER_ROLES: readonly RoleDefinition[] = [
  {
    role: 'read-only',
    permissions: [
      { endpoint: '/api/v1/semantics', methods: ['GET'] },
      { endpoint: '/api/v1/fingerprints', methods: ['GET'] },
      { endpoint: '/api/v1/evidence', methods: ['GET'] },
      { endpoint: '/api/v1/health', methods: ['GET'] },
    ],
    canAccessEvidence: true,
    canManageTenants: false,
  },
  {
    role: 'parse',
    permissions: [
      { endpoint: '/api/v1/semantics', methods: ['GET', 'POST'] },
      { endpoint: '/api/v1/fingerprints', methods: ['GET'] },
      { endpoint: '/api/v1/evidence', methods: ['GET'] },
      { endpoint: '/api/v1/health', methods: ['GET'] },
    ],
    canAccessEvidence: true,
    canManageTenants: false,
  },
  {
    role: 'admin',
    permissions: [
      { endpoint: '/api/v1/semantics', methods: ['GET', 'POST', 'DELETE'] },
      { endpoint: '/api/v1/fingerprints', methods: ['GET', 'DELETE'] },
      { endpoint: '/api/v1/evidence', methods: ['GET', 'POST', 'DELETE'] },
      { endpoint: '/api/v1/tenants', methods: ['GET', 'POST', 'DELETE'] },
      { endpoint: '/api/v1/health', methods: ['GET'] },
    ],
    canAccessEvidence: true,
    canManageTenants: true,
  },
];

/**
 * Check whether a role definition permits a specific method on an endpoint.
 */
export function roleAllowsAccess(
  role: ApiConsumerRole,
  method: string,
  endpoint: string
): boolean {
  const roleDef = API_CONSUMER_ROLES.find((r) => r.role === role);
  if (!roleDef) return false;

  const permission = roleDef.permissions.find(
    (p) => p.endpoint === endpoint
  );
  if (!permission) return false;

  return permission.methods.some((m) => m === method);
}

/**
 * Get the role definition for a given role.
 */
export function getRoleDefinition(role: ApiConsumerRole): RoleDefinition | undefined {
  return API_CONSUMER_ROLES.find((r) => r.role === role);
}

// ── Tenant-scoped evidence ─────────────────────────────────────────

export interface TenantEvidence {
  readonly tenantId: TenantId;
  readonly evidenceId: string;
  readonly fingerprint: string;
  readonly recordVersion: string;
  readonly kind: string;
  /** Whether this evidence is accessible to the given role. */
  readonly accessibleTo: readonly ApiConsumerRole[];
}

/**
 * Verify that a set of evidence records has no cross-tenant leakage.
 * Each record's tenantId must be unique within a batch,
 * and no two records with different tenants may share a fingerprint.
 */
export function verifyEvidenceIsolation(evidence: readonly TenantEvidence[]): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const fingerprintSet = new Map<string, TenantId>();

  for (const item of evidence) {
    if (!isValidTenantId(item.tenantId)) {
      violations.push(`Evidence ${item.evidenceId} has invalid tenant ID`);
      continue;
    }

    const existingTenant = fingerprintSet.get(item.fingerprint);
    if (existingTenant !== undefined && existingTenant !== item.tenantId) {
      violations.push(
        `Fingerprint ${item.fingerprint.slice(0, 20)}… shared by tenants '${existingTenant}' and '${item.tenantId}'`
      );
    }
    fingerprintSet.set(item.fingerprint, item.tenantId);
  }

  return { ok: violations.length === 0, violations };
}

// ── Tenant context propagation (for tracing) ───────────────────────

/**
 * Tenant context that threads through API requests.
 */
export interface TenantContext {
  /** The active tenant for this request. */
  readonly tenantId: TenantId;
  /** Whether the request is tenant-scoped. */
  readonly scoped: boolean;
  /** Optional correlation ID for tracing. */
  readonly correlationId: string | undefined;
}

/**
 * Create a tenant context from request headers.
 */
export function parseTenantContext(
  headers: Record<string, string | undefined>
): TenantContext {
  const tenantId = headers['x-tenant-id'] ?? 'default';
  const correlationId = headers['x-correlation-id'];

  return {
    tenantId: isValidTenantId(tenantId) ? tenantId : 'default',
    scoped: tenantId !== 'default',
    correlationId,
  };
}

/**
 * Inject tenant context into response headers.
 */
export function injectTenantHeaders(
  context: TenantContext,
  headers: Record<string, string>
): Record<string, string> {
  const result = { ...headers };
  if (context.scoped) {
    result['x-tenant-id'] = context.tenantId;
  }
  return result;
}
