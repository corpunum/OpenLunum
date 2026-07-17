/**
 * OpenUnum shadow-mode live integration test
 *
 * Tests shadow mode against real Lunum records with diverse
 * semantic structures, validating comparison accuracy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ShadowModeAdapter } from '../src/shadow-mode.js';
import type { LunumRecord, LunumSem } from '@corpunum/lunum';

// ── Test fixtures ──────────────────────────────────────────────────

function buildRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'The user prefers concise answers.', language: 'en', role: 'user', ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{
        predicate: 'prefer',
        roles: {
          experiencer: { type: 'actor', id: 'user' },
          theme: { type: 'concept', id: 'concise_answers' }
        },
        negated: false
      }],
      annotations: { sourceText: 'The user prefers concise answers.', sourceLanguage: 'en' }
    },
    fingerprint: 'test-fp',
    renderings: {},
    policy: { eligible: true, category: 'preference', risk: 'low' as const, confidence: 0.95, reasons: [] },
    meta: { createdAt: Date.now() },
    ...overrides
  };
}

function makeShadowSem(record: Record<string, unknown>): LunumSem {
  return record.sem as unknown as LunumSem;
}

// ── Live integration tests ─────────────────────────────────────────

test('shadow live: processes preference record and matches semantics', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const record = buildRecord();
  const shadowSem = makeShadowSem(record);

  const result = adapter.process(record as any, shadowSem);

  assert.ok(result.shadow, 'shadow record should be created');
  assert.ok(result.comparison, 'comparison should exist when compareWithProduction is true');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'semantics should match');
  assert.strictEqual(result.comparison!.differences.filter(d => !d.includes('Fingerprint mismatch')).length, 0, 'only fingerprint diff expected');
});

test('shadow live: detects fingerprint mismatch when shadow differs', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const record = buildRecord();
  const shadowSem = { ...(record.sem as Record<string, unknown>), kind: 'safety_constraint' } as LunumSem;

  const result = adapter.process(record as any, shadowSem);

  assert.ok(result.shadow, 'shadow record should be created');
  assert.ok(result.comparison, 'comparison should exist');
  assert.strictEqual(result.comparison!.fingerprintsMatch, false, 'fingerprints should not match');
  assert.strictEqual(result.comparison!.semanticsMatch, false, 'semantics should not match');
  assert.ok(result.comparison!.differences.length > 0, 'should have differences');
});

test('shadow live: handles complex nested clauses', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const complexRecord: Record<string, unknown> = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'If fatal error, retry up to 3 times.', language: 'en', role: 'user', ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'conditional_instruction',
      clauses: [{
        predicate: 'require',
        roles: {
          agent: { type: 'actor', id: 'assistant' },
          theme: { type: 'action', id: 'retry' }
        },
        conditions: [{
          predicate: 'error',
          roles: { level: { type: 'concept', id: 'fatal' } },
          negated: false
        }],
        consequences: [{
          predicate: 'execute',
          roles: { action: { type: 'action', id: 'retry' }, count: { type: 'quantity', value: 3 } },
          modality: 'certainty'
        }],
        negated: false
      }],
      annotations: {}
    },
    fingerprint: 'test-fp',
    renderings: {},
    policy: { eligible: true, category: 'instruction', risk: 'medium' as const, confidence: 0.9, reasons: [] },
    meta: {},
    annotations: {}
  };

  const shadowSem = makeShadowSem(complexRecord);
  const result = adapter.process(complexRecord as any, shadowSem);

  assert.ok(result.shadow, 'shadow record should be created for complex sem');
  assert.ok(result.comparison, 'comparison should exist');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'complex semantics should match');
});

test('shadow live: stores multiple records correctly', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true,
    maxRecords: 10
  });

  const record1 = buildRecord();
  const record2 = buildRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'safety_constraint',
      clauses: [{
        predicate: 'require',
        roles: { agent: { type: 'actor', id: 'assistant' }, action: { type: 'action', id: 'confirm' } },
        negated: false
      }]
    }
  });

  const shadow1 = makeShadowSem(record1);
  const shadow2 = makeShadowSem(record2);

  adapter.process(record1 as any, shadow1);
  adapter.process(record2 as any, shadow2);

  const records = adapter.getShadowRecords();
  assert.strictEqual(records.length, 2, 'should have two shadow records');
  assert.ok(records[0]!.comparison, 'first record should have comparison');
  assert.ok(records[1]!.comparison, 'second record should have comparison');
  assert.strictEqual(records[0]!.comparison!.semanticsMatch, true);
  assert.strictEqual(records[1]!.comparison!.semanticsMatch, true);
});

test('shadow live: respects maxRecords limit', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    maxRecords: 3
  });

  for (let i = 0; i < 5; i++) {
    const base = buildRecord();
    const record = buildRecord({ sem: { ...(base.sem as Record<string, unknown>), kind: `test-${i}` } });
    const shadow = makeShadowSem(record);
    adapter.process(record as any, shadow);
  }

  const records = adapter.getShadowRecords();
  assert.strictEqual(records.length, 3, 'should respect maxRecords limit');
});

test('shadow live: disabled adapter returns null shadow', () => {
  const adapter = new ShadowModeAdapter({ enabled: false });

  const record = buildRecord();
  const result = adapter.process(record as any, makeShadowSem(record));

  assert.strictEqual(result.shadow, null, 'disabled adapter should return null shadow');
  assert.strictEqual(result.comparison, undefined, 'no comparison when disabled');
});

test('shadow live: handles record with provenance', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const baseRecord = buildRecord();
  const record = buildRecord({
    sem: { ...(baseRecord.sem as any), provenance: { author: 'test-user', timestamp: '2025-01-01T00:00:00Z' } }
  });

  const result = adapter.process(record as any, makeShadowSem(record));

  assert.ok(result.shadow, 'shadow should be created for record with provenance');
  assert.ok(result.comparison, 'comparison should exist');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'semantics with provenance should match');
});

test('shadow live: handles record with references', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const baseRecord = buildRecord();
  const record = buildRecord({
    sem: { ...(baseRecord.sem as Record<string, unknown>), references: [{ type: 'document', id: 'doc-1' }] }
  });

  const result = adapter.process(record as any, makeShadowSem(record));

  assert.ok(result.shadow, 'shadow should be created for record with references');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'semantics with references should match');
});

test('shadow live: statistics track correctly', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true,
    maxRecords: 100
  });

  const record = buildRecord();
  adapter.process(record as any, makeShadowSem(record));

  const stats = adapter.getStats();

  assert.strictEqual(stats.enabled, true);
  assert.strictEqual(stats.compareWithProduction, true);
  assert.strictEqual(stats.maxRecords, 100);
  assert.strictEqual(stats.totalRecords, 1);
});

test('shadow live: clear removes all records', () => {
  const adapter = new ShadowModeAdapter({ enabled: true });

  const record = buildRecord();
  adapter.process(record as any, makeShadowSem(record));
  adapter.process(record as any, makeShadowSem(record));

  assert.strictEqual(adapter.getShadowRecords().length, 2);
  assert.strictEqual(adapter.getStats().totalRecords, 2);

  adapter.clear();

  assert.strictEqual(adapter.getShadowRecords().length, 0);
  assert.strictEqual(adapter.getStats().totalRecords, 0);
});

test('shadow live: config update affects behavior', () => {
  const adapter = new ShadowModeAdapter({ enabled: false, maxRecords: 100 });

  const record = buildRecord();
  let result = adapter.process(record as any, makeShadowSem(record));
  assert.strictEqual(result.shadow, null);

  adapter.setConfig({ enabled: true, compareWithProduction: true });
  result = adapter.process(record as any, makeShadowSem(record));

  assert.ok(result.shadow, 'shadow should be created after enabling');
  assert.ok(result.comparison, 'comparison should exist after enabling compare');

  const config = adapter.getConfig();
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.maxRecords, 100);
  assert.strictEqual(config.compareWithProduction, true);
});

test('shadow live: negation handled correctly', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const record = buildRecord({
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'safety_constraint',
      clauses: [{
        predicate: 'delete',
        roles: {
          agent: { type: 'actor', id: 'assistant' },
          object: { type: 'concept', id: 'files' }
        },
        negated: true
      }]
    }
  });

  const result = adapter.process(record as any, makeShadowSem(record));

  assert.ok(result.shadow, 'shadow should handle negation');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'negated semantics should match');
});

test('shadow live: condition and consequence handling', () => {
  const adapter = new ShadowModeAdapter({
    enabled: true,
    compareWithProduction: true
  });

  const record: Record<string, unknown> = {
    recordVersion: 'lunum-record/0.1-draft',
    source: { text: 'Test condition.', language: 'en', role: 'user', ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'conditional_instruction',
      clauses: [{
        predicate: 'require',
        roles: {
          agent: { type: 'actor', id: 'system' },
          theme: { type: 'action', id: 'notify' }
        },
        conditions: [{
          predicate: 'critical',
          roles: { level: { type: 'concept', id: 'high' } },
          negated: false
        }],
        consequences: [{
          predicate: 'send',
          roles: { recipient: { type: 'actor', id: 'admin' }, channel: { type: 'concept', id: 'alert' } },
          modality: 'certainty'
        }],
        negated: false
      }]
    },
    fingerprint: 'test',
    renderings: {},
    policy: { eligible: true, category: 'instruction', risk: 'high' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };

  const result = adapter.process(record as any, makeShadowSem(record));

  assert.ok(result.shadow, 'shadow should handle conditions and consequences');
  assert.strictEqual(result.comparison!.semanticsMatch, true, 'conditional semantics should match');
});
