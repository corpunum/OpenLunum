import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCorrelationId,
  extractOrCreateCorrelationId,
  generateTraceId,
  generateSpanId,
  createTraceContext,
  deriveChildContext,
  formatTraceParent,
  parseTraceParent,
  extractOrCreateTraceContext,
  startSpan,
  addSpanEvent,
  endSpan,
  StructuredLogger,
  MetricsRegistry,
  defaultMetricsRegistry,
  beginRequest,
  endRequest,
  withObservability,
  type LogRecord,
  type RequestMetric,
} from '../src/observability.js';

// ============================================
// CORRELATION IDS
// ============================================

test('correlation id: generateCorrelationId produces a UUID v4', () => {
  const id = generateCorrelationId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('correlation id: generateCorrelationId is unique across calls', () => {
  const a = generateCorrelationId();
  const b = generateCorrelationId();
  assert.notEqual(a, b);
});

test('correlation id: extractOrCreateCorrelationId reuses incoming header', () => {
  const id = extractOrCreateCorrelationId({ 'x-correlation-id': 'caller-id-123' });
  assert.equal(id, 'caller-id-123');
});

test('correlation id: extractOrCreateCorrelationId is case-insensitive on header name', () => {
  const id = extractOrCreateCorrelationId({ 'X-Correlation-Id': 'caller-id-abc' });
  assert.equal(id, 'caller-id-abc');
});

test('correlation id: extractOrCreateCorrelationId generates when absent', () => {
  const id = extractOrCreateCorrelationId({});
  assert.match(id, /^[0-9a-f-]{36}$/i);
});

test('correlation id: extractOrCreateCorrelationId handles array header values', () => {
  const id = extractOrCreateCorrelationId({ 'x-correlation-id': ['first-id', 'second-id'] });
  assert.equal(id, 'first-id');
});

// ============================================
// TRACE CONTEXT (OpenTelemetry-compatible)
// ============================================

test('trace context: generateTraceId produces 32 hex chars', () => {
  const id = generateTraceId();
  assert.match(id, /^[0-9a-f]{32}$/);
});

test('trace context: generateSpanId produces 16 hex chars', () => {
  const id = generateSpanId();
  assert.match(id, /^[0-9a-f]{16}$/);
});

test('trace context: createTraceContext defaults to sampled', () => {
  const ctx = createTraceContext();
  assert.equal(ctx.traceFlags, '01');
  assert.equal(ctx.parentSpanId, undefined);
});

test('trace context: createTraceContext(false) is unsampled', () => {
  const ctx = createTraceContext(false);
  assert.equal(ctx.traceFlags, '00');
});

test('trace context: deriveChildContext keeps traceId, new spanId, sets parentSpanId', () => {
  const root = createTraceContext();
  const child = deriveChildContext(root);
  assert.equal(child.traceId, root.traceId);
  assert.notEqual(child.spanId, root.spanId);
  assert.equal(child.parentSpanId, root.spanId);
});

test('trace context: formatTraceParent round-trips through parseTraceParent', () => {
  const ctx = createTraceContext();
  const header = formatTraceParent(ctx);
  assert.match(header, /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  const parsed = parseTraceParent(header);
  assert.ok(parsed);
  assert.equal(parsed!.traceId, ctx.traceId);
  assert.equal(parsed!.spanId, ctx.spanId);
  assert.equal(parsed!.traceFlags, ctx.traceFlags);
});

test('trace context: parseTraceParent rejects malformed header', () => {
  assert.equal(parseTraceParent('not-a-traceparent'), undefined);
  assert.equal(parseTraceParent('00-tooshort-abc-01'), undefined);
});

test('trace context: extractOrCreateTraceContext reuses valid incoming traceparent', () => {
  const original = createTraceContext();
  const header = formatTraceParent(original);
  const extracted = extractOrCreateTraceContext({ traceparent: header });
  assert.equal(extracted.traceId, original.traceId);
  assert.equal(extracted.spanId, original.spanId);
});

test('trace context: extractOrCreateTraceContext creates a new root when absent', () => {
  const ctx = extractOrCreateTraceContext({});
  assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
  assert.equal(ctx.parentSpanId, undefined);
});

test('trace context: extractOrCreateTraceContext falls back on malformed header', () => {
  const ctx = extractOrCreateTraceContext({ traceparent: 'garbage' });
  assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
});

// ============================================
// SPANS
// ============================================

test('spans: startSpan without parent creates root context and matching span ids', () => {
  const { span, context } = startSpan('api.parse');
  assert.equal(span.traceId, context.traceId);
  assert.equal(span.spanId, context.spanId);
  assert.equal(span.status, 'unset');
  assert.equal(span.name, 'api.parse');
});

test('spans: startSpan with parent derives child context', () => {
  const parentCtx = createTraceContext();
  const { span, context } = startSpan('mcp.tool.call', { parent: parentCtx });
  assert.equal(span.traceId, parentCtx.traceId);
  assert.equal(span.parentSpanId, parentCtx.spanId);
  assert.equal(context.parentSpanId, parentCtx.spanId);
});

test('spans: startSpan carries attributes', () => {
  const { span } = startSpan('op', { attributes: { surface: 'api', retries: 2 } });
  assert.equal(span.attributes.surface, 'api');
  assert.equal(span.attributes.retries, 2);
});

test('spans: addSpanEvent appends an event with attributes', () => {
  const { span } = startSpan('op');
  addSpanEvent(span, 'cache.miss', { key: 'abc' });
  assert.equal(span.events.length, 1);
  assert.equal(span.events[0]!.name, 'cache.miss');
  assert.equal(span.events[0]!.attributes?.key, 'abc');
});

test('spans: endSpan sets endTime, duration, and status', () => {
  const { span } = startSpan('op');
  const ended = endSpan(span, 'ok');
  assert.ok(ended.endTimeMs !== undefined);
  assert.ok(ended.durationMs !== undefined);
  assert.ok(ended.durationMs! >= 0);
  assert.equal(ended.status, 'ok');
});

test('spans: endSpan defaults to ok status', () => {
  const { span } = startSpan('op');
  endSpan(span);
  assert.equal(span.status, 'ok');
});

// ============================================
// STRUCTURED LOGGER (JSON output)
// ============================================

test('logger: emits JSON-structured records with level and message', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r) });
  logger.info('hello world', { foo: 'bar' });
  assert.equal(records.length, 1);
  assert.equal(records[0]!.level, 'info');
  assert.equal(records[0]!.message, 'hello world');
  assert.equal(records[0]!.fields?.foo, 'bar');
  assert.ok(records[0]!.timestamp);
});

