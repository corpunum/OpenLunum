import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  rollbackToSource,
  rollbackBatch,
  verifySourceAuthentic,
  type RollbackResult,
  type IntegrityStatus,
  type ProvenanceStatus
} from '../src/rollback-process.js';
import { migrateFingerprint } from '../src/fingerprint-migration.js';
import type { LunumRecord, LunumSem } from '../src/types.js';

function makeRecord(id: string, sourceText: string): LunumRecord {
  const sem: LunumSem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'fact',
    clauses: [{
      predicate: 'test',
      roles: {}
    }],
    provenance: {
      source: 'test-source',
      timestamp: Date.now()
    }
  };
  const fingerprint = migrateFingerprint(sem);
  return {
    recordVersion: 'lunum-record/0.2',
    source: {
      text: sourceText,
      language: 'en',
      role: 'user',
      ref: null
    },
    sem,
    fingerprint,
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low' as const,
      confidence: 0.9,
      reasons: ['test reason']
    },
    meta: {}
  };
}

function tamperRecord(record: LunumRecord, badFingerprint: string): LunumRecord {
  return { ...record, fingerprint: badFingerprint };
}

function computeSourceDigest(source: { text: string; language: string | null }): string {
  const normalized = `${source.language || ''}::${source.text}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

describe('rollback-process', () => {
  it('rollbackToSource returns verified status when fingerprint matches', () => {
    const record = makeRecord('test-1', 'Original source text');
    const result = rollbackToSource(record);

    assert.ok(result.success);
    assert.equal(result.source.text, 'Original source text');
    assert.ok(result.integrityStatus === 'verified' || result.integrityStatus === 'absent');
  });

  it('rollbackToSource detects fingerprint mismatch', () => {
    const record = makeRecord('test-1', 'Original source text');
    record.fingerprint = 'lfp:0.2:sha256:bbbbb'; // Wrong fingerprint

    const result = rollbackToSource(record);

    assert.equal(result.integrityStatus, 'failed');
  });

  it('rollbackToSource uses expectedSourceDigest when provided', () => {
    const record = makeRecord('test-1', 'Original source text');
    const digest = computeSourceDigest(record.source);

    const result = rollbackToSource(record, { expectedSourceDigest: digest });

    assert.equal(result.sourceStatus, 'verified');
    assert.equal(result.details.length > 0, true);
  });

  it('rollbackToSource detects source mismatch with expected digest', () => {
    const record = makeRecord('test-1', 'Original source text');

    const result = rollbackToSource(record, { expectedSourceDigest: 'wrong-digest' });

    assert.equal(result.sourceStatus, 'failed');
  });

  it('rollbackToSource warns on empty source text', () => {
    const record = makeRecord('test-1', '');

    const result = rollbackToSource(record);

    assert.ok(result.warnings.some(w => w.includes('empty') || w.includes('missing')),
      `Expected warning about empty source, got: ${result.warnings}`);
  });

  it('rollbackBatch returns per-record results and summary', () => {
    const records = [
      makeRecord('test-1', 'Source 1'),
      makeRecord('test-2', 'Source 2')
    ];

    const summary = rollbackBatch(records);

    assert.equal(summary.total, 2);
    assert.equal(summary.results.length, 2);
    assert.ok(summary.success >= 0);
    assert.ok(summary.overallIntegrityStatus === 'verified' || summary.overallIntegrityStatus === 'failed');
  });

  it('rollbackBatch preserves input order', () => {
    const records = [
      makeRecord('test-a', 'Source A'),
      makeRecord('test-b', 'Source B')
    ];

    const summary = rollbackBatch(records);

    assert.ok(summary.results[0] !== undefined && summary.results[1] !== undefined);
    assert.ok(records[0] !== undefined && records[1] !== undefined);
    assert.equal(summary.results[0]!.record.fingerprint, records[0]!.fingerprint);
    assert.equal(summary.results[1]!.record.fingerprint, records[1]!.fingerprint);
  });

  it('rollbackBatch detects mixed success/failure', () => {
    const goodRecord = makeRecord('test-1', 'Good source');
    const badRecord = tamperRecord(goodRecord, 'lfp:0.2:sha256:bad');

    const summary = rollbackBatch([goodRecord, badRecord]);

    assert.ok(summary.failed > 0 || summary.overallIntegrityStatus === 'failed');
  });

  it('verifySourceAuthentic returns true for matching digest', () => {
    const record = makeRecord('test-1', 'Test text');
    const digest = computeSourceDigest(record.source);

    assert.ok(verifySourceAuthentic(record, digest));
  });

  it('verifySourceAuthentic returns false for non-matching digest', () => {
    const record = makeRecord('test-1', 'Test text');

    assert.ok(!verifySourceAuthentic(record, 'wrong-digest'));
  });

  // ── Fail-closed behavior tests (rebuild of PR #127) ────────────────

  it('rollbackToSource fails when source text is empty (fail closed)', () => {
    const record = makeRecord('test-1', '');
    const result = rollbackToSource(record);

    // Empty source should be a failure, not just a warning
    assert.equal(result.success, false);
    assert.equal(result.sourceStatus, 'absent');
  });

  it('rollbackToSource succeeds when fingerprint verified but provenance absent', () => {
    const sem: LunumSem = {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'fact',
      clauses: [{ predicate: 'test', roles: {} }]
    };
    const fingerprint = migrateFingerprint(sem);
    const record: LunumRecord = {
      recordVersion: 'lunum-record/0.2',
      source: { text: 'Test source', language: 'en', role: 'user', ref: null },
      sem,
      fingerprint,
      renderings: {},
      policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: ['test'] },
      meta: {}
    };
    const result = rollbackToSource(record);

    // Integrity verified, provenance absent, source verified — should succeed
    assert.equal(result.success, true);
    assert.equal(result.integrityStatus, 'verified');
    assert.equal(result.provenanceStatus, 'absent');
    assert.equal(result.sourceStatus, 'verified');
  });

  it('rollbackToSource fails when provenance digest mismatch', () => {
    const record = makeRecord('test-1', 'Test source');
    const result = rollbackToSource(record, { expectedProvenanceDigest: 'wrong-digest' });

    assert.equal(result.success, false);
    assert.equal(result.provenanceStatus, 'failed');
  });

  it('rollbackToSource fails when source digest mismatch', () => {
    const record = makeRecord('test-1', 'Test source');
    const result = rollbackToSource(record, { expectedSourceDigest: 'wrong-digest' });

    assert.equal(result.success, false);
    assert.equal(result.sourceStatus, 'failed');
  });

  it('rollbackToSource succeeds with matching external source digest', () => {
    const record = makeRecord('test-1', 'Test source');
    const sourceDigest = computeSourceDigest(record.source);

    const result = rollbackToSource(record, {
      expectedSourceDigest: sourceDigest
    });

    assert.equal(result.success, true);
    assert.equal(result.integrityStatus, 'verified');
    assert.equal(result.sourceStatus, 'verified');
  });

  it('rollbackBatch returns correct overall statuses', () => {
    const goodRecord = makeRecord('test-1', 'Good source');
    const badRecord = tamperRecord(goodRecord, 'lfp:0.2:sha256:bad');

    const summary = rollbackBatch([goodRecord, badRecord]);

    assert.equal(summary.total, 2);
    assert.equal(summary.success, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.overallIntegrityStatus, 'failed');
  });

  it('rollbackBatch with all good records returns verified overall status', () => {
    const records = [
      makeRecord('test-1', 'Source 1'),
      makeRecord('test-2', 'Source 2'),
      makeRecord('test-3', 'Source 3')
    ];

    const summary = rollbackBatch(records);

    assert.equal(summary.total, 3);
    assert.equal(summary.success, 3);
    assert.equal(summary.failed, 0);
    assert.equal(summary.overallIntegrityStatus, 'verified');
  });
});
