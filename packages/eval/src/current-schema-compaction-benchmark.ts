import { createHash } from 'node:crypto';
import {
  canonicalizeSem,
  classifyEligibility,
  compileContext,
  createRecord,
  decodeProfileSem,
  ProfileGenerator,
  stableStringify,
  validateSem,
  type ContextMessage,
  type LunumSem,
  type Risk,
} from '@corpunum/lunum';
import {
  CURRENT_SCHEMA_COMPACTION_FIXTURES,
  type CurrentSchemaCompactionFixture,
} from './current-schema-compaction-fixtures.js';

/**
 * This is a renderer/context integrity benchmark, not a downstream model
 * benchmark. It never receives an expected answer and never claims task
 * accuracy, latency, or empirical token savings.
 */
export const CURRENT_SCHEMA_COMPACTION_BENCHMARK_VERSION = '0.1.0';

export type CurrentSchemaCompactionMode =
  | 'natural'
  | 'lunum-safe'
  | 'lunum-short'
  | 'lunum-tight'
  | 'mixed';

export interface CurrentSchemaTokenizer {
  /** Explicit model/tokenizer identity. The caller is responsible for binding it to a real tokenizer. */
  identity: string;
  count: (text: string) => number;
}

export interface CurrentSchemaCompactionRunOptions {
  codeCommit?: string;
  startedAt?: string;
  tokenizer?: CurrentSchemaTokenizer;
}

export interface CurrentSchemaCompactionMeasurement {
  fixtureId: string;
  mode: CurrentSchemaCompactionMode;
  content: string;
  bytes: number;
  /** Null means no verified tokenizer was supplied; bytes are not tokens. */
  tokens: number | null;
  tokenCounting: 'not_measured_no_verified_tokenizer' | 'caller_supplied_tokenizer';
  semanticRoundTrip: 'not_applicable' | 'pass' | 'fail';
  policySelected: boolean | null;
  taskAccuracy: null;
  latencyMs: null;
}

export interface CurrentSchemaModeSummary {
  fixtures: number;
  averageBytes: number;
  bytesRatioVsNatural: number;
  semanticRoundTrips: { assessed: number; passed: number; failed: number };
  averageTokens: number | null;
  tokensRatioVsNatural: number | null;
  tokensPerSuccessfulTask: null;
  taskAccuracy: null;
  latencyMs: null;
}

export interface CurrentSchemaCompactionReport {
  schema: 'openlunum-current-schema-compaction/0.1';
  benchmarkVersion: string;
  provenance: {
    codeCommit: string;
    fixtureHash: string;
    schemaVersions: string[];
    startedAt: string;
    renderer: 'ProfileGenerator';
    contextCompiler: 'compileContext';
    tokenizer: string | null;
    liveModel: 'NOT_RUN';
  };
  fixtures: Array<{
    id: string;
    schemaValid: boolean;
    schemaErrors: string[];
    policy: { eligible: boolean; category: string; risk: Risk; confidence: number; reasons: string[] };
  }>;
  measurements: CurrentSchemaCompactionMeasurement[];
  byMode: Record<CurrentSchemaCompactionMode, CurrentSchemaModeSummary>;
  limitations: readonly [
    'No expected answers or expected summaries are supplied to this benchmark.',
    'Task accuracy, downstream preservation, latency, and tokens per successful task are NOT_RUN.',
    'Byte counts are deterministic representation sizes, not token measurements.',
  ];
}

function fixtureHash(fixtures: readonly CurrentSchemaCompactionFixture[]): string {
  return createHash('sha256').update(stableStringify(fixtures)).digest('hex');
}

function equalCanonical(left: LunumSem, right: LunumSem): boolean {
  return stableStringify(canonicalizeSem(left)) === stableStringify(canonicalizeSem(right));
}

function measurement(
  fixtureId: string,
  mode: CurrentSchemaCompactionMode,
  content: string,
  tokenizer: CurrentSchemaTokenizer | undefined,
  semanticRoundTrip: CurrentSchemaCompactionMeasurement['semanticRoundTrip'],
  policySelected: boolean | null,
): CurrentSchemaCompactionMeasurement {
  const tokens = tokenizer?.count(content) ?? null;
  if (tokens !== null && (!Number.isSafeInteger(tokens) || tokens < 0)) {
    throw new TypeError(`Tokenizer returned an invalid count for ${fixtureId}/${mode}`);
  }
  return {
    fixtureId,
    mode,
    content,
    bytes: Buffer.byteLength(content, 'utf8'),
    tokens,
    tokenCounting: tokenizer ? 'caller_supplied_tokenizer' : 'not_measured_no_verified_tokenizer',
    semanticRoundTrip,
    policySelected,
    taskAccuracy: null,
    latencyMs: null,
  };
}

