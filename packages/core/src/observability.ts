/**
 * Structured Observability for Lunum (R12.4 readiness).
 *
 * Provides observability primitives shared by the API and MCP surfaces:
 * - JSON-structured log output (StructuredLogger)
 * - Request/response metrics: latency, status, size (MetricsRegistry)
 * - OpenTelemetry-compatible trace context (traceparent) and spans
 * - Correlation IDs that thread through the full request lifecycle
 *
 * No external dependencies: trace/correlation IDs use `node:crypto`
 * (built into Node.js), and log/metric sinks are plain injectable functions.
 */

import { randomUUID, randomBytes } from 'node:crypto';

// ── Correlation IDs ─────────────────────────────────────────────────

const CORRELATION_ID_HEADER = 'x-correlation-id' as const;

/** Generate a new correlation ID (UUID v4). */
export function generateCorrelationId(): string {
  return randomUUID();
}

export type HeaderBag = Record<string, string | string[] | undefined>;

function firstHeaderValue(headers: HeaderBag, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (key === undefined) return undefined;
  const value = headers[key];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? value[0]! : undefined;
  return value;
}

/**
 * Extract a correlation ID from an incoming header bag, generating a new
 * one if absent. This is how correlation IDs thread across service
 * boundaries: the caller's ID is reused when present.
 */
export function extractOrCreateCorrelationId(
  headers: HeaderBag,
  headerName: string = CORRELATION_ID_HEADER
): string {
  const found = firstHeaderValue(headers, headerName);
  return found !== undefined && found.length > 0 ? found : generateCorrelationId();
}

// ── OpenTelemetry-compatible trace context ──────────────────────────

const TRACEPARENT_HEADER = 'traceparent' as const;
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export interface TraceContext {
  /** 32 hex chars: W3C trace-id */
  traceId: string;
  /** 16 hex chars: W3C span-id (current span) */
  spanId: string;
  /** 16 hex chars: span-id of the parent span, if any */
  parentSpanId?: string;
  /** 2 hex chars: W3C trace-flags (e.g. '01' = sampled) */
  traceFlags: string;
}

/** Generate a fresh, W3C-compliant 32-hex-char trace ID. */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Generate a fresh, W3C-compliant 16-hex-char span ID. */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/** Create a brand-new root trace context (no parent). */
export function createTraceContext(sampled: boolean = true): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    traceFlags: sampled ? '01' : '00',
  };
}

/** Derive a child trace context (new span, same trace) from a parent. */
export function deriveChildContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    traceFlags: parent.traceFlags,
  };
}

