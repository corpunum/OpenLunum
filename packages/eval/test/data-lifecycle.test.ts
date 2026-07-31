import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDataSensitivity,
  auditRetentionCompliance,
  generateDeletionManifest,
  DEFAULT_RETENTION_POLICIES,
  type AuditEntry,
  type DataSensitivity,
  type RetentionPolicy,
  type ExpiredFile,
} from '../src/data-lifecycle.js';

// ── classifyDataSensitivity ───────────────────────────────────────

describe('classifyDataSensitivity', () => {
  it('classifies eval-results/ as public', () => {
    assert.strictEqual(classifyDataSensitivity('data/eval-results/run1.json'), 'public');
  });

  it('classifies datasets/ as public', () => {
    assert.strictEqual(classifyDataSensitivity('datasets/train.jsonl'), 'public');
  });

  it('classifies docs/ as public', () => {
    assert.strictEqual(classifyDataSensitivity('docs/README.md'), 'public');
  });

  it('classifies reports/ as internal', () => {
    assert.strictEqual(classifyDataSensitivity('reports/summary.html'), 'internal');
  });

  it('classifies dist/ as internal', () => {
    assert.strictEqual(classifyDataSensitivity('dist/bundle.js'), 'internal');
  });

  it('classifies paths containing user as sensitive', () => {
    assert.strictEqual(classifyDataSensitivity('data/user-feedback.json'), 'sensitive');
  });

  it('classifies paths containing input as sensitive', () => {
    assert.strictEqual(classifyDataSensitivity('raw/input-log.txt'), 'sensitive');
  });

  it('classifies paths containing pilot as sensitive', () => {
    assert.strictEqual(classifyDataSensitivity('pilot/session-1.json'), 'sensitive');
  });

  it('classifies paths containing secret as restricted', () => {
    assert.strictEqual(classifyDataSensitivity('config/secret-store.yaml'), 'restricted');
  });

  it('classifies paths containing credential as restricted', () => {
    assert.strictEqual(classifyDataSensitivity('auth/credential.json'), 'restricted');
  });

  it('classifies paths containing .env as restricted', () => {
    assert.strictEqual(classifyDataSensitivity('.env.production'), 'restricted');
  });

  it('classifies paths containing key as restricted', () => {
    assert.strictEqual(classifyDataSensitivity('keys/api-key.pem'), 'restricted');
  });
});

// ── auditRetentionCompliance ──────────────────────────────────────

describe('auditRetentionCompliance', () => {
  const NOW = Date.parse('2026-08-01T00:00:00Z');

  it('flags expired files', () => {
    const files = [
      { path: 'data/debug-logs/app.log', modifiedMs: NOW - 10 * 86_400_000 }, // 10 days old, limit 7
    ];
    const result = auditRetentionCompliance(files, DEFAULT_RETENTION_POLICIES, NOW);
    assert.strictEqual(result.compliant, false);
    assert.strictEqual(result.expired.length, 1);
    const entry = result.expired[0]!;
    assert.strictEqual(entry.policy, 'debug-logs');
    assert.strictEqual(entry.ageDays, 10);
    assert.strictEqual(entry.retentionDays, 7);
    assert.strictEqual(result.checked, 1);
  });

  it('passes for fresh files', () => {
    const files = [
      { path: 'data/debug-logs/app.log', modifiedMs: NOW - 3 * 86_400_000 }, // 3 days old, limit 7
      { path: 'data/model-outputs/gen.json', modifiedMs: NOW - 30 * 86_400_000 }, // 30 days, limit 90
    ];
    const result = auditRetentionCompliance(files, DEFAULT_RETENTION_POLICIES, NOW);
    assert.strictEqual(result.compliant, true);
    assert.strictEqual(result.expired.length, 0);
    assert.strictEqual(result.checked, 2);
  });

  it('handles files that match no policy', () => {
    const files = [{ path: 'random/file.txt', modifiedMs: NOW - 999 * 86_400_000 }];
    const result = auditRetentionCompliance(files, DEFAULT_RETENTION_POLICIES, NOW);
    assert.strictEqual(result.compliant, true);
    assert.strictEqual(result.expired.length, 0);
  });
});

// ── generateDeletionManifest ──────────────────────────────────────

describe('generateDeletionManifest', () => {
  it('produces manifest with all entries', () => {
    const expired: ExpiredFile[] = [
      { path: 'data/debug-logs/old.log', policy: 'debug-logs', ageDays: 14, retentionDays: 7 },
      { path: 'data/user-inputs/session.json', policy: 'user-inputs', ageDays: 60, retentionDays: 30 },
    ];
    const manifest = generateDeletionManifest(expired, 'retention policy cleanup', 'admin@corp.com');

    assert.strictEqual(manifest.reason, 'retention policy cleanup');
    assert.strictEqual(manifest.approvedBy, 'admin@corp.com');
    assert.strictEqual(manifest.files.length, 2);
    assert.ok(manifest.timestamp.length > 0);

    const first = manifest.files[0]!;
    assert.strictEqual(first.path, 'data/debug-logs/old.log');
    assert.strictEqual(first.retentionPolicy, 'debug-logs');
    assert.strictEqual(first.sha256.length, 64); // hex sha256
    assert.ok(['public', 'internal', 'sensitive', 'restricted'].includes(first.sensitivity));

    const second = manifest.files[1]!;
    assert.strictEqual(second.path, 'data/user-inputs/session.json');
    assert.strictEqual(second.sensitivity, 'sensitive'); // contains "user" and "input"
  });
});

// ── DEFAULT_RETENTION_POLICIES ────────────────────────────────────

describe('DEFAULT_RETENTION_POLICIES', () => {
  it('has 4 entries', () => {
    assert.strictEqual(DEFAULT_RETENTION_POLICIES.length, 4);
  });
});

// ── AuditEntry construction ───────────────────────────────────────

describe('AuditEntry', () => {
  it('can be constructed with all required fields', () => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action: 'classify',
      path: '/data/eval-results/run.json',
      actor: 'system',
      reason: 'automated classification',
    };
    assert.strictEqual(entry.action, 'classify');
    assert.strictEqual(entry.actor, 'system');
    assert.strictEqual(entry.reason, 'automated classification');
  });
});
