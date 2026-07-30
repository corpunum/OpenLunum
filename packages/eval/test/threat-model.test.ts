/**
 * Test suite for threat model, dependency audit, and incident exercises.
 * Verifies Phase 5 security readiness (R15.1, R15.4, R15.6).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  THREAT_MODEL_VERSION,
  buildThreatModel,
  auditDependencyControls,
  runIncidentExercise,
  type ThreatCategory,
  type Threat,
  type IncidentExerciseResult
} from '../src/threat-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ── Threat Model Tests ────────────────────────────────────────────

test('threat model version is defined', () => {
  assert.strictEqual(THREAT_MODEL_VERSION, '0.1.0');
});

test('buildThreatModel() returns valid threat model', () => {
  const model = buildThreatModel();
  assert.strictEqual(model.version, THREAT_MODEL_VERSION);
  assert.ok(model.scope);
  assert.ok(model.lastReviewed);
  assert.ok(Array.isArray(model.threats));
});

test('threat model contains >= 12 threats', () => {
  const model = buildThreatModel();
  assert.ok(
    model.threats.length >= 12,
    `Expected >= 12 threats, got ${model.threats.length}`
  );
});

test('threat model covers all threat categories', () => {
  const model = buildThreatModel();
  const categories = new Set(model.threats.map(t => t.category));

  const expectedCategories: ThreatCategory[] = [
    'prompt-injection',
    'semantic-confusion',
    'data-exfiltration',
    'supply-chain',
    'denial-of-service',
    'privilege-escalation',
    'rollback-attack'
  ];

  for (const category of expectedCategories) {
    assert.ok(
      categories.has(category),
      `Threat category '${category}' not found in model`
    );
  }
});

test('no duplicate threat IDs in model', () => {
  const model = buildThreatModel();
  const ids = model.threats.map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(
    ids.length,
    uniqueIds.size,
    `Duplicate threat IDs found: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`
  );
});

test('every threat has at least one mitigation', () => {
  const model = buildThreatModel();
  const withoutMitigations = model.threats.filter(t => t.mitigations.length === 0);
  assert.strictEqual(
    withoutMitigations.length,
    0,
    `Threats without mitigations: ${withoutMitigations.map(t => t.id).join(', ')}`
  );
});

test('all threat severities are valid', () => {
  const model = buildThreatModel();
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  const invalidThreats = model.threats.filter(t => !validSeverities.includes(t.severity));
  assert.strictEqual(
    invalidThreats.length,
    0,
    `Invalid severities: ${invalidThreats.map(t => `${t.id}:${t.severity}`).join(', ')}`
  );
});

test('all threat statuses are valid', () => {
  const model = buildThreatModel();
  const validStatuses = ['mitigated', 'accepted', 'open'];
  const invalidThreats = model.threats.filter(t => !validStatuses.includes(t.status));
  assert.strictEqual(
    invalidThreats.length,
    0,
    `Invalid statuses: ${invalidThreats.map(t => `${t.id}:${t.status}`).join(', ')}`
  );
});

test('every threat has required fields', () => {
  const model = buildThreatModel();
  for (const threat of model.threats) {
    assert.ok(threat.id, `Threat missing id`);
    assert.ok(threat.category, `Threat ${threat.id} missing category`);
    assert.ok(threat.title, `Threat ${threat.id} missing title`);
    assert.ok(threat.description, `Threat ${threat.id} missing description`);
    assert.ok(Array.isArray(threat.mitigations), `Threat ${threat.id} mitigations not array`);
    assert.ok(threat.severity, `Threat ${threat.id} missing severity`);
    assert.ok(threat.status, `Threat ${threat.id} missing status`);
  }
});

test('threat model references actual codebase files', () => {
  const model = buildThreatModel();
  const allMitigations = model.threats.flatMap(t => t.mitigations).join('\n');

  // Check that mitigations reference real files in the codebase
  const expectedReferences = [
    'packages/core/src/prompt-injection.ts',
    'packages/core/src/canonicalize.ts',
    'packages/core/src/policy.ts',
    'packages/core/src/semantic-invariants.ts',
    'packages/core/src/error-observability.ts',
    'packages/core/src/render.ts',
    'packages/eval/test'
  ];

  for (const reference of expectedReferences) {
    assert.ok(
      allMitigations.includes(reference),
      `Expected reference to '${reference}' not found in mitigations`
    );
  }
});

// ── Dependency Audit Tests ────────────────────────────────────────

test('auditDependencyControls() returns valid audit result', async () => {
  const audit = await auditDependencyControls();
  assert.ok(audit);
  assert.ok('pnpmLockExists' in audit);
  assert.ok('auditStatus' in audit);
  assert.ok('auditMessage' in audit);
  assert.ok('lockfileTimestamp' in audit);
});

test('dependency audit detects pnpm-lock.yaml', async () => {
  const audit = await auditDependencyControls();
  assert.strictEqual(audit.pnpmLockExists, true);
  assert.strictEqual(audit.auditStatus, 'success');
});

test('dependency audit message is non-empty', async () => {
  const audit = await auditDependencyControls();
  assert.ok(audit.auditMessage);
  assert.ok(audit.auditMessage.length > 0);
});

test('dependency audit provides timestamp when lock file exists', async () => {
  const audit = await auditDependencyControls();
  if (audit.pnpmLockExists) {
    assert.ok(audit.lockfileTimestamp);
  }
});

// ── Incident Exercise Tests ───────────────────────────────────────

test('incident exercise for compromised-model-weight scenario', () => {
  const result = runIncidentExercise('compromised-model-weight');
  assert.strictEqual(result.scenario, 'compromised-model-weight');
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.steps.length > 0);
  assert.ok(Array.isArray(result.rollbackActions));
  assert.ok(result.rollbackActions.length > 0);
  assert.ok(Array.isArray(result.detectionMethods));
  assert.ok(result.detectionMethods.length > 0);
  assert.ok(result.estimatedRecoveryTime);
  assert.ok(result.success);
});

test('incident exercise for poisoned-training-data scenario', () => {
  const result = runIncidentExercise('poisoned-training-data');
  assert.strictEqual(result.scenario, 'poisoned-training-data');
  assert.ok(result.steps.length > 0);
  assert.ok(result.rollbackActions.length > 0);
  assert.ok(result.detectionMethods.length > 0);
  assert.ok(result.success);
});

test('incident exercise for schema-rollback-needed scenario', () => {
  const result = runIncidentExercise('schema-rollback-needed');
  assert.strictEqual(result.scenario, 'schema-rollback-needed');
  assert.ok(result.steps.length > 0);
  assert.ok(result.rollbackActions.length > 0);
  assert.ok(result.detectionMethods.length > 0);
  assert.ok(result.success);
});

test('incident exercise for fingerprint-collision-found scenario', () => {
  const result = runIncidentExercise('fingerprint-collision-found');
  assert.strictEqual(result.scenario, 'fingerprint-collision-found');
  assert.ok(result.steps.length > 0);
  assert.ok(result.rollbackActions.length > 0);
  assert.ok(result.detectionMethods.length > 0);
  assert.ok(result.success);
});

test('incident exercise for unknown scenario returns empty result', () => {
  const result = runIncidentExercise('unknown-scenario-xyz');
  assert.strictEqual(result.scenario, 'unknown-scenario-xyz');
  assert.strictEqual(result.steps.length, 0);
  assert.strictEqual(result.rollbackActions.length, 0);
  assert.strictEqual(result.detectionMethods.length, 0);
  assert.strictEqual(result.success, false);
});

test('all incident exercises have recovery time estimates', () => {
  const scenarios = [
    'compromised-model-weight',
    'poisoned-training-data',
    'schema-rollback-needed',
    'fingerprint-collision-found'
  ];

  for (const scenario of scenarios) {
    const result = runIncidentExercise(scenario);
    assert.ok(result.estimatedRecoveryTime);
    assert.notStrictEqual(result.estimatedRecoveryTime, 'unknown');
  }
});

// ── Report Generation ─────────────────────────────────────────────

test('write threat model report to eval-results', async () => {
  try {
    // Build threat model and audit
    const model = buildThreatModel();
    const audit = await auditDependencyControls();

    // Prepare exercises
    const exercises = [
      runIncidentExercise('compromised-model-weight'),
      runIncidentExercise('poisoned-training-data'),
      runIncidentExercise('schema-rollback-needed'),
      runIncidentExercise('fingerprint-collision-found')
    ];

    // Create report
    const report = {
      timestamp: new Date().toISOString(),
      threatModel: model,
      dependencyAudit: audit,
      incidentExercises: exercises,
      summary: {
        totalThreats: model.threats.length,
        threatsbyStatus: {
          mitigated: model.threats.filter(t => t.status === 'mitigated').length,
          accepted: model.threats.filter(t => t.status === 'accepted').length,
          open: model.threats.filter(t => t.status === 'open').length
        },
        threatsbyCategory: Object.fromEntries(
          Array.from(
            new Set(model.threats.map(t => t.category))
          ).map(cat => [
            cat,
            model.threats.filter(t => t.category === cat).length
          ])
        ),
        allExercisesSuccessful: exercises.every(e => e.success),
        dependencyControlsOk: audit.auditStatus === 'success'
      }
    };

    // Ensure directory exists
    const reportDir = path.join(WORKSPACE_ROOT, 'eval-results', 'security');
    await mkdir(reportDir, { recursive: true });

    // Write report
    const reportPath = path.join(reportDir, 'threat-model-report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    assert.ok(true, 'Report written successfully');
  } catch (err) {
    assert.fail(`Failed to write threat model report: ${(err as Error).message}`);
  }
});
