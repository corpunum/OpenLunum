import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseAssignment,
  validateAssignment,
  validateManifest,
  executeNightlyCycle,
} from './nightly-evidence-runner.mjs';

test('parseAssignment: parses key-value assignment metadata', () => {
  const content = `assignment_id: 2026-07-21-274-test\nissue: 274\nworker: orchestrator\nbranch: work/orchestrator/274-nightly-redesign\ntier: 3\n`;
  const parsed = parseAssignment(content);
  assert.equal(parsed.assignment_id, '2026-07-21-274-test');
  assert.equal(parsed.issue, '274');
  assert.equal(parsed.worker, 'orchestrator');
  assert.equal(parsed.branch, 'work/orchestrator/274-nightly-redesign');
  assert.equal(parsed.tier, '3');
});

test('validateAssignment: returns invalid when file does not exist', () => {
  const result = validateAssignment('/nonexistent/path/WORKER_ASSIGNMENT.md');
  assert.equal(result.valid, false);
  assert.match(result.reason, /No explicit worker assignment/);
});

test('validateAssignment: fails closed when required fields are missing', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assignment-test-'));
  const file = path.join(tmpDir, 'WORKER_ASSIGNMENT.md');
  fs.writeFileSync(file, 'issue: 274\nworker: orchestrator\n');

  const result = validateAssignment(file);
  assert.equal(result.valid, false);
  assert.match(result.reason, /missing required field/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateManifest: rejects placeholder model profile', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  const profileFile = path.join(tmpDir, 'placeholder-profile.json');
  fs.writeFileSync(profileFile, JSON.stringify({
    schema: 'openlunum-model-profile/0.1',
    model: 'replace-with-server-model-id',
  }));

  const manifestFile = path.join(tmpDir, 'experiment.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    schema: 'openlunum-experiment/0.1',
    baselineCommit: '1c04461',
    modelProfile: profileFile,
  }));

  const result = validateManifest(manifestFile, tmpDir);
  assert.equal(result.valid, false);
  assert.match(result.reason, /contains placeholder model ID/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateManifest: rejects missing baselineCommit', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  const manifestFile = path.join(tmpDir, 'experiment.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    schema: 'openlunum-experiment/0.1',
  }));

  const result = validateManifest(manifestFile, tmpDir);
  assert.equal(result.valid, false);
  assert.match(result.reason, /missing required baselineCommit/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateManifest: rejects dataset SHA-256 mismatch', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  const datasetFile = path.join(tmpDir, 'data.jsonl');
  fs.writeFileSync(datasetFile, 'line 1\nline 2\n');

  const manifestFile = path.join(tmpDir, 'experiment.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    schema: 'openlunum-experiment/0.1',
    baselineCommit: '1c04461',
    dataset: {
      path: datasetFile,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    },
  }));

  const result = validateManifest(manifestFile, tmpDir);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Dataset SHA-256 mismatch/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('executeNightlyCycle: idle when no assignment file exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle-idle-test-'));
  const result = executeNightlyCycle({
    repoRoot: tmpDir,
    assignmentPath: path.join(tmpDir, 'WORKER_ASSIGNMENT.md'),
  });

  assert.equal(result.status, 'IDLE');
  assert.equal(result.modelCalls, 0);
  assert.equal(result.githubWrites, 0);
  assert.equal(result.repoMutations, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('executeNightlyCycle: valid assigned run with no-write guarantee', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycle-assigned-test-'));
  const assignmentFile = path.join(tmpDir, 'WORKER_ASSIGNMENT.md');
  fs.writeFileSync(assignmentFile, `assignment_id: 2026-07-21-274-test\nissue: 274\nworker: orchestrator\nbranch: work/orchestrator/274-nightly-redesign\ntier: 3\n`);

  const expDir = path.join(tmpDir, 'experiments', 'test-exp');
  fs.mkdirSync(expDir, { recursive: true });
  fs.writeFileSync(path.join(expDir, 'experiment.json'), JSON.stringify({
    schema: 'openlunum-experiment/0.1',
    baselineCommit: 'dedf525',
  }));

  const result = executeNightlyCycle({
    repoRoot: tmpDir,
    assignmentPath: assignmentFile,
    experimentsDir: path.join(tmpDir, 'experiments'),
  });

  assert.equal(result.status, 'ASSIGNED_RUN');
  assert.equal(result.modelCalls, 0);
  assert.equal(result.githubWrites, 0);
  assert.equal(result.repoMutations, 0);
  assert.equal(result.validManifests.length, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