/** Format a trace context as a W3C `traceparent` header value. */
export function formatTraceParent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags}`;
}

/** Parse a W3C `traceparent` header value into a trace context. */
export function parseTraceParent(value: string): TraceContext | undefined {
  const match = TRACEPARENT_RE.exec(value.trim());
  if (!match) return undefined;
  const traceId = match[2]!;
  const spanId = match[3]!;
  const traceFlags = match[4]!;
  return { traceId, spanId, traceFlags };
}

/**
 * Extract trace context from an incoming header bag (W3C `traceparent`),
 * or create a fresh root context if absent/unparseable. The returned
 * context represents the *incoming* span; callers typically derive a
 * child context for their own span via {@link deriveChildContext}.
 */
export function extractOrCreateTraceContext(headers: HeaderBag): TraceContext {
  const raw = firstHeaderValue(headers, TRACEPARENT_HEADER);
  if (raw !== undefined) {
    const parsed = parseTraceParent(raw);
    if (parsed) return parsed;
  }
  return createTraceContext();
}

// ── Spans ────────────────────────────────────────────────────────────

export type SpanStatus = 'unset' | 'ok' | 'error';
export type AttributeValue = string | number | boolean;

export interface SpanEvent {
  name: string;
  timeMs: number;
  attributes?: Record<string, AttributeValue>;
}

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  attributes: Record<string, AttributeValue>;
  events: SpanEvent[];
  status: SpanStatus;
}

/** Start a new span, deriving a child trace context from `parent` if given. */
export function startSpan(
  name: string,
  options: { parent?: TraceContext; attributes?: Record<string, AttributeValue> } = {}
): { span: Span; context: TraceContext } {
  const context = options.parent ? deriveChildContext(options.parent) : createTraceContext();
  const span: Span = {
    name,
    traceId: context.traceId,
    spanId: context.spanId,
    ...(context.parentSpanId !== undefined ? { parentSpanId: context.parentSpanId } : {}),
    startTimeMs: Date.now(),
    attributes: { ...(options.attributes ?? {}) },
    events: [],
    status: 'unset',
  };
  return { span, context };
}

/** Record a point-in-time event on a span (does not close it). */
export function addSpanEvent(span: Span, name: string, attributes?: Record<string, AttributeValue>): void {
  span.events.push({
    name,
    timeMs: Date.now(),
    ...(attributes !== undefined ? { attributes } : {}),
  });
}

/** Close a span, setting its end time, duration, and final status. */
export function endSpan(span: Span, status: SpanStatus = 'ok'): Span {
  const endTimeMs = Date.now();
  span.endTimeMs = endTimeMs;
  span.durationMs = endTimeMs - span.startTimeMs;
  span.status = status;
  return span;
}

// ── Structured (JSON) logging ───────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  surface?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  fields?: Record<string, unknown>;
}

export type LogSink = (record: LogRecord) => void;

/** Default sink: emit one JSON object per line (structured log output). */
export function jsonStdoutSink(record: LogRecord): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export interface StructuredLoggerOptions {
  surface?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  defaultFields?: Record<string, unknown>;
  sink?: LogSink;
  minLevel?: LogLevel;
}

/** A JSON-structured logger that threads correlation/trace IDs into every record. */
export class StructuredLogger {
  private readonly surface: string | undefined;
  private readonly correlationId: string | undefined;
  private readonly traceId: string | undefined;
  private readonly spanId: string | undefined;
  private readonly defaultFields: Record<string, unknown>;
  private readonly sink: LogSink;
  private readonly minLevel: LogLevel;

  constructor(options: StructuredLoggerOptions = {}) {
    this.surface = options.surface;
    this.correlationId = options.correlationId;
    this.traceId = options.traceId;
    this.spanId = options.spanId;
    this.defaultFields = options.defaultFields ?? {};
    this.sink = options.sink ?? jsonStdoutSink;
    this.minLevel = options.minLevel ?? 'debug';
  }

  /** Create a derived logger that merges in extra bound fields/context. */
  child(options: Partial<StructuredLoggerOptions> = {}): StructuredLogger {
    const merged: StructuredLoggerOptions = {
      defaultFields: { ...this.defaultFields, ...(options.defaultFields ?? {}) },
    };
    const surface = options.surface ?? this.surface;
    if (surface !== undefined) merged.surface = surface;
    const cid = options.correlationId ?? this.correlationId;
    if (cid !== undefined) merged.correlationId = cid;
    const tid = options.traceId ?? this.traceId;
    if (tid !== undefined) merged.traceId = tid;
    const sid = options.spanId ?? this.spanId;
    if (sid !== undefined) merged.spanId = sid;
    if (options.sink ?? this.sink) merged.sink = options.sink ?? this.sink;
    if (options.minLevel ?? this.minLevel) merged.minLevel = options.minLevel ?? this.minLevel;
    return new StructuredLogger(merged);
  }

  private log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) return;
    const merged = { ...this.defaultFields, ...(fields ?? {}) };
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.surface !== undefined ? { surface: this.surface } : {}),
      ...(this.correlationId !== undefined ? { correlationId: this.correlationId } : {}),
      ...(this.traceId !== undefined ? { traceId: this.traceId } : {}),
      ...(this.spanId !== undefined ? { spanId: this.spanId } : {}),
      ...(Object.keys(merged).length > 0 ? { fields: merged } : {}),
    };
    this.sink(record);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log('debug', message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log('error', message, fields);
  }
}

// ── Request/response metrics ────────────────────────────────────────

export interface RequestMetric {
  surface: string;
  operation: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  method?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  correlationId?: string;
  traceId?: string;
  error?: boolean;
}

export interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

const EMPTY_SUMMARY: MetricSummary = Object.freeze({
  count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0,
});

function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const rank = (p / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  if (lowerIndex === upperIndex) return lower;
  const frac = rank - lowerIndex;
  return lower + (upper - lower) * frac;
}

export interface MetricFilter {
  surface?: string;
  operation?: string;
  statusCode?: number;
}

function matchesFilter(metric: RequestMetric, filter?: MetricFilter): boolean {
  if (!filter) return true;
  if (filter.surface !== undefined && metric.surface !== filter.surface) return false;
  if (filter.operation !== undefined && metric.operation !== filter.operation) return false;
  if (filter.statusCode !== undefined && metric.statusCode !== filter.statusCode) return false;
  return true;
}

/** In-memory registry collecting request/response metrics (latency, status, size). */
export class MetricsRegistry {
  private readonly metrics: RequestMetric[] = [];
  private readonly maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  record(metric: RequestMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxEntries) {
      this.metrics.splice(0, this.metrics.length - this.maxEntries);
    }
  }

  getMetrics(filter?: MetricFilter): RequestMetric[] {
    return this.metrics.filter((m) => matchesFilter(m, filter));
  }

  /** Summary statistics (count/sum/min/max/avg/p50/p95/p99) over request latency. */
  summarizeLatency(filter?: MetricFilter): MetricSummary {
    const values = this.getMetrics(filter)
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);
    if (values.length === 0) return EMPTY_SUMMARY;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return {
      count: values.length,
      sum,
      min: values[0]!,
      max: values[values.length - 1]!,
      avg: sum / values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
    };
  }

  /** Count of requests grouped by HTTP/tool status code. */
  summarizeByStatus(filter?: MetricFilter): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of this.getMetrics(filter)) {
      const key = String(m.statusCode);
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }

  /** Total request/response byte counts observed (for throughput accounting). */
  summarizeSize(filter?: MetricFilter): { totalRequestBytes: number; totalResponseBytes: number } {
    let totalRequestBytes = 0;
    let totalResponseBytes = 0;
    for (const m of this.getMetrics(filter)) {
      totalRequestBytes += m.requestSizeBytes ?? 0;
      totalResponseBytes += m.responseSizeBytes ?? 0;
    }
    return { totalRequestBytes, totalResponseBytes };
  }

  reset(): void {
    this.metrics.length = 0;
  }
}

/** Shared default registry, mirroring the `defaultRegistry` pattern used elsewhere in core. */
export const defaultMetricsRegistry = new MetricsRegistry();

// ── Full request-lifecycle correlation ──────────────────────────────

export interface RequestContext {
  correlationId: string;
  trace: TraceContext;
  span: Span;
  logger: StructuredLogger;
  startedAtMs: number;
}

export interface BeginRequestOptions {
  surface: string;
  operation: string;
  method?: string;
  headers?: HeaderBag;
  requestSizeBytes?: number;
  logger?: StructuredLogger;
  correlationIdHeader?: string;
}

/**
 * Begin observing one request: resolve/generate the correlation ID and
 * trace context (reusing incoming headers when present), open a span,
 * and bind a child structured logger to all of it. This is the anchor
 * that threads a single correlation ID through the rest of the request
 * lifecycle (handler code, downstream calls, response logging).
 */
export function beginRequest(options: BeginRequestOptions): RequestContext {
  const headers = options.headers ?? {};
  const correlationId = extractOrCreateCorrelationId(headers, options.correlationIdHeader);
  const incomingTrace = extractOrCreateTraceContext(headers);
  const { span, context } = startSpan(`${options.surface}.${options.operation}`, {
    parent: incomingTrace,
    attributes: {
      surface: options.surface,
      operation: options.operation,
      correlationId,
      ...(options.method !== undefined ? { method: options.method } : {}),
      ...(options.requestSizeBytes !== undefined ? { requestSizeBytes: options.requestSizeBytes } : {}),
    },
  });

  const baseLogger = options.logger ?? new StructuredLogger();
  const logger = baseLogger.child({
    surface: options.surface,
    correlationId,
    traceId: context.traceId,
    spanId: context.spanId,
  });

  logger.info('request.start', {
    operation: options.operation,
    ...(options.method !== undefined ? { method: options.method } : {}),
    ...(options.requestSizeBytes !== undefined ? { requestSizeBytes: options.requestSizeBytes } : {}),
  });

  return {
    correlationId,
    trace: context,
    span,
    logger,
    startedAtMs: span.startTimeMs,
  };
}

export interface EndRequestOptions {
  statusCode: number;
  responseSizeBytes?: number;
  error?: unknown;
  metrics?: MetricsRegistry;
}

/**
 * Close out a request begun with {@link beginRequest}: end the span,
 * emit a structured completion log, and record a request/response
 * metric (latency, status, size) into the given (or default) registry.
 */
export function endRequest(
  ctx: RequestContext,
  options: EndRequestOptions
): RequestMetric {
  const isError = options.error !== undefined || options.statusCode >= 400;
  endSpan(ctx.span, isError ? 'error' : 'ok');
  const latencyMs = ctx.span.durationMs ?? Date.now() - ctx.startedAtMs;
  const surface = String(ctx.span.attributes.surface ?? 'unknown');
  const operation = String(ctx.span.attributes.operation ?? ctx.span.name);

  const errorFields =
    options.error !== undefined
      ? { errorMessage: options.error instanceof Error ? options.error.message : String(options.error) }
      : {};

  ctx.logger[isError ? 'error' : 'info']('request.end', {
    statusCode: options.statusCode,
    latencyMs,
    ...(options.responseSizeBytes !== undefined ? { responseSizeBytes: options.responseSizeBytes } : {}),
    ...errorFields,
  });

  const metric: RequestMetric = {
    surface,
    operation,
    statusCode: options.statusCode,
    latencyMs,
    timestamp: new Date().toISOString(),
    correlationId: ctx.correlationId,
    traceId: ctx.trace.traceId,
    error: isError,
    ...(ctx.span.attributes.method !== undefined ? { method: String(ctx.span.attributes.method) } : {}),
    ...(ctx.span.attributes.requestSizeBytes !== undefined
      ? { requestSizeBytes: Number(ctx.span.attributes.requestSizeBytes) }
      : {}),
    ...(options.responseSizeBytes !== undefined ? { responseSizeBytes: options.responseSizeBytes } : {}),
  };

  (options.metrics ?? defaultMetricsRegistry).record(metric);
  return metric;
}

export interface WithObservabilityOptions {
  surface: string;
  operation: string;
  method?: string;
  headers?: HeaderBag;
  requestSizeBytes?: number;
  logger?: StructuredLogger;
  metrics?: MetricsRegistry;
  /** Derive a status code and response size from the handler's successful result. */
  onSuccess?: (result: unknown) => { statusCode: number; responseSizeBytes?: number };
  /** Derive a status code from a thrown error (default: 500). */
  onError?: (error: unknown) => { statusCode: number };
}

/**
 * Wrap an async request handler (API route or MCP tool call) with full
 * observability: begins the request (correlation ID + trace context +
 * structured logging), runs the handler, and ends the request with a
 * recorded metric — whether the handler succeeds or throws.
 */
export async function withObservability<T>(
  options: WithObservabilityOptions,
  handler: (ctx: RequestContext) => Promise<T>
): Promise<T> {
  const ctx = beginRequest(options);
  try {
    const result = await handler(ctx);
    const derived = options.onSuccess?.(result) ?? { statusCode: 200 };
    endRequest(ctx, {
      statusCode: derived.statusCode,
      ...(options.metrics !== undefined ? { metrics: options.metrics } : {}),
      ...(derived.responseSizeBytes !== undefined ? { responseSizeBytes: derived.responseSizeBytes } : {}),
    });
    return result;
  } catch (error) {
    const derived = options.onError?.(error) ?? { statusCode: 500 };
    endRequest(ctx, { statusCode: derived.statusCode, error, ...(options.metrics !== undefined ? { metrics: options.metrics } : {}) });
    throw error;
  }
}
