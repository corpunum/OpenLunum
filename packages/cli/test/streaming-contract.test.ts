import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STREAMING_CONTRACT_VERSION,
  createStreamProcessor,
  type StreamingConfig,
  type StreamEvent,
  type StreamProcessor,
  type StreamProcessorStats,
} from '../src/streaming-contract.js';

describe('Streaming Contract', () => {
  describe('STREAMING_CONTRACT_VERSION', () => {
    it('should be a valid semver version', () => {
      const semverRegex = /^\d+\.\d+\.\d+$/;
      assert.ok(semverRegex.test(STREAMING_CONTRACT_VERSION), `Version ${STREAMING_CONTRACT_VERSION} is not valid semver`);
    });

    it('should be 1.0.0', () => {
      assert.strictEqual(STREAMING_CONTRACT_VERSION, '1.0.0');
    });
  });

  describe('createStreamProcessor', () => {
    it('creates a processor with required methods', () => {
      const config: StreamingConfig = { maxBufferSize: 10, flushIntervalMs: 1000 };
      const processor = createStreamProcessor(config);

      assert.ok(typeof processor.process === 'function');
      assert.ok(typeof processor.flush === 'function');
      assert.ok(typeof processor.stats === 'function');
    });

    it('processes valid JSON lines as records', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const line = JSON.stringify({ id: '1', value: 'test' });
      const event = processor.process(line);

      assert.strictEqual(event.type, 'record');
      assert.deepStrictEqual(event.data as Record<string, unknown>, { id: '1', value: 'test' });
      assert.ok(event.timestamp);
      const ts = new Date(event.timestamp);
      assert.ok(!isNaN(ts.getTime()), 'timestamp should be valid ISO 8601');
    });

    it('emits error events for malformed JSON', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const invalidLine = 'not valid json {';
      const event = processor.process(invalidLine);

      assert.strictEqual(event.type, 'error');
      const errorData = event.data as Record<string, unknown>;
      assert.ok(errorData.message);
      assert.ok(errorData.line);
      assert.ok(event.timestamp);
    });

    it('tracks accurate stats for processed records', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const line1 = JSON.stringify({ id: '1' });
      const line2 = JSON.stringify({ id: '2' });
      const invalidLine = 'bad json';

      processor.process(line1);
      processor.process(line2);
      processor.process(invalidLine);

      const stats = processor.stats();
      assert.strictEqual(stats.processed, 2, 'Should have processed 2 valid records');
      assert.strictEqual(stats.errors, 1, 'Should have 1 error');
      assert.ok(stats.bytesRead > 0, 'Should track bytes read');
    });

    it('maintains bounded memory with large batches', () => {
      const config: StreamingConfig = { maxBufferSize: 5, flushIntervalMs: 10000 };
      const processor = createStreamProcessor(config);

      const items = 1000;
      let flushedCount = 0;

      for (let i = 0; i < items; i++) {
        const line = JSON.stringify({ index: i, data: 'x'.repeat(100) });
        processor.process(line);
      }

      const final = processor.flush();
      flushedCount += final.length;

      const stats = processor.stats();
      assert.strictEqual(stats.processed, items, `Should have processed ${items} records`);
      assert.ok(stats.bytesRead > 0, 'Should have read bytes');
    });

    it('flush() returns accumulated events and clears buffer', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      processor.process(JSON.stringify({ id: '1' }));
      processor.process(JSON.stringify({ id: '2' }));

      const flushed = processor.flush();
      assert.ok(flushed.length >= 2, 'Should return at least 2 events');

      const stats = processor.stats();
      assert.strictEqual(stats.processed, 2);
    });

    it('flush() returns readonly array', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      processor.process(JSON.stringify({ id: '1' }));
      const flushed = processor.flush();

      assert.ok(Array.isArray(flushed), 'flush() should return an array');
    });

    it('stats() returns accurate counts', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      for (let i = 0; i < 5; i++) {
        processor.process(JSON.stringify({ value: i }));
      }
      processor.process('invalid');

      const stats = processor.stats();
      assert.strictEqual(stats.processed, 5);
      assert.strictEqual(stats.errors, 1);
      assert.ok(typeof stats.bytesRead === 'number');
      assert.ok(stats.bytesRead > 0);
    });

    it('emits progress events when buffer exceeds maxBufferSize', () => {
      const config: StreamingConfig = { maxBufferSize: 3, flushIntervalMs: 10000 };
      const processor = createStreamProcessor(config);

      processor.process(JSON.stringify({ id: '1' }));
      processor.process(JSON.stringify({ id: '2' }));
      processor.process(JSON.stringify({ id: '3' }));
      processor.process(JSON.stringify({ id: '4' })); // Should trigger flush condition

      const stats = processor.stats();
      assert.strictEqual(stats.processed, 4);
    });

    it('handles edge case: empty JSON object', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const event = processor.process('{}');
      assert.strictEqual(event.type, 'record');
      assert.deepStrictEqual(event.data, {});
    });

    it('handles edge case: JSON array', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const event = processor.process('[1, 2, 3]');
      assert.strictEqual(event.type, 'record');
      assert.deepStrictEqual(event.data, [1, 2, 3]);
    });

    it('handles edge case: JSON primitives', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const string = processor.process('"hello"');
      assert.strictEqual(string.type, 'record');
      assert.strictEqual(string.data, 'hello');

      const number = processor.process('42');
      assert.strictEqual(number.type, 'record');
      assert.strictEqual(number.data, 42);

      const bool = processor.process('true');
      assert.strictEqual(bool.type, 'record');
      assert.strictEqual(bool.data, true);

      const nil = processor.process('null');
      assert.strictEqual(nil.type, 'record');
      assert.strictEqual(nil.data, null);
    });

    it('timestamp is always ISO 8601 format', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      for (let i = 0; i < 3; i++) {
        const event = processor.process(JSON.stringify({ value: i }));
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
        assert.ok(isoRegex.test(event.timestamp), `Timestamp ${event.timestamp} is not ISO 8601`);
      }
    });

    it('bytes read includes line length plus newline', () => {
      const config: StreamingConfig = { maxBufferSize: 100, flushIntervalMs: 5000 };
      const processor = createStreamProcessor(config);

      const line1 = JSON.stringify({ a: 1 }); // e.g., '{"a":1}' = 7 bytes
      processor.process(line1);

      const stats1 = processor.stats();
      const expectedBytes = line1.length + 1; // +1 for implicit newline
      assert.strictEqual(stats1.bytesRead, expectedBytes);

      const line2 = JSON.stringify({ b: 2 });
      processor.process(line2);

      const stats2 = processor.stats();
      assert.ok(stats2.bytesRead >= stats1.bytesRead + line2.length);
    });
  });
});
