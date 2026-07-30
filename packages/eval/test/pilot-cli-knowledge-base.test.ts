import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_VERSION,
  PILOT_NAME,
  createKnowledgeStore,
  storeNote,
  retrieveByFingerprint,
  retrieveBySemanticSimilarity,
  retrieveByTag,
  runPilot,
} from '../src/pilot-cli-knowledge-base.js';
import type { PilotReport } from '../src/pilot-cli-knowledge-base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('pilot-cli-knowledge-base constants', () => {
  it('version is semver', () => {
    assert.match(PILOT_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('name is set', () => {
    assert.strictEqual(PILOT_NAME, 'cli-knowledge-base');
  });
});

describe('pilot-cli-knowledge-base runPilot', () => {
  let report: PilotReport;

  it('runs all scenarios', () => {
    report = runPilot();
    assert.ok(report.scenarios.length >= 10, `expected >=10 scenarios, got ${report.scenarios.length}`);
  });

  it('all scenarios pass', () => {
    const failed = report.scenarios.filter(s => !s.passed);
    assert.strictEqual(
      failed.length,
      0,
      `Failed scenarios: ${failed.map(s => `${s.name}: ${JSON.stringify(s.details)}`).join('\n')}`,
    );
  });

  it('verdict is PASS', () => {
    assert.strictEqual(report.summary.verdict, 'PASS');
  });

  it('success criteria are defined', () => {
    assert.ok(report.summary.successCriteria.length >= 3);
  });

  it('rollback criteria are defined', () => {
    assert.ok(report.summary.rollbackCriteria.length >= 1);
  });

  it('writes report to eval-results', async () => {
    const outDir = path.join(WORKSPACE_ROOT, 'eval-results', 'pilots');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, 'cli-knowledge-base-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      'utf-8',
    );
    const raw = await readFile(path.join(outDir, 'cli-knowledge-base-report.json'), 'utf-8');
    const parsed = JSON.parse(raw) as PilotReport;
    assert.strictEqual(parsed.pilotName, 'cli-knowledge-base');
    assert.strictEqual(parsed.summary.verdict, 'PASS');
  });
});
