/**
 * Tests for incident response, rollback and compromised-evidence
 * exercises (issue #535).
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  detectEvidenceTampering,
  quarantineEvidence,
  simulateIncident,
  INCIDENT_RUNBOOKS,
  type IncidentRunbook,
  type IncidentType,
  type TamperDetectionResult,
  type QuarantineResult,
  type SimulationResult,
} from '../src/incident-response.js';

// ── detectEvidenceTampering ────────────────────────────────────────

describe('detectEvidenceTampering', () => {
  it('finds mismatched hashes', () => {
    const files = [
      { path: 'a.json', expectedHash: 'abc123', actualHash: 'def456' },
      { path: 'b.json', expectedHash: 'aaa111', actualHash: 'aaa111' },
      { path: 'c.json', expectedHash: 'bbb222', actualHash: 'ccc333' },
    ];

    const result: TamperDetectionResult = detectEvidenceTampering(files);

    assert.strictEqual(result.tampered, true);
    assert.deepStrictEqual(result.tamperedFiles, ['a.json', 'c.json']);
    assert.deepStrictEqual(result.intactFiles, ['b.json']);
    assert.strictEqual(result.checkedCount, 3);
  });

  it('passes for matching hashes', () => {
    const files = [
      { path: 'x.json', expectedHash: 'aaa', actualHash: 'aaa' },
      { path: 'y.json', expectedHash: 'bbb', actualHash: 'bbb' },
    ];

    const result: TamperDetectionResult = detectEvidenceTampering(files);

    assert.strictEqual(result.tampered, false);
    assert.deepStrictEqual(result.tamperedFiles, []);
    assert.deepStrictEqual(result.intactFiles, ['x.json', 'y.json']);
    assert.strictEqual(result.checkedCount, 2);
  });
});

// ── quarantineEvidence ─────────────────────────────────────────────

describe('quarantineEvidence', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('moves files and creates manifest', async () => {
    const sourceDir = await mkdtemp(path.join(tmpdir(), 'ir-src-'));
    const quarantineDir = await mkdtemp(path.join(tmpdir(), 'ir-quar-'));
    tempDirs.push(sourceDir, quarantineDir);

    const fileA = path.join(sourceDir, 'evidence-a.json');
    const fileB = path.join(sourceDir, 'evidence-b.json');
    await writeFile(fileA, '{"verdict":"pass"}', 'utf-8');
    await writeFile(fileB, '{"verdict":"fail"}', 'utf-8');

    const result: QuarantineResult = await quarantineEvidence(
      [fileA, fileB],
      quarantineDir,
      'suspected tampering',
    );

    assert.strictEqual(result.quarantined.length, 2);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.manifest.endsWith('quarantine-manifest.json'));

    // Verify manifest was written
    const manifestRaw = await readFile(result.manifest, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    assert.strictEqual(manifest.reason, 'suspected tampering');
    assert.strictEqual(manifest.entries.length, 2);
    assert.strictEqual(manifest.errorCount, 0);

    // Verify quarantine entries have correct fields
    const entry = result.quarantined[0]!;
    assert.strictEqual(entry.originalPath, fileA);
    assert.ok(entry.quarantinePath.includes('evidence-a.json'));
    assert.strictEqual(entry.reason, 'suspected tampering');
    assert.ok(entry.hash.length > 0);
    assert.ok(entry.timestamp.length > 0);

    // Verify file was copied to quarantine
    const quarantinedContent = await readFile(entry.quarantinePath, 'utf-8');
    assert.strictEqual(quarantinedContent, '{"verdict":"pass"}');
  });

  it('records errors for missing files', async () => {
    const quarantineDir = await mkdtemp(path.join(tmpdir(), 'ir-qerr-'));
    tempDirs.push(quarantineDir);

    const result = await quarantineEvidence(
      ['/nonexistent/file.json'],
      quarantineDir,
      'test error handling',
    );

    assert.strictEqual(result.quarantined.length, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0]!.includes('/nonexistent/file.json'));
  });
});

// ── INCIDENT_RUNBOOKS ──────────────────────────────────────────────

describe('INCIDENT_RUNBOOKS', () => {
  it('has 4 entries, each with steps', () => {
    assert.strictEqual(INCIDENT_RUNBOOKS.length, 4);

    const expectedTypes: IncidentType[] = [
      'evidence-tampering',
      'model-poisoning',
      'schema-corruption',
      'unauthorized-access',
    ];

    const actualTypes = INCIDENT_RUNBOOKS.map((rb) => rb.incidentType);
    assert.deepStrictEqual(actualTypes.sort(), expectedTypes.sort());

    for (const runbook of INCIDENT_RUNBOOKS) {
      assert.ok(
        runbook.steps.length >= 3,
        `Runbook ${runbook.id} should have at least 3 steps`,
      );
      assert.ok(
        runbook.escalation.length > 0,
        `Runbook ${runbook.id} should have escalation`,
      );
      assert.ok(
        runbook.id.length > 0,
        `Runbook ${runbook.id} should have an id`,
      );
    }
  });
});

// ── simulateIncident ───────────────────────────────────────────────

describe('simulateIncident', () => {
  it('validates complete runbook', () => {
    const runbook = INCIDENT_RUNBOOKS.find(
      (rb) => rb.incidentType === 'evidence-tampering',
    )!;

    const result: SimulationResult = simulateIncident(
      'evidence-tampering',
      runbook,
    );

    assert.strictEqual(result.type, 'evidence-tampering');
    assert.strictEqual(result.runbookId, runbook.id);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.gaps.length, 0);
    assert.strictEqual(result.stepsValidated, runbook.steps.length);
  });

  it('reports gaps for incomplete runbook (missing verification)', () => {
    const incomplete: IncidentRunbook = {
      id: 'RB-TEST-INCOMPLETE',
      incidentType: 'model-poisoning',
      steps: [
        {
          order: 1,
          action: 'Stop inference',
          verification: 'Inference stopped',
          automated: true,
        },
        {
          order: 2,
          action: 'Check weights',
          verification: '',
          automated: false,
        },
        {
          order: 3,
          action: 'Rollback',
          verification: 'Rolled back',
          automated: false,
        },
      ],
      escalation: 'Notify team',
    };

    const result: SimulationResult = simulateIncident(
      'model-poisoning',
      incomplete,
    );

    assert.strictEqual(result.complete, false);
    assert.ok(result.gaps.length > 0);
    assert.ok(
      result.gaps.some((g) => g.includes('Step 2') && g.includes('no verification')),
    );
    assert.strictEqual(result.stepsValidated, 2);
  });

  it('reports type mismatch gap', () => {
    const runbook = INCIDENT_RUNBOOKS.find(
      (rb) => rb.incidentType === 'evidence-tampering',
    )!;

    const result = simulateIncident('model-poisoning', runbook);

    assert.strictEqual(result.complete, false);
    assert.ok(result.gaps.some((g) => g.includes('does not match')));
  });
});
