import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCompactionBenchmark, DEFAULT_RUN_CONFIG } from '../src/compaction-execution-runner.js';
import { quarantineEvidence } from '../src/incident-response.js';
import { scorePredicateMatch } from '../src/retention-experiment.js';
import { evaluateRetentionGates } from '../src/retention-gates.js';
import { simulateSecurityRegressionTest, REGRESSION_CHECK_TYPES, SECURITY_CONTROL_AREAS } from '../src/security-regression-testing.js';

describe('round 2 batch 1 regressions', () => {
  it('compaction runner refuses live mode instead of fabricating results', () => {
    assert.throws(() => runCompactionBenchmark(undefined, { ...DEFAULT_RUN_CONFIG, mode: 'live' }), /not supported/);
    assert.ok(runCompactionBenchmark().measurements.length > 0);
  });

  it('quarantine removes the original after a verified copy', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'r2b1-'));
    try {
      const f = path.join(dir, 'item.json');
      await writeFile(f, '{"a":1}', 'utf-8');
      const q = path.join(dir, 'q');
      const res = await quarantineEvidence([f], q, 'fixture');
      assert.equal(res.errors.length, 0);
      await assert.rejects(access(f));
      assert.equal(await readFile(res.quarantined[0]!.quarantinePath, 'utf-8'), '{"a":1}');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('predicate match ignores predicates that appear only in the source', () => {
    const sem = { clauses: [{ predicate: 'frobnicate' }] };
    assert.equal(scorePredicateMatch(sem, 'nothing here', 'please frobnicate it'), 0);
    assert.equal(scorePredicateMatch(sem, 'we frobnicate', 'other'), 1);
  });

  it('literal gate does not credit literals present only in the source', () => {
    const sem: any = { clauses: [] };
    const res = evaluateRetentionGates(sem, sem, 'keep ABC-123 here', 'dropped it', ['ABC-123']);
    assert.equal(res.gateScores['literal-preservation'].score, 0);
    const ok = evaluateRetentionGates(sem, sem, 'keep ABC-123 here', 'kept ABC-123', ['ABC-123']);
    assert.equal(ok.gateScores['literal-preservation'].score, 1);
  });

  it('security regression simulator can report a regression', () => {
    let regressed = 0;
    for (const c of SECURITY_CONTROL_AREAS) {
      for (const k of REGRESSION_CHECK_TYPES) {
        if (simulateSecurityRegressionTest(c, k).regressed) regressed++;
      }
    }
    const synthetic = [{ name: 'x1', description: '', criticalityWeight: 1 }, { name: 'x2', description: '', criticalityWeight: 1 },
      { name: 'x3', description: '', criticalityWeight: 1 }, { name: 'x4', description: '', criticalityWeight: 1 }];
    for (const c of synthetic) for (let i = 0; i < 40; i++) {
      if (simulateSecurityRegressionTest({ ...c, name: `${c.name}-${i}` } as any, REGRESSION_CHECK_TYPES[0]!).regressed) regressed++;
    }
    assert.ok(regressed > 0);
  });

  it('workspace root helper resolves to the repo root from the test directory', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    let dir = here;
    while (!existsSync(path.join(dir, 'pnpm-workspace.yaml')) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    assert.ok(existsSync(path.join(dir, 'experiments', 'audit-321-freeze')));
  });
});
