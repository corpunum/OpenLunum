import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  formatCliError,
  formatCliSuccess,
  formatStructuredError,
  getContractManifest,
  type CliErrorOutput,
  type CliSuccessOutput,
} from '../src/cli-contract.js';
import { processJsonlStream } from '../src/streaming-jsonl.js';
import { fingerprintSem, validateSem, type LunumSem } from '@corpunum/lunum';

function makeSem(predicate = 'location'): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{ predicate, roles: { subject: { type: 'entity', id: 'paris' } }, negated: false }],
    references: [],
    provenance: { source: 'test', timestamp: '2026-01-01T00:00:00Z' },
    annotations: {},
  } as unknown as LunumSem;
}

describe('CLI performance', () => {
  it('formatCliError completes in <50ms for 100 calls', () => {
    const err: CliErrorOutput = { code: 1, command: 'test', message: 'test error' };
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) formatCliError(err);
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    assert.ok(ms < 50, `100 formatCliError calls took ${ms.toFixed(1)}ms`);
  });

  it('formatCliSuccess completes in <50ms for 100 calls', () => {
    const out: CliSuccessOutput = { code: 0, command: 'test', data: { ok: true } };
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) formatCliSuccess(out);
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    assert.ok(ms < 50, `100 formatCliSuccess calls took ${ms.toFixed(1)}ms`);
  });

  it('getContractManifest completes in <50ms for 100 calls', () => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) getContractManifest();
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    assert.ok(ms < 50, `100 getContractManifest calls took ${ms.toFixed(1)}ms`);
  });

  it('fingerprintSem p95 under 5ms per item for 100 items', () => {
    const sems = Array.from({ length: 100 }, (_, i) => makeSem(`pred_${i}`));
    const durations: number[] = [];
    for (const sem of sems) {
      const start = process.hrtime.bigint();
      fingerprintSem(sem);
      durations.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[94]!;
    assert.ok(p95 < 5, `fingerprintSem p95 was ${p95.toFixed(2)}ms, expected <5ms`);
  });

  it('validateSem p95 under 5ms per item for 100 items', () => {
    const sems = Array.from({ length: 100 }, (_, i) => makeSem(`pred_${i}`));
    const durations: number[] = [];
    for (const sem of sems) {
      const start = process.hrtime.bigint();
      validateSem(sem);
      durations.push(Number(process.hrtime.bigint() - start) / 1_000_000);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[94]!;
    assert.ok(p95 < 5, `validateSem p95 was ${p95.toFixed(2)}ms, expected <5ms`);
  });

  it('processJsonlStream handles 100 lines under 500ms total', async () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      JSON.stringify({ sem: makeSem(`pred_${i}`) }),
    );
    const input = lines.join('\n');
    const readable = Readable.from([input]);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const start = process.hrtime.bigint();
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.totalLines, 100);
    assert.equal(summary.successCount, 100);
    assert.equal(results.length, 100);
    assert.ok(ms < 500, `100-line stream took ${ms.toFixed(1)}ms, expected <500ms`);
  });
});

describe('CLI failure injection', () => {
  it('malformed JSON input produces structured error', async () => {
    const readable = Readable.from(['not valid json\n']);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.errorCount, 1);
    assert.equal(summary.successCount, 0);
    const parsed = JSON.parse(results[0]!);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'PARSE_ERROR');
  });

  it('schema-invalid sem produces validation error with details', async () => {
    const input = JSON.stringify({ sem: { schema: 'wrong', kind: 123 } }) + '\n';
    const readable = Readable.from([input]);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.errorCount, 1);
    const parsed = JSON.parse(results[0]!);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.output.errors.length > 0);
  });

  it('empty input produces zero-line summary without crash', async () => {
    const readable = Readable.from(['']);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.totalLines, 0);
    assert.equal(summary.successCount, 0);
    assert.equal(summary.errorCount, 0);
    assert.equal(results.length, 0);
  });

  it('extremely long single record (>1MB) is processed without crash', async () => {
    const longValue = 'x'.repeat(1_000_000);
    const input = JSON.stringify({ sem: makeSem('test'), extra: longValue }) + '\n';
    const readable = Readable.from([input]);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.totalLines, 1);
    assert.equal(results.length, 1);
  });

  it('missing sem field produces MISSING_SEM structured error', async () => {
    const input = JSON.stringify({ id: 'no-sem', data: 'hello' }) + '\n';
    const readable = Readable.from([input]);
    const origStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: readable, configurable: true });

    const results: string[] = [];
    const summary = await processJsonlStream('-', 'validate', (json) => results.push(json));

    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });

    assert.equal(summary.errorCount, 1);
    const parsed = JSON.parse(results[0]!);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'MISSING_SEM');
    assert.equal(parsed.id, 'no-sem');
  });

  it('formatStructuredError produces valid error shape', () => {
    const err = formatStructuredError('TEST_CODE', 'test message', {
      details: { field: 'value' },
      command: 'test-cmd',
      exitCode: 1,
    });
    assert.equal(err.code, 'TEST_CODE');
    assert.equal(err.message, 'test message');
    assert.deepStrictEqual(err.details, { field: 'value' });
  });
});
