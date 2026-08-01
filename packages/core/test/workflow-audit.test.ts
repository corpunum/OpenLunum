import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createCheckpoint,
  buildAuditTrail,
  validateAuditCompleteness,
  reconstructWorkflowState,
  replayWorkflow,
  type WorkflowCheckpoint,
  type WorkflowStatus,
} from '../src/index.js';

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function makeCheckpoint(
  workflowId: string,
  stepIndex: number,
  status: WorkflowStatus,
  stateHash: string,
): WorkflowCheckpoint {
  return {
    id: `chk-test-${stepIndex}`,
    workflowId,
    stepIndex,
    status,
    timestamp: new Date(Date.now() + stepIndex * 1000).toISOString(),
    stateHash,
    metadata: {},
  };
}

describe('workflow-audit', () => {
  describe('createCheckpoint', () => {
    it('produces valid checkpoint with hash', () => {
      const cp = createCheckpoint('wf-1', 0, 'running', 'hello');

      assert.equal(cp.workflowId, 'wf-1');
      assert.equal(cp.stepIndex, 0);
      assert.equal(cp.status, 'running');
      assert.equal(cp.stateHash, hash('hello'));
      assert.ok(cp.id.startsWith('chk-'));
      assert.ok(cp.timestamp.length > 0);
      assert.deepStrictEqual(cp.metadata, {});
    });
  });

  describe('buildAuditTrail', () => {
    it('computes correct step counts', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 1, 'running', hash('s1')),
        makeCheckpoint('wf-1', 2, 'completed', hash('s2')),
      ];

      const trail = buildAuditTrail(checkpoints);

      assert.equal(trail.workflowId, 'wf-1');
      assert.equal(trail.totalSteps, 3);
      assert.equal(trail.completedSteps, 1);
      assert.equal(trail.checkpoints.length, 3);
      assert.ok(trail.startedAt.length > 0);
      assert.ok(trail.completedAt !== null);
    });
  });

  describe('validateAuditCompleteness', () => {
    it('passes for complete trail', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 1, 'running', hash('s1')),
        makeCheckpoint('wf-1', 2, 'completed', hash('s2')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const result = validateAuditCompleteness(trail);

      assert.equal(result.complete, true);
      assert.deepStrictEqual(result.gaps, []);
      assert.deepStrictEqual(result.issues, []);
    });

    it('detects missing first-running checkpoint', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'paused', hash('s0')),
        makeCheckpoint('wf-1', 1, 'completed', hash('s1')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const result = validateAuditCompleteness(trail);

      assert.equal(result.complete, false);
      assert.ok(
        result.issues.some((i) => i.includes("'paused'")),
      );
    });

    it('detects step index gaps', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 2, 'running', hash('s2')),
        makeCheckpoint('wf-1', 4, 'completed', hash('s4')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const result = validateAuditCompleteness(trail);

      assert.equal(result.complete, false);
      assert.deepStrictEqual(result.gaps, [1, 3]);
    });
  });

  describe('reconstructWorkflowState', () => {
    it('finds correct checkpoint', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 1, 'running', hash('s1')),
        makeCheckpoint('wf-1', 2, 'completed', hash('s2')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const state = reconstructWorkflowState(trail, 1);

      assert.equal(state.found, true);
      assert.equal(state.stepIndex, 1);
      assert.equal(state.stateHash, hash('s1'));
      assert.ok(state.checkpoint !== null);
    });

    it('returns not-found for empty trail', () => {
      const trail = buildAuditTrail([]);
      const state = reconstructWorkflowState(trail, 0);

      assert.equal(state.found, false);
      assert.equal(state.checkpoint, null);
      assert.equal(state.stateHash, null);
    });
  });

  describe('replayWorkflow', () => {
    it('detects hash divergence', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 1, 'running', hash('s1')),
        makeCheckpoint('wf-1', 2, 'completed', hash('s2')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const result = replayWorkflow(trail, [hash('s0'), 'wrong-hash', hash('s2')]);

      assert.equal(result.hashesMatch, false);
      assert.equal(result.divergenceAtStep, 1);
      assert.equal(result.replayedSteps, 2);
    });

    it('passes for matching hashes', () => {
      const checkpoints = [
        makeCheckpoint('wf-1', 0, 'running', hash('s0')),
        makeCheckpoint('wf-1', 1, 'running', hash('s1')),
        makeCheckpoint('wf-1', 2, 'completed', hash('s2')),
      ];
      const trail = buildAuditTrail(checkpoints);
      const result = replayWorkflow(trail, [hash('s0'), hash('s1'), hash('s2')]);

      assert.equal(result.hashesMatch, true);
      assert.equal(result.divergenceAtStep, null);
      assert.equal(result.replayedSteps, 3);
      assert.equal(result.workflowId, 'wf-1');
    });
  });
});