test('logger: binds surface/correlationId/traceId/spanId onto every record', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({
    sink: (r) => records.push(r),
    surface: 'api',
    correlationId: 'corr-1',
    traceId: 'trace-1',
    spanId: 'span-1',
  });
  logger.warn('careful');
  assert.equal(records[0]!.surface, 'api');
  assert.equal(records[0]!.correlationId, 'corr-1');
  assert.equal(records[0]!.traceId, 'trace-1');
  assert.equal(records[0]!.spanId, 'span-1');
});

test('logger: child() merges default fields and overrides context', () => {
  const records: LogRecord[] = [];
  const base = new StructuredLogger({ sink: (r) => records.push(r), defaultFields: { service: 'lunum' } });
  const child = base.child({ correlationId: 'corr-2', defaultFields: { requestId: 'req-1' } });
  child.error('boom', { code: 42 });
  assert.equal(records[0]!.correlationId, 'corr-2');
  assert.equal(records[0]!.fields?.service, 'lunum');
  assert.equal(records[0]!.fields?.requestId, 'req-1');
  assert.equal(records[0]!.fields?.code, 42);
});

test('logger: minLevel filters out lower-priority records', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r), minLevel: 'warn' });
  logger.debug('should be dropped');
  logger.info('should be dropped too');
  logger.warn('kept');
  logger.error('kept too');
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.level), ['warn', 'error']);
});

test('logger: record is valid JSON when serialized', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r) });
  logger.info('json-check', { nested: { a: 1 } });
  const serialized = JSON.stringify(records[0]);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.message, 'json-check');
});

// ============================================
// METRICS REGISTRY (latency, status, size)
// ============================================

test('metrics: record and getMetrics round-trip', () => {
  const registry = new MetricsRegistry();
  const metric: RequestMetric = {
    surface: 'api',
    operation: 'parse',
    statusCode: 200,
    latencyMs: 12,
    timestamp: new Date().toISOString(),
  };
  registry.record(metric);
  assert.equal(registry.getMetrics().length, 1);
  assert.equal(registry.getMetrics()[0]!.operation, 'parse');
});

