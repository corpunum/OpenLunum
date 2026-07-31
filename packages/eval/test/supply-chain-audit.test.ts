import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verifyLockfileIntegrity,
  auditDependencyProvenance,
  checkForKnownVulnerabilities,
  verifyArtifactIntegrity,
  KNOWN_VULNERABILITIES,
  type PackageDep,
} from '../src/supply-chain-audit.js';

// ── Lockfile Integrity ─────────────────────────────────────────────

describe('verifyLockfileIntegrity', () => {
  it('passes for an existing non-empty file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scaudit-'));
    const lockfile = join(dir, 'pnpm-lock.yaml');
    await writeFile(lockfile, 'lockfileVersion: 5\n');
    try {
      const result = await verifyLockfileIntegrity(lockfile);
      assert.strictEqual(result.exists, true);
      assert.strictEqual(result.nonEmpty, true);
      assert.strictEqual(result.valid, true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('fails for a missing file', async () => {
    const result = await verifyLockfileIntegrity('/nonexistent/path/pnpm-lock.yaml');
    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.nonEmpty, false);
    assert.strictEqual(result.valid, false);
  });
});

// ── Dependency Provenance ──────────────────────────────────────────

describe('auditDependencyProvenance', () => {
  it('flags unknown registries', () => {
    const deps: PackageDep[] = [
      { name: 'lodash', version: '4.17.21', registry: 'npmjs' },
      { name: 'shady-pkg', version: '1.0.0', registry: 'unknown' },
      { name: 'another-pkg', version: '2.0.0', registry: 'private-registry' },
    ];
    const report = auditDependencyProvenance(deps);
    assert.strictEqual(report.total, 3);
    assert.strictEqual(report.knownRegistry, 1);
    assert.strictEqual(report.unknownRegistry.length, 2);
    assert.strictEqual(report.allKnown, false);
    assert.ok(report.unknownRegistry.some((d) => d.name === 'shady-pkg'));
    assert.ok(report.unknownRegistry.some((d) => d.name === 'another-pkg'));
  });

  it('passes for all-known deps', () => {
    const deps: PackageDep[] = [
      { name: 'typescript', version: '5.5.0', registry: 'npmjs' },
      { name: 'actions-toolkit', version: '3.0.0', registry: 'github' },
    ];
    const report = auditDependencyProvenance(deps);
    assert.strictEqual(report.total, 2);
    assert.strictEqual(report.knownRegistry, 2);
    assert.strictEqual(report.unknownRegistry.length, 0);
    assert.strictEqual(report.allKnown, true);
  });
});

// ── Known Vulnerabilities ──────────────────────────────────────────

describe('checkForKnownVulnerabilities', () => {
  it('finds matches against known-bad packages', () => {
    const deps: PackageDep[] = [
      { name: 'evil-logger', version: '1.2.3', registry: 'npmjs' },
      { name: 'safe-lib', version: '3.0.0', registry: 'npmjs' },
      { name: 'bad-parser', version: '1.5.0', registry: 'npmjs' },
    ];
    const report = checkForKnownVulnerabilities(deps);
    assert.strictEqual(report.checked, 3);
    assert.strictEqual(report.vulnerable.length, 2);
    assert.strictEqual(report.clean, false);
    assert.ok(report.vulnerable.some((v) => v.dep.name === 'evil-logger'));
    assert.ok(report.vulnerable.some((v) => v.dep.name === 'bad-parser'));
  });

  it('returns clean for safe deps', () => {
    const deps: PackageDep[] = [
      { name: 'safe-lib', version: '1.0.0', registry: 'npmjs' },
      { name: 'another-safe', version: '2.0.0', registry: 'github' },
    ];
    const report = checkForKnownVulnerabilities(deps);
    assert.strictEqual(report.checked, 2);
    assert.strictEqual(report.vulnerable.length, 0);
    assert.strictEqual(report.clean, true);
  });

  it('has a non-empty static vulnerability list', () => {
    assert.ok(KNOWN_VULNERABILITIES.length >= 3);
  });
});

// ── Artifact Integrity ─────────────────────────────────────────────

describe('verifyArtifactIntegrity', () => {
  it('matches correct hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scaudit-'));
    const artifactPath = join(dir, 'artifact.bin');
    const content = 'deterministic artifact content for hashing';
    await writeFile(artifactPath, content);
    const expectedHash = createHash('sha256').update(Buffer.from(content)).digest('hex');
    try {
      const result = await verifyArtifactIntegrity(artifactPath, expectedHash);
      assert.strictEqual(result.path, artifactPath);
      assert.strictEqual(result.expectedHash, expectedHash);
      assert.strictEqual(result.actualHash, expectedHash);
      assert.strictEqual(result.matches, true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('fails for wrong hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scaudit-'));
    const artifactPath = join(dir, 'artifact.bin');
    await writeFile(artifactPath, 'real content');
    const wrongHash = 'deadbeef'.repeat(8);
    try {
      const result = await verifyArtifactIntegrity(artifactPath, wrongHash);
      assert.strictEqual(result.matches, false);
      assert.notStrictEqual(result.actualHash, wrongHash);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
