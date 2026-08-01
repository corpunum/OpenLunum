/**
 * Tests for evidence supersession registry (issue #565, R13.7).
 *
 * Covers:
 * - createSupersession produces valid record with preservedEvidence=true
 * - createCorrection captures original and corrected claims
 * - buildSupersessionChain follows multi-step chains
 * - buildSupersessionChain returns empty for non-superseded evidence
 * - validateNoHistoryRewriting passes for valid registry
 * - validateNoHistoryRewriting detects circular chains
 * - validateNoHistoryRewriting detects deleted evidence (preservedEvidence=false)
 * - snapshotEvidence shows correct status for superseded evidence
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSupersession,
  createCorrection,
  buildSupersessionChain,
  validateNoHistoryRewriting,
  snapshotEvidence,
  type SupersessionRecord,
  type CorrectionEntry,
  type SupersessionRegistry,
} from '../src/evidence-supersession.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistry(
  records: SupersessionRecord[] = [],
  corrections: CorrectionEntry[] = [],
): SupersessionRegistry {
  return { records, corrections };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evidence-supersession', () => {
  describe('createSupersession', () => {
    it('produces valid record with preservedEvidence=true', () => {
      const record = createSupersession('ev-1', 'ev-2', 'Newer data available');

      assert.ok(record.id.length > 0, 'id should be non-empty');
      assert.equal(record.supersededId, 'ev-1');
      assert.equal(record.supersededBy, 'ev-2');
      assert.equal(record.reason, 'Newer data available');
      assert.equal(record.preservedEvidence, true);
      // Timestamp should be a valid ISO string
      assert.ok(!Number.isNaN(Date.parse(record.timestamp)), 'timestamp should be valid ISO');
    });
  });

  describe('createCorrection', () => {
    it('captures original and corrected claims', () => {
      const correction = createCorrection(
        'Model accuracy is 95%',
        'Model accuracy is 93%',
        'Scoring bug in original evaluation',
        ['ev-1', 'ev-3'],
      );

      assert.ok(correction.id.length > 0, 'id should be non-empty');
      assert.equal(correction.originalClaim, 'Model accuracy is 95%');
      assert.equal(correction.correctedClaim, 'Model accuracy is 93%');
      assert.equal(correction.correctionReason, 'Scoring bug in original evaluation');
      assert.deepStrictEqual(correction.evidenceIds, ['ev-1', 'ev-3']);
      assert.ok(!Number.isNaN(Date.parse(correction.timestamp)), 'timestamp should be valid ISO');
    });
  });

  describe('buildSupersessionChain', () => {
    it('follows multi-step chains', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'First update',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: true,
      };
      const r2: SupersessionRecord = {
        id: 'sr-2',
        supersededId: 'ev-2',
        supersededBy: 'ev-3',
        reason: 'Second update',
        timestamp: '2026-02-01T00:00:00.000Z',
        preservedEvidence: true,
      };
      const r3: SupersessionRecord = {
        id: 'sr-3',
        supersededId: 'ev-3',
        supersededBy: 'ev-4',
        reason: 'Third update',
        timestamp: '2026-03-01T00:00:00.000Z',
        preservedEvidence: true,
      };

      const registry = makeRegistry([r1, r2, r3]);
      const chain = buildSupersessionChain(registry, 'ev-1');

      assert.equal(chain.length, 3);
      assert.equal(chain[0]?.id, 'sr-1');
      assert.equal(chain[1]?.id, 'sr-2');
      assert.equal(chain[2]?.id, 'sr-3');
    });

    it('returns empty for non-superseded evidence', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'Update',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: true,
      };

      const registry = makeRegistry([r1]);
      const chain = buildSupersessionChain(registry, 'ev-99');

      assert.equal(chain.length, 0);
    });
  });

  describe('validateNoHistoryRewriting', () => {
    it('passes for valid registry', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'Update',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: true,
      };
      const correction: CorrectionEntry = {
        id: 'cr-1',
        originalClaim: 'Old claim',
        correctedClaim: 'New claim',
        correctionReason: 'Bug fix',
        timestamp: '2026-01-02T00:00:00.000Z',
        evidenceIds: ['ev-1'],
      };

      const registry = makeRegistry([r1], [correction]);
      const result = validateNoHistoryRewriting(registry);

      assert.equal(result.valid, true);
      assert.deepStrictEqual(result.issues, []);
    });

    it('detects circular chains', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'Update',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: true,
      };
      const r2: SupersessionRecord = {
        id: 'sr-2',
        supersededId: 'ev-2',
        supersededBy: 'ev-1',
        reason: 'Circular',
        timestamp: '2026-01-02T00:00:00.000Z',
        preservedEvidence: true,
      };

      const registry = makeRegistry([r1, r2]);
      const result = validateNoHistoryRewriting(registry);

      assert.equal(result.valid, false);
      assert.ok(
        result.issues.some((i) => i.includes('Circular')),
        'should report circular chain',
      );
    });

    it('detects deleted evidence (preservedEvidence=false)', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'Update',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: false,
      };

      const registry = makeRegistry([r1]);
      const result = validateNoHistoryRewriting(registry);

      assert.equal(result.valid, false);
      assert.ok(
        result.issues.some((i) => i.includes('not preserved')),
        'should report unpreserved evidence',
      );
    });
  });

  describe('snapshotEvidence', () => {
    it('shows correct status for superseded evidence', () => {
      const r1: SupersessionRecord = {
        id: 'sr-1',
        supersededId: 'ev-1',
        supersededBy: 'ev-2',
        reason: 'Better data',
        timestamp: '2026-01-01T00:00:00.000Z',
        preservedEvidence: true,
      };
      const r2: SupersessionRecord = {
        id: 'sr-2',
        supersededId: 'ev-2',
        supersededBy: 'ev-3',
        reason: 'Even better data',
        timestamp: '2026-02-01T00:00:00.000Z',
        preservedEvidence: true,
      };

      const registry = makeRegistry([r1, r2]);
      const snapshot = snapshotEvidence(registry, 'ev-1', 'Original claim');

      assert.equal(snapshot.evidenceId, 'ev-1');
      assert.equal(snapshot.claim, 'Original claim');
      assert.equal(snapshot.status, 'superseded');
      assert.deepStrictEqual(snapshot.supersessionChain, ['sr-1', 'sr-2']);
      assert.ok(!Number.isNaN(Date.parse(snapshot.snapshotAt)), 'snapshotAt should be valid ISO');
    });

    it('shows current status for non-superseded evidence', () => {
      const registry = makeRegistry();
      const snapshot = snapshotEvidence(registry, 'ev-5', 'Active claim');

      assert.equal(snapshot.status, 'current');
      assert.deepStrictEqual(snapshot.supersessionChain, []);
    });

    it('shows corrected status for evidence referenced in corrections', () => {
      const correction: CorrectionEntry = {
        id: 'cr-1',
        originalClaim: 'Wrong claim',
        correctedClaim: 'Right claim',
        correctionReason: 'Typo',
        timestamp: '2026-01-01T00:00:00.000Z',
        evidenceIds: ['ev-7'],
      };

      const registry = makeRegistry([], [correction]);
      const snapshot = snapshotEvidence(registry, 'ev-7', 'Right claim');

      assert.equal(snapshot.status, 'corrected');
    });
  });
});
