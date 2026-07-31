import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditForSecrets,
  verifyTenantIsolation,
  DEFAULT_SECRET_POLICY,
  LEAST_PRIVILEGE_POLICIES,
  type SecretPolicy,
  type SecretFinding,
  type LeastPrivilegePolicy,
  type TenantIsolationContract,
  type EvalRunManifest,
  type IsolationVerification,
} from '../src/security-contracts.js';

// ── Secret Detection ───────────────────────────────────────────────

describe('auditForSecrets', () => {
  it('detects OpenAI-style API keys', () => {
    const content = 'config.apiKey = "sk-abc123def456ghi789jkl012mno345";\n';
    const findings = auditForSecrets(content);
    assert.ok(findings.length > 0);
    const first = findings[0]!;
    assert.strictEqual(first.kind, 'api-key');
    assert.strictEqual(first.pattern, 'openai-api-key');
    assert.strictEqual(first.line, 1);
    assert.ok(!first.excerpt.includes('sk-abc123def456ghi789jkl012mno345'));
  });

  it('detects AWS access keys', () => {
    const content = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE\n';
    const findings = auditForSecrets(content);
    const aws = findings.find((f) => f.pattern === 'aws-access-key');
    assert.ok(aws);
    assert.strictEqual(aws!.kind, 'api-key');
  });

  it('detects bearer tokens', () => {
    const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature\n';
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

  it('does not flag normal variable names or comments', () => {
    const content = [
      'const apiKeyName = "my-service";',
      '// This function validates the key format',
      'function getTokenCount(text: string): number { return 0; }',
      'const password_field_label = "Enter password";',
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
  });
});

// ── Tenant Isolation ───────────────────────────────────────────────

describe('verifyTenantIsolation', () => {
  it('passes for non-overlapping runs', () => {
    const runA: EvalRunManifest = {
      runId: 'run-001',
      outputDir: '/data/eval/run-001/output',
      tempDir: '/data/eval/run-001/tmp',
      stateFiles: ['/data/eval/run-001/state.json'],
    };
    const runB: EvalRunManifest = {
      runId: 'run-002',
      outputDir: '/data/eval/run-002/output',
      tempDir: '/data/eval/run-002/tmp',
      stateFiles: ['/data/eval/run-002/state.json'],
    };
    const result = verifyTenantIsolation(runA, runB);
    assert.strictEqual(result.isolated, true);
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.contract.noSharedMutableState, true);
    assert.strictEqual(result.contract.noCrossContamination, true);
    assert.strictEqual(result.contract.separateOutputDirs, true);
  });

  it('fails for overlapping output directories', () => {
    const runA: EvalRunManifest = {
      runId: 'run-001',
      outputDir: '/data/eval/shared-output',
      tempDir: '/data/eval/run-001/tmp',
      stateFiles: [],
    };
    const runB: EvalRunManifest = {
      runId: 'run-002',
      outputDir: '/data/eval/shared-output',
      tempDir: '/data/eval/run-002/tmp',
      stateFiles: [],
    };
    const result = verifyTenantIsolation(runA, runB);
    assert.strictEqual(result.isolated, false);
    assert.ok(result.violations.some((v) => v.kind === 'output-overlap'));
    assert.strictEqual(result.contract.separateOutputDirs, false);
  });

  it('fails for overlapping temp directories', () => {
    const runA: EvalRunManifest = {
      runId: 'run-001',
      outputDir: '/data/eval/run-001/output',
      tempDir: '/tmp/shared',
      stateFiles: [],
    };
    const runB: EvalRunManifest = {
      runId: 'run-002',
      outputDir: '/data/eval/run-002/output',
      tempDir: '/tmp/shared',
      stateFiles: [],
    };
    const result = verifyTenantIsolation(runA, runB);
    assert.strictEqual(result.isolated, false);
    assert.ok(result.violations.some((v) => v.kind === 'temp-overlap'));
  });

  it('fails for shared state files', () => {
    const runA: EvalRunManifest = {
      runId: 'run-001',
      outputDir: '/data/eval/run-001/output',
      tempDir: '/data/eval/run-001/tmp',
      stateFiles: ['/data/eval/global-lock.json'],
    };
    const runB: EvalRunManifest = {
      runId: 'run-002',
      outputDir: '/data/eval/run-002/output',
      tempDir: '/data/eval/run-002/tmp',
      stateFiles: ['/data/eval/global-lock.json'],
    };
    const result = verifyTenantIsolation(runA, runB);
    assert.strictEqual(result.isolated, false);
    assert.ok(result.violations.some((v) => v.kind === 'state-overlap'));
    assert.strictEqual(result.contract.noSharedMutableState, false);
  });

  it('detects nested path overlap', () => {
    const runA: EvalRunManifest = {
      runId: 'run-001',
      outputDir: '/data/eval/output',
      tempDir: '/data/eval/run-001/tmp',
      stateFiles: [],
    };
    const runB: EvalRunManifest = {
      runId: 'run-002',
      outputDir: '/data/eval/output/sub',
      tempDir: '/data/eval/run-002/tmp',
      stateFiles: [],
    };
    const result = verifyTenantIsolation(runA, runB);
    assert.strictEqual(result.isolated, false);
    assert.ok(result.violations.some((v) => v.kind === 'output-overlap'));
  });
});

// ── Policy Types ───────────────────────────────────────────────────

describe('policy types', () => {
  it('DEFAULT_SECRET_POLICY covers all secret kinds', () => {
    assert.ok(DEFAULT_SECRET_POLICY.kinds.length > 0);
    assert.ok(DEFAULT_SECRET_POLICY.allowedLocations.includes('env-var'));
    assert.ok(DEFAULT_SECRET_POLICY.forbiddenLocations.includes('log'));
    assert.ok(DEFAULT_SECRET_POLICY.forbiddenLocations.includes('evidence'));
    assert.ok(DEFAULT_SECRET_POLICY.forbiddenLocations.includes('commit'));
  });

  it('LEAST_PRIVILEGE_POLICIES defines all three components', () => {
    assert.strictEqual(LEAST_PRIVILEGE_POLICIES.length, 3);
    const roles = LEAST_PRIVILEGE_POLICIES.map((p) => p.component);
    assert.ok(roles.includes('eval-runner'));
    assert.ok(roles.includes('cli'));
    assert.ok(roles.includes('ci'));
  });

  it('eval-runner has no network access', () => {
    const evalRunner = LEAST_PRIVILEGE_POLICIES.find((p) => p.component === 'eval-runner')!;
    assert.strictEqual(evalRunner.permissions.network, false);
    assert.strictEqual(evalRunner.permissions.secretsInLogs, false);
  });

  it('ci has no secrets in logs', () => {
    const ci = LEAST_PRIVILEGE_POLICIES.find((p) => p.component === 'ci')!;
    assert.strictEqual(ci.permissions.secretsInLogs, false);
  });
});
