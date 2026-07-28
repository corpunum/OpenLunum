import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  THREAT_MODEL_VERSION,
  THREAT_MODEL,
  INCIDENT_EXERCISES,
  verifyLockfile,
  verifyArtifact,
  getThreatModel,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('threat model', () => {
  it('THREAT_MODEL_VERSION is semver', () => {
    assert.match(THREAT_MODEL_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('has at least 8 threat entries', () => {
    assert.ok(THREAT_MODEL.length >= 8);
  });

  it('all threat IDs are unique', () => {
    const ids = THREAT_MODEL.map(t => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('each threat has id, category, severity, title, description, and mitigations', () => {
    for (const t of THREAT_MODEL) {
      assert.ok(t.id.length > 0);
      assert.ok(t.category.length > 0);
      assert.ok(t.severity.length > 0);
      assert.ok(t.title.length > 0);
      assert.ok(t.description.length > 0);
      assert.ok(t.mitigations.length > 0);
    }
  });

  it('includes critical-severity supply-chain threat', () => {
    const supplyChain = THREAT_MODEL.filter(t => t.category === 'supply-chain');
    assert.ok(supplyChain.length > 0);
    assert.ok(supplyChain.some(t => t.severity === 'critical'));
  });

  it('includes prompt-injection and model-poisoning threats', () => {
    const categories = new Set(THREAT_MODEL.map(t => t.category));
    assert.ok(categories.has('prompt-injection'));
    assert.ok(categories.has('model-poisoning'));
  });
});

describe('lockfile verification', () => {
  it('verifies existing lockfile', async () => {
    const lockfilePath = path.join(WORKSPACE_ROOT, 'pnpm-lock.yaml');
    const result = await verifyLockfile(lockfilePath);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lockfileExists, true);
    assert.ok(result.lockfileHash);
    assert.match(result.lockfileHash!, /^[a-f0-9]{64}$/u);
  });

  it('reports missing lockfile', async () => {
    const result = await verifyLockfile('/nonexistent/lockfile.yaml');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.lockfileExists, false);
  });
});

describe('artifact verification', () => {
  it('verifies existing artifact with correct hash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lunum-artifact-'));
    const fp = path.join(dir, 'test.txt');
    await writeFile(fp, 'test content', 'utf8');

    const result = await verifyArtifact(fp);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.exists, true);
    assert.ok(result.hash);
    assert.ok(result.sizeBytes! > 0);

    await unlink(fp).catch(() => {});
  });

  it('detects hash mismatch', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lunum-artifact-'));
    const fp = path.join(dir, 'test.txt');
    await writeFile(fp, 'test content', 'utf8');

    const result = await verifyArtifact(fp, 'wrong-hash');
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('hash mismatch')));

    await unlink(fp).catch(() => {});
  });

  it('reports missing artifact', async () => {
    const result = await verifyArtifact('/nonexistent/artifact.bin');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.exists, false);
  });

  it('accepts correct expected hash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lunum-artifact-'));
    const fp = path.join(dir, 'test.txt');
    const content = 'known content';
    await writeFile(fp, content, 'utf8');

    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update(content).digest('hex');

    const result = await verifyArtifact(fp, expectedHash);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.hash, expectedHash);

    await unlink(fp).catch(() => {});
  });
});

describe('incident exercises', () => {
  it('has at least 3 exercises', () => {
    assert.ok(INCIDENT_EXERCISES.length >= 3);
  });

  it('all exercise IDs are unique', () => {
    const ids = INCIDENT_EXERCISES.map(e => e.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('each exercise has scenario, steps, expectedOutcome, and rollbackProcedure', () => {
    for (const ex of INCIDENT_EXERCISES) {
      assert.ok(ex.id.length > 0);
      assert.ok(ex.scenario.length > 0);
      assert.ok(ex.steps.length >= 3);
      assert.ok(ex.expectedOutcome.length > 0);
      assert.ok(ex.rollbackProcedure.length > 0);
    }
  });
});

describe('getThreatModel', () => {
  it('returns version, threats, and exercises', () => {
    const model = getThreatModel();
    assert.strictEqual(model.version, THREAT_MODEL_VERSION);
    assert.ok(model.threats.length >= 8);
    assert.ok(model.exercises.length >= 3);
  });
});
