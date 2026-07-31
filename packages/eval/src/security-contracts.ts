/**
 * Secret management, least privilege and tenant isolation guidance.
 *
 * Implements R15.3 for Phase 5 security readiness: secret scanning,
 * least-privilege policies, and tenant isolation verification.
 */

// ── Secret Policy ──────────────────────────────────────────────────

export type SecretKind = 'api-key' | 'bearer-token' | 'basic-auth' | 'env-credential' | 'credential-file';

export interface SecretPolicy {
  readonly kinds: readonly SecretKind[];
  readonly allowedLocations: readonly ('env-var')[];
  readonly forbiddenLocations: readonly ('log' | 'evidence' | 'commit' | 'stdout')[];
}

export const DEFAULT_SECRET_POLICY: SecretPolicy = {
  kinds: ['api-key', 'bearer-token', 'basic-auth', 'env-credential', 'credential-file'],
  allowedLocations: ['env-var'],
  forbiddenLocations: ['log', 'evidence', 'commit', 'stdout'],
};

// ── Secret Scanning ────────────────────────────────────────────────

export interface SecretFinding {
  readonly pattern: string;
  readonly kind: SecretKind;
  readonly excerpt: string;
  readonly line: number;
}

interface SecretPattern {
  name: string;
  kind: SecretKind;
  regex: RegExp;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'openai-api-key', kind: 'api-key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'generic-key-prefix', kind: 'api-key', regex: /key-[A-Za-z0-9]{16,}/ },
  { name: 'aws-access-key', kind: 'api-key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'bearer-token', kind: 'bearer-token', regex: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
  { name: 'basic-auth', kind: 'basic-auth', regex: /Basic\s+[A-Za-z0-9+/=]{16,}/ },
  { name: 'env-api-key', kind: 'env-credential', regex: /API_KEY\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-secret', kind: 'env-credential', regex: /SECRET\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-token', kind: 'env-credential', regex: /TOKEN\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'env-password', kind: 'env-credential', regex: /PASSWORD\s*=\s*['"]?[^\s'"]{8,}/ },
  { name: 'pem-file', kind: 'credential-file', regex: /[\w/\\.~-]+\.pem\b/ },
  { name: 'key-file', kind: 'credential-file', regex: /[\w/\\.~-]+\.key\b/ },
  { name: 'ssh-private-key', kind: 'credential-file', regex: /[\w/\\.~-]*id_rsa\b/ },
];

function redact(match: string): string {
  if (match.length <= 8) return '***';
  return match.slice(0, 4) + '***' + match.slice(-4);
}

export function auditForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pat of SECRET_PATTERNS) {
      const m = pat.regex.exec(line);
      if (m && m[0] !== undefined) {
        findings.push({
          pattern: pat.name,
          kind: pat.kind,
          excerpt: redact(m[0]),
          line: i + 1,
        });
      }
    }
  }

  return findings;
}

// ── Least Privilege Policy ─────────────────────────────────────────

export type ComponentRole = 'eval-runner' | 'cli' | 'ci';

export interface PermissionSet {
  readonly read: readonly string[];
  readonly write: readonly string[];
  readonly network: boolean;
  readonly secretsInLogs: boolean;
}

export interface LeastPrivilegePolicy {
  readonly component: ComponentRole;
  readonly permissions: PermissionSet;
}

export const LEAST_PRIVILEGE_POLICIES: readonly LeastPrivilegePolicy[] = [
  {
    component: 'eval-runner',
    permissions: {
      read: ['datasets'],
      write: ['eval-results'],
      network: false,
      secretsInLogs: false,
    },
  },
  {
    component: 'cli',
    permissions: {
      read: ['stdin', 'config-files'],
      write: ['stdout', 'stderr'],
      network: false,
      secretsInLogs: false,
    },
  },
  {
    component: 'ci',
    permissions: {
      read: ['repo'],
      write: ['artifacts'],
      network: false,
      secretsInLogs: false,
    },
  },
];

// ── Tenant Isolation ───────────────────────────────────────────────

export interface EvalRunManifest {
  readonly runId: string;
  readonly outputDir: string;
  readonly tempDir: string;
  readonly stateFiles: readonly string[];
}

export interface TenantIsolationContract {
  readonly noSharedMutableState: boolean;
  readonly noCrossContamination: boolean;
  readonly separateOutputDirs: boolean;
}

export interface IsolationViolation {
  readonly kind: 'output-overlap' | 'temp-overlap' | 'state-overlap';
  readonly pathA: string;
  readonly pathB: string;
}

export interface IsolationVerification {
  readonly isolated: boolean;
  readonly violations: readonly IsolationViolation[];
  readonly contract: TenantIsolationContract;
}

function pathsOverlap(a: string, b: string): boolean {
  const na = a.replace(/\/+$/, '');
  const nb = b.replace(/\/+$/, '');
  return na === nb || na.startsWith(nb + '/') || nb.startsWith(na + '/');
}

export function verifyTenantIsolation(
  runA: EvalRunManifest,
  runB: EvalRunManifest,
): IsolationVerification {
  const violations: IsolationViolation[] = [];

  if (pathsOverlap(runA.outputDir, runB.outputDir)) {
    violations.push({
      kind: 'output-overlap',
      pathA: runA.outputDir,
      pathB: runB.outputDir,
    });
  }

  if (pathsOverlap(runA.tempDir, runB.tempDir)) {
    violations.push({
      kind: 'temp-overlap',
      pathA: runA.tempDir,
      pathB: runB.tempDir,
    });
  }

  for (const sa of runA.stateFiles) {
    for (const sb of runB.stateFiles) {
      if (sa === sb) {
        violations.push({
          kind: 'state-overlap',
          pathA: sa,
          pathB: sb,
        });
      }
    }
  }

  const contract: TenantIsolationContract = {
    noSharedMutableState: !violations.some((v) => v.kind === 'state-overlap'),
    noCrossContamination: violations.length === 0,
    separateOutputDirs: !violations.some((v) => v.kind === 'output-overlap'),
  };

  return {
    isolated: violations.length === 0,
    violations,
    contract,
  };
}
