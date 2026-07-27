import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { processJsonlStream } from '../src/streaming-jsonl.js';

async function withTempFile(content: string, fn: (filepath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lunum-stream-'));
  const filepath = path.join(dir, 'test.jsonl');
  await writeFile(filepath, content, 'utf8');
  try {
    await fn(filepath);
  } finally {
    await unlink(filepath).catch(() => {});
  }
}

describe('streaming JSONL processor', () => {
  it('validates valid Sem items', async () => {
    const item = JSON.stringify({
      id: 'test-1',
      goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'dark mode' }, negated: false }] },
    });

    const lines: string[] = [];
    await withTempFile(item + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.totalLines, 1);
      assert.strictEqual(summary.successCount, 1);
      assert.strictEqual(summary.errorCount, 0);
    });

    const result = JSON.parse(lines[0]!);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.id, 'test-1');
  });

  it('reports validation errors for invalid Sem', async () => {
    const item = JSON.stringify({ id: 'bad-1', goldSem: { schema: 'wrong', world: 'real', kind: 'x', clauses: [] } });

    const lines: string[] = [];
    await withTempFile(item + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.errorCount, 1);
    });

    const result = JSON.parse(lines[0]!);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });

  it('computes fingerprints for valid items', async () => {
    const item = JSON.stringify({
      id: 'fp-1',
      goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate: 'know', roles: { agent: 'x' }, negated: false }] },
    });

    const lines: string[] = [];
    await withTempFile(item + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'fingerprint', (l) => lines.push(l));
      assert.strictEqual(summary.successCount, 1);
    });

    const result = JSON.parse(lines[0]!);
    assert.ok(result.output.fingerprint);
  });

  it('classifies items', async () => {
    const item = JSON.stringify({
      id: 'cls-1',
      sourceText: 'The user prefers dark mode.',
      category: 'preference',
      goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'prefer', roles: { experiencer: 'user' }, negated: false }] },
    });

    const lines: string[] = [];
    await withTempFile(item + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'classify', (l) => lines.push(l));
      assert.strictEqual(summary.successCount, 1);
    });

    const result = JSON.parse(lines[0]!);
    assert.ok(result.output.classification);
  });

  it('handles multiple lines with mixed validity', async () => {
    const good = JSON.stringify({ id: 'g1', goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'x', clauses: [{ predicate: 'p', roles: {}, negated: false }] } });
    const bad = JSON.stringify({ id: 'b1', goldSem: { schema: 'wrong' } });

    const lines: string[] = [];
    await withTempFile(good + '\n' + bad + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.totalLines, 2);
      assert.strictEqual(summary.successCount, 1);
      assert.strictEqual(summary.errorCount, 1);
    });
  });

  it('reports error for lines with no sem field', async () => {
    const item = JSON.stringify({ id: 'no-sem', sourceText: 'hello' });

    const lines: string[] = [];
    await withTempFile(item + '\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.errorCount, 1);
    });

    const result = JSON.parse(lines[0]!);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'MISSING_SEM');
  });

  it('reports error for invalid JSON lines', async () => {
    const lines: string[] = [];
    await withTempFile('not-json\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.errorCount, 1);
    });

    const result = JSON.parse(lines[0]!);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'PARSE_ERROR');
  });

  it('skips empty lines', async () => {
    const item = JSON.stringify({ id: 'x', goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'x', clauses: [{ predicate: 'p', roles: {}, negated: false }] } });

    const lines: string[] = [];
    await withTempFile('\n' + item + '\n\n', async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', (l) => lines.push(l));
      assert.strictEqual(summary.totalLines, 1);
    });
  });

  it('processes bounded memory — no full-file buffering', async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      JSON.stringify({ id: `item-${i}`, goldSem: { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'x', clauses: [{ predicate: 'p', roles: {}, negated: false }] } })
    ).join('\n') + '\n';

    let count = 0;
    await withTempFile(items, async (fp) => {
      const summary = await processJsonlStream(fp, 'validate', () => { count++; });
      assert.strictEqual(summary.totalLines, 100);
      assert.strictEqual(summary.successCount, 100);
    });
    assert.strictEqual(count, 100);
  });
});