function summarize(
  mode: CurrentSchemaCompactionMode,
  measurements: readonly CurrentSchemaCompactionMeasurement[],
): CurrentSchemaModeSummary {
  const rows = measurements.filter((row) => row.mode === mode);
  const naturalRows = measurements.filter((row) => row.mode === 'natural');
  const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const averageBytes = average(rows.map((row) => row.bytes));
  const naturalAverageBytes = average(naturalRows.map((row) => row.bytes));
  const measuredTokens = rows.map((row) => row.tokens);
  const naturalTokens = naturalRows.map((row) => row.tokens);
  const allTokensMeasured = measuredTokens.every((value) => value !== null) && naturalTokens.every((value) => value !== null);
  const semantic = rows.filter((row) => row.semanticRoundTrip !== 'not_applicable');
  const passed = semantic.filter((row) => row.semanticRoundTrip === 'pass').length;
  return {
    fixtures: rows.length,
    averageBytes,
    bytesRatioVsNatural: averageBytes / naturalAverageBytes,
    semanticRoundTrips: { assessed: semantic.length, passed, failed: semantic.length - passed },
    averageTokens: allTokensMeasured ? average(measuredTokens as number[]) : null,
    tokensRatioVsNatural: allTokensMeasured
      ? average(measuredTokens as number[]) / average(naturalTokens as number[])
      : null,
    tokensPerSuccessfulTask: null,
    taskAccuracy: null,
    latencyMs: null,
  };
}

/**
 * Runs current schema validation, actual ProfileGenerator encoders/decoders,
 * and compileContext policy selection. It intentionally does not invoke a
 * model or infer answers from contexts.
 */
export function runCurrentSchemaCompactionBenchmark(
  fixtures: readonly CurrentSchemaCompactionFixture[] = CURRENT_SCHEMA_COMPACTION_FIXTURES,
  options: CurrentSchemaCompactionRunOptions = {},
): CurrentSchemaCompactionReport {
  if (fixtures.length === 0) throw new TypeError('At least one fixture is required');
  const generator = new ProfileGenerator();
  const measurements: CurrentSchemaCompactionMeasurement[] = [];
  const fixtureResults: CurrentSchemaCompactionReport['fixtures'] = [];

  for (const fixture of fixtures) {
    const validation = validateSem(fixture.sem);
    const policy = classifyEligibility({
      category: fixture.category,
      risk: fixture.risk,
      confidence: fixture.confidence,
      sourceText: fixture.sourceText,
      semantic: validation.ok,
    });
    fixtureResults.push({
      id: fixture.id,
      schemaValid: validation.ok,
      schemaErrors: validation.errors,
      policy,
    });
    if (!validation.ok) continue;

    const record = createRecord({
      sourceText: fixture.sourceText,
      sem: fixture.sem,
      category: fixture.category,
      risk: fixture.risk,
      confidence: fixture.confidence,
    });
    const profiles = {
      safe: generator.profile(record, 'safe').record.renderings.safe!.code,
      short: generator.profile(record, 'short').record.renderings.short!.code,
      tight: generator.profile(record, 'tight').record.renderings.tight!.code,
    };
    const roundTrip = {
      safe: equalCanonical(record.sem, decodeProfileSem(profiles.safe, 'safe')) ? 'pass' as const : 'fail' as const,
      short: equalCanonical(record.sem, decodeProfileSem(profiles.short, 'short')) ? 'pass' as const : 'fail' as const,
      tight: equalCanonical(record.sem, decodeProfileSem(profiles.tight, 'tight')) ? 'pass' as const : 'fail' as const,
    };
    const message: ContextMessage = {
      role: 'user',
      content: fixture.sourceText,
      lunumCode: profiles.short,
      lunumMeta: policy,
    };
    const mixed = compileContext([message], { mode: 'mixed' }).selectedMessages[0]?.content ?? '';

    measurements.push(
      measurement(fixture.id, 'natural', fixture.sourceText, options.tokenizer, 'not_applicable', null),
      measurement(fixture.id, 'lunum-safe', profiles.safe, options.tokenizer, roundTrip.safe, null),
      measurement(fixture.id, 'lunum-short', profiles.short, options.tokenizer, roundTrip.short, null),
      measurement(fixture.id, 'lunum-tight', profiles.tight, options.tokenizer, roundTrip.tight, null),
      measurement(fixture.id, 'mixed', mixed, options.tokenizer, policy.eligible ? roundTrip.short : 'not_applicable', policy.eligible),
    );
  }

  if (fixtureResults.some((fixture) => !fixture.schemaValid)) {
    throw new TypeError('Current-schema compaction fixtures must all pass live validateSem');
  }

  const modes: CurrentSchemaCompactionMode[] = ['natural', 'lunum-safe', 'lunum-short', 'lunum-tight', 'mixed'];
  return {
    schema: 'openlunum-current-schema-compaction/0.1',
    benchmarkVersion: CURRENT_SCHEMA_COMPACTION_BENCHMARK_VERSION,
    provenance: {
      codeCommit: options.codeCommit ?? 'NOT_RECORDED',
      fixtureHash: fixtureHash(fixtures),
      schemaVersions: [...new Set(fixtures.map((fixture) => fixture.sem.schema))],
      startedAt: options.startedAt ?? new Date().toISOString(),
      renderer: 'ProfileGenerator',
      contextCompiler: 'compileContext',
      tokenizer: options.tokenizer?.identity ?? null,
      liveModel: 'NOT_RUN',
    },
    fixtures: fixtureResults,
    measurements,
    byMode: Object.fromEntries(modes.map((mode) => [mode, summarize(mode, measurements)])) as CurrentSchemaCompactionReport['byMode'],
    limitations: [
      'No expected answers or expected summaries are supplied to this benchmark.',
      'Task accuracy, downstream preservation, latency, and tokens per successful task are NOT_RUN.',
      'Byte counts are deterministic representation sizes, not token measurements.',
    ],
  };
}