test('metrics: summarizeLatency computes count/min/max/avg/percentiles', () => {
  const registry = new MetricsRegistry();
  for (const latencyMs of [10, 20, 30, 40, 50]) {
    registry.record({ surface: 'api', operation: 'parse', statusCode: 200, latencyMs, timestamp: new Date().toISOString() });
  }
  const summary = registry.summarizeLatency();
  assert.equal(summary.count, 5);
  assert.equal(summary.min, 10);
  assert.equal(summary.max, 50);
  assert.equal(summary.avg, 30);
  assert.equal(summary.p50, 30);
  assert.ok(summary.p95 >= 40);
});

test('metrics: summarizeLatency on empty registry returns zeroed summary', () => {
  const registry = new MetricsRegistry();
  const summary = registry.summarizeLatency();
  assert.equal(summary.count, 0);
  assert.equal(summary.avg, 0);
});

test('metrics: summarizeByStatus groups counts by status code', () => {
  const registry = new MetricsRegistry();
  registry.record({ surface: 'api', operation: 'parse', statusCode: 200, latencyMs: 5, timestamp: new Date().toISOString() });
  registry.record({ surface: 'api', operation: 'parse', statusCode: 200, latencyMs: 5, timestamp: new Date().toISOString() });
  registry.record({ surface: 'api', operation: 'parse', statusCode: 500, latencyMs: 5, timestamp: new Date().toISOString() });
  const byStatus = registry.summarizeByStatus();
  assert.equal(byStatus['200'], 2);
  assert.equal(byStatus['500'], 1);
});

test('metrics: summarizeSize totals request/response bytes', () => {
  const registry = new MetricsRegistry();
  registry.record({
    surface: 'mcp', operation: 'tool.call', statusCode: 200, latencyMs: 5,
    timestamp: new Date().toISOString(), requestSizeBytes: 100, responseSizeBytes: 250,
  });
  registry.record({
    surface: 'mcp', operation: 'tool.call', statusCode: 200, latencyMs: 5,
    timestamp: new Date().toISOString(), requestSizeBytes: 50, responseSizeBytes: 75,
  });
  const sizes = registry.summarizeSize();
  assert.equal(sizes.totalRequestBytes, 150);
  assert.equal(sizes.totalResponseBytes, 325);
});

test('metrics: getMetrics filters by surface/operation/statusCode', () => {
  const registry = new MetricsRegistry();
  registry.record({ surface: 'api', operation: 'parse', statusCode: 200, latencyMs: 5, timestamp: new Date().toISOString() });
  registry.record({ surface: 'mcp', operation: 'parse', statusCode: 200, latencyMs: 5, timestamp: new Date().toISOString() });
  registry.record({ surface: 'api', operation: 'realize', statusCode: 500, latencyMs: 5, timestamp: new Date().toISOString() });
  assert.equal(registry.getMetrics({ surface: 'api' }).length, 2);
  assert.equal(registry.getMetrics({ operation: 'parse' }).length, 2);
  assert.equal(registry.getMetrics({ statusCode: 500 }).length, 1);
  assert.equal(registry.getMetrics({ surface: 'api', operation: 'parse' }).length, 1);
});

test('metrics: reset clears all recorded metrics', () => {
  const registry = new MetricsRegistry();
  registry.record({ surface: 'api', operation: 'parse', statusCode: 200, latencyMs: 5, timestamp: new Date().toISOString() });
  registry.reset();
  assert.equal(registry.getMetrics().length, 0);
});

test('metrics: maxEntries evicts oldest metrics (bounded memory)', () => {
  const registry = new MetricsRegistry({ maxEntries: 3 });
  for (let i = 0; i < 5; i++) {
    registry.record({ surface: 'api', operation: `op-${i}`, statusCode: 200, latencyMs: 1, timestamp: new Date().toISOString() });
  }
  const metrics = registry.getMetrics();
  assert.equal(metrics.length, 3);
  assert.deepEqual(metrics.map((m) => m.operation), ['op-2', 'op-3', 'op-4']);
});

test('metrics: defaultMetricsRegistry is a usable singleton', () => {
  assert.ok(defaultMetricsRegistry instanceof MetricsRegistry);
});

// ============================================
// FULL REQUEST LIFECYCLE (correlation IDs threaded end-to-end)
// ============================================

test('lifecycle: beginRequest generates correlation id and trace context when absent', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r) });
  const ctx = beginRequest({ surface: 'api', operation: 'parse', logger });
  assert.match(ctx.correlationId, /^[0-9a-f-]{36}$/i);
  assert.match(ctx.trace.traceId, /^[0-9a-f]{32}$/);
  assert.equal(records[0]!.message, 'request.start');
  assert.equal(records[0]!.correlationId, ctx.correlationId);
});

test('lifecycle: beginRequest reuses caller correlation id and traceparent', () => {
  const callerTrace = createTraceContext();
  const ctx = beginRequest({
    surface: 'mcp',
    operation: 'tool.call',
    headers: {
      'x-correlation-id': 'caller-corr-id',
      traceparent: formatTraceParent(callerTrace),
    },
  });
  assert.equal(ctx.correlationId, 'caller-corr-id');
  assert.equal(ctx.trace.traceId, callerTrace.traceId);
  assert.equal(ctx.span.parentSpanId, callerTrace.spanId);
});

test('lifecycle: endRequest closes span, logs completion, and records a metric', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r) });
  const registry = new MetricsRegistry();
  const ctx = beginRequest({ surface: 'api', operation: 'parse', method: 'POST', headers: {}, logger, requestSizeBytes: 128 });
  const metric = endRequest(ctx, { statusCode: 200, responseSizeBytes: 512, metrics: registry });

  assert.equal(ctx.span.status, 'ok');
  assert.ok(ctx.span.durationMs !== undefined);
  assert.equal(metric.correlationId, ctx.correlationId);
  assert.equal(metric.traceId, ctx.trace.traceId);
  assert.equal(metric.statusCode, 200);
  assert.equal(metric.requestSizeBytes, 128);
  assert.equal(metric.responseSizeBytes, 512);
  assert.equal(metric.method, 'POST');
  assert.equal(registry.getMetrics().length, 1);

  const endLog = records.find((r) => r.message === 'request.end');
  assert.ok(endLog);
  assert.equal(endLog!.correlationId, ctx.correlationId);
  assert.equal(endLog!.fields?.statusCode, 200);
});

test('lifecycle: endRequest with error status logs at error level and marks metric', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({ sink: (r) => records.push(r) });
  const registry = new MetricsRegistry();
  const ctx = beginRequest({ surface: 'api', operation: 'parse', logger });
  const metric = endRequest(ctx, { statusCode: 500, error: new Error('boom'), metrics: registry });

  assert.equal(ctx.span.status, 'error');
  assert.equal(metric.error, true);
  const endLog = records.find((r) => r.message === 'request.end');
  assert.equal(endLog!.level, 'error');
  assert.equal(endLog!.fields?.errorMessage, 'boom');
});

test('lifecycle: withObservability records success metric and returns handler result', async () => {
  const registry = new MetricsRegistry();
  const result = await withObservability(
    { surface: 'api', operation: 'parse', metrics: registry, onSuccess: () => ({ statusCode: 201, responseSizeBytes: 64 }) },
    async (ctx) => {
      assert.ok(ctx.correlationId);
      return { ok: true };
    }
  );
  assert.deepEqual(result, { ok: true });
  const metrics = registry.getMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0]!.statusCode, 201);
  assert.equal(metrics[0]!.responseSizeBytes, 64);
});

test('lifecycle: withObservability records error metric and rethrows', async () => {
  const registry = new MetricsRegistry();
  await assert.rejects(
    withObservability(
      { surface: 'mcp', operation: 'tool.call', metrics: registry, onError: () => ({ statusCode: 422 }) },
      async () => {
        throw new Error('tool failed');
      }
    ),
    /tool failed/
  );
  const metrics = registry.getMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0]!.statusCode, 422);
  assert.equal(metrics[0]!.error, true);
});

test('lifecycle: correlation id is identical across begin, handler, and end', async () => {
  let seenInHandler = '';
  const registry = new MetricsRegistry();
  await withObservability({ surface: 'api', operation: 'realize', metrics: registry }, async (ctx) => {
    seenInHandler = ctx.correlationId;
    return 'done';
  });
  const metric = registry.getMetrics()[0]!;
  assert.equal(metric.correlationId, seenInHandler);
});

test('lifecycle: two concurrent requests get distinct correlation and trace ids', async () => {
  const registry = new MetricsRegistry();
  await Promise.all([
    withObservability({ surface: 'api', operation: 'parse', metrics: registry }, async () => 'a'),
    withObservability({ surface: 'api', operation: 'parse', metrics: registry }, async () => 'b'),
  ]);
  const [m1, m2] = registry.getMetrics();
  assert.notEqual(m1!.correlationId, m2!.correlationId);
  assert.notEqual(m1!.traceId, m2!.traceId);
});
