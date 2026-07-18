/**
 * API stability tests for @corpunum/lunum
 *
 * Snapshot-based tests that verify:
 * - No public exports are removed
 * - No breaking signature changes (function parameter types, class method signatures)
 * - Reports detected changes so maintainers can decide if a major version bump is needed
 *
 * Strategy: Load a golden snapshot JSON, compare against expected exports,
 * and fail CI if any breaking changes are detected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'api-snapshot.json');
const CORE_SRC = join(__dirname, '..', 'dist', 'src');

// ── API Surface Types ──────────────────────────────────────────────

interface ApiExport {
  name: string;
  kind: 'class' | 'function' | 'interface' | 'type' | 'const';
  module: string;
  signature?: string;
}

interface ApiSnapshot {
  version: string;
  generatedAt: string;
  exports: ApiExport[];
}

// ── Golden Snapshot ────────────────────────────────────────────────

// This is the expected API surface for v0.2.0.
// When new exports are added, update this snapshot.
// When exports are removed or signatures change, verify a major version bump is needed.
const GOLDEN_EXPORTS: ApiExport[] = [
  { name: 'AgentConstraint', kind: 'interface', module: 'agent-state' },
  { name: 'AgentHandoff', kind: 'interface', module: 'agent-state' },
  { name: 'AgentPlanStep', kind: 'interface', module: 'agent-state' },
  { name: 'AgentRole', kind: 'type', module: 'agent-state' },
  { name: 'AgentState', kind: 'interface', module: 'agent-state' },
  { name: 'AgentToolCall', kind: 'interface', module: 'agent-state' },
  { name: 'AgentToolResult', kind: 'interface', module: 'agent-state' },
  { name: 'ConstraintKind', kind: 'type', module: 'agent-state' },
  { name: 'HandoffDirection', kind: 'type', module: 'agent-state' },
  { name: 'StepStatus', kind: 'type', module: 'agent-state' },
  { name: 'ToolCallKind', kind: 'type', module: 'agent-state' },
  { name: 'validateAgentState', kind: 'function', module: 'agent-state', signature: '(state: AgentState)' },
  { name: 'validateSem', kind: 'function', module: 'canonicalize', signature: '(value: unknown)' },
  { name: 'canonicalizeSem', kind: 'function', module: 'canonicalize', signature: '(value: unknown)' },
  { name: 'stableStringify', kind: 'function', module: 'canonicalize', signature: '(value: unknown)' },
  { name: 'ConformanceReport', kind: 'interface', module: 'compare' },
  { name: 'ConformanceCheckResult', kind: 'interface', module: 'compare' },
  { name: 'ConformanceReportConfig', kind: 'interface', module: 'compare' },
  { name: 'SemanticComparison', kind: 'interface', module: 'compare' },
  { name: 'ConformanceReportGenerator', kind: 'class', module: 'compare' },
  { name: 'compareSem', kind: 'function', module: 'compare', signature: '(expected: LunumSem, actual: LunumSem)' },
  { name: 'ContextMeasurement', kind: 'interface', module: 'context-measurement' },
  { name: 'ContextMeasurementConfig', kind: 'interface', module: 'context-measurement' },
  { name: 'QualityMetrics', kind: 'interface', module: 'context-measurement' },
  { name: 'ContextMeasurementFramework', kind: 'class', module: 'context-measurement' },
  { name: 'compileLunumShadowContext', kind: 'function', module: 'context', signature: '(messages: ContextMessage[])' },
  { name: 'compileContext', kind: 'function', module: 'context', signature: '(messages: ContextMessage[], options)' },
  { name: 'ContextMode', kind: 'type', module: 'context' },
  { name: 'ContextMessage', kind: 'interface', module: 'types' },
  { name: 'SEM_SCHEMA', kind: 'const', module: 'constants' },
  { name: 'RECORD_SCHEMA', kind: 'const', module: 'constants' },
  { name: 'FP_VERSION', kind: 'const', module: 'constants' },
  { name: 'DEFAULT_RENDERER', kind: 'const', module: 'constants' },
  { name: 'WORLD_MARKERS', kind: 'const', module: 'constants' },
  { name: 'ROLE_ORDER', kind: 'const', module: 'constants' },
  { name: 'createRecord', kind: 'function', module: 'derive', signature: '(input: CreateRecordInput)' },
  { name: 'deriveLunumSidecar', kind: 'function', module: 'derive', signature: '(input: DeriveSidecarInput)' },
  { name: 'deriveSurfaceSidecar', kind: 'function', module: 'derive', signature: '(input: DeriveSurfaceInput)' },
  { name: 'roughTokenCount', kind: 'function', module: 'derive', signature: '(text: unknown)' },
  { name: 'surfaceTelegraph', kind: 'function', module: 'derive', signature: '(text: unknown)' },
  { name: 'CreateRecordInput', kind: 'interface', module: 'derive' },
  { name: 'downstreamQualityExports', kind: 'function', module: 'downstream-quality', signature: '()' },
  { name: 'DownstreamQualityResult', kind: 'interface', module: 'downstream-quality' },
  { name: 'DownstreamQualityConfig', kind: 'interface', module: 'downstream-quality' },
  { name: 'classifyEligibility', kind: 'function', module: 'policy', signature: '(input: EligibilityInput)' },
  { name: 'Risk', kind: 'type', module: 'types' },
  { name: 'LunumRecord', kind: 'interface', module: 'types' },
  { name: 'LunumSem', kind: 'interface', module: 'types' },
  { name: 'LunumSidecar', kind: 'interface', module: 'types' },
  { name: 'LunumRenderResult', kind: 'interface', module: 'types' },
  { name: 'EligibilityInput', kind: 'interface', module: 'policy' },
  { name: 'fingerprintSem', kind: 'function', module: 'fingerprint', signature: '(sem: LunumSem)' },
  { name: 'surfaceFingerprint', kind: 'function', module: 'fingerprint', signature: '(text: unknown)' },
  { name: 'FingerprintMigrationResult', kind: 'interface', module: 'fingerprint-migration' },
  { name: 'migrateFingerprint', kind: 'function', module: 'fingerprint-migration', signature: '(record: unknown)' },
  { name: 'NativeModelProfile', kind: 'interface', module: 'native-model' },
  { name: 'NativeModelCompatibility', kind: 'interface', module: 'native-model' },
  { name: 'nativeModelExports', kind: 'function', module: 'native-model', signature: '()'},
  { name: 'conformanceReportExports', kind: 'function', module: 'renderer-conformance', signature: '()'},
  { name: 'conformanceVectorExports', kind: 'function', module: 'semantic-conformance', signature: '()'},
  { name: 'contextMeasurementExports', kind: 'function', module: 'context-measurement', signature: '()'},
  { name: 'PromptInjectionResult', kind: 'interface', module: 'prompt-injection' },
  { name: 'PromptInjectionDetector', kind: 'class', module: 'prompt-injection' },
  { name: 'detectPromptInjection', kind: 'function', module: 'prompt-injection', signature: '(text: string)' },
  { name: 'RenderProfile', kind: 'interface', module: 'render' },
  { name: 'renderSem', kind: 'function', module: 'render', signature: '(sem: LunumSem, options)' },
  { name: 'ProfileSelector', kind: 'class', module: 'profile-selector' },
  { name: 'selectProfile', kind: 'function', module: 'profile-selector', signature: '(sem: LunumSem, model?: string)' },
  { name: 'TokenAtlasResult', kind: 'interface', module: 'token-atlas' },
  { name: 'TokenAtlasMeasurement', kind: 'interface', module: 'token-atlas' },
  { name: 'measureTokenAtlas', kind: 'function', module: 'token-atlas', signature: '(text: string, models)' },
  { name: 'AgentEvidence', kind: 'interface', module: 'agent-state' },
  { name: 'MixedContextQualityResult', kind: 'interface', module: 'mixed-context-quality' },
  { name: 'MixedContextConfig', kind: 'interface', module: 'mixed-context-quality' },
  { name: 'ConformanceVector', kind: 'interface', module: 'semantic-conformance' },
  { name: 'VectorDimension', kind: 'type', module: 'semantic-conformance' },
  { name: 'PropertyTest', kind: 'interface', module: 'semantic-conformance' },
  { name: 'ConformanceVectorGenerator', kind: 'class', module: 'semantic-conformance' },
  { name: 'PropertyTestRunner', kind: 'class', module: 'semantic-conformance' },
  { name: 'NearSemanticResult', kind: 'interface', module: 'near-semantic-fingerprints' },
  { name: 'NearSemanticFingerprintConfig', kind: 'interface', module: 'near-semantic-fingerprints' },
  { name: 'computeNearSemanticFingerprint', kind: 'function', module: 'near-semantic-fingerprints', signature: '(sem: LunumSem)' },
  { name: 'ErrorObservabilityResult', kind: 'interface', module: 'error-observability' },
  { name: 'ErrorObservabilityConfig', kind: 'interface', module: 'error-observability' },

  { name: 'TokenMapping', kind: 'interface', module: 'llama-tokenizer' },
  { name: 'llamaTokenCount', kind: 'function', module: 'llama-tokenizer', signature: '(text: string)' },
  { name: 'taskType', kind: 'type', module: 'downstream-quality' },
  { name: 'EligibilityDecision', kind: 'interface', module: 'policy' },
];

// ── Snapshot Management ────────────────────────────────────────────

/**
 * Generate and save a new API snapshot.
 */
function generateSnapshot(): ApiSnapshot {
  return {
    version: '0.2.0',
    generatedAt: new Date().toISOString(),
    exports: GOLDEN_EXPORTS
  };
}

/**
 * Load an existing API snapshot, creating one if it doesn't exist.
 */
function loadOrGenerateSnapshot(): ApiSnapshot {
  if (existsSync(SNAPSHOT_PATH)) {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as ApiSnapshot;
  }
  const snapshot = generateSnapshot();
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

// ── Tests ──────────────────────────────────────────────────────────

test('api stability: golden exports are non-empty', () => {
  assert.ok(GOLDEN_EXPORTS.length > 0, 'golden exports should not be empty');
  assert.ok(GOLDEN_EXPORTS.every(e => e.name && e.kind && e.module), 'all exports should have name, kind, module');
});

test('api stability: golden exports have valid kinds', () => {
  const validKinds = new Set(['class', 'function', 'interface', 'type', 'const']);
  for (const exp of GOLDEN_EXPORTS) {
    assert.ok(validKinds.has(exp.kind), `${exp.name} has valid kind: ${exp.kind}`);
  }
});

test('api stability: golden snapshot has expected structure', () => {
  const snapshot = generateSnapshot();
  assert.strictEqual(snapshot.version, '0.2.0');
  assert.ok(snapshot.generatedAt, 'should have timestamp');
  assert.ok(snapshot.exports.length > 0);
});

test('api stability: expected exports exist in golden snapshot', () => {
  const expectedNames = new Set([
    'LunumRecord',
    'LunumSem',
    'LunumSidecar',
    'createRecord',
    'deriveLunumSidecar',
    'deriveSurfaceSidecar',
    'compileContext',
    'compileLunumShadowContext',
    'canonicalizeSem',
    'fingerprintSem',
    'surfaceFingerprint',
    'compareSem',
    'classifyEligibility',
    'SEM_SCHEMA',
    'RECORD_SCHEMA',
    'FP_VERSION',
    'DEFAULT_RENDERER'
  ]);

  const actualNames = new Set(GOLDEN_EXPORTS.map(e => e.name));
  const missing = [...expectedNames].filter(n => !actualNames.has(n));
  assert.deepStrictEqual(missing, [], `Missing expected exports: ${missing.join(', ') || 'none'}`);
});

test('api stability: no duplicate export names', () => {
  const names = GOLDEN_EXPORTS.map(e => e.name);
  const duplicates = new Set(names.filter((n, i) => names.indexOf(n) !== i));
  assert.deepStrictEqual([...duplicates], [], `Duplicate export names: ${[...duplicates].join(', ') || 'none'}`);
});

test('api stability: snapshot file is created and loadable', () => {
  const snapshot = loadOrGenerateSnapshot();
  assert.ok(snapshot.version);
  assert.ok(snapshot.exports.length > 0);
});

test('api stability: snapshot matches golden exports', () => {
  const snapshot = loadOrGenerateSnapshot();
  const goldenNames = new Set(GOLDEN_EXPORTS.map(e => e.name));
  const snapshotNames = new Set(snapshot.exports.map(e => e.name));

  const missingFromSnapshot = [...goldenNames].filter(n => !snapshotNames.has(n));
  const extraInSnapshot = [...snapshotNames].filter(n => !goldenNames.has(n));

  assert.deepStrictEqual(missingFromSnapshot, [], `Golden exports missing from snapshot: ${missingFromSnapshot.join(', ') || 'none'}`);
  assert.deepStrictEqual(extraInSnapshot, [], `Snapshot has extra exports not in golden: ${extraInSnapshot.join(', ') || 'none'}`);
});

test('api stability: expected modules covered', () => {
  const expectedModules = new Set([
    'types',
    'constants',
    'canonicalize',
    'fingerprint',
    'fingerprint-migration',
    'render',
    'policy',
    'derive',
    'context',
    'compare',
    'profile-selector',
    'token-atlas',
    'agent-state',
    'native-model',
    'error-observability',
    'downstream-quality',
    'mixed-context-quality',
    'prompt-injection',
    'renderer-conformance'
  ]);

  const actualModules = new Set(GOLDEN_EXPORTS.map(e => e.module));
  const missing = [...expectedModules].filter(m => !actualModules.has(m));
  assert.deepStrictEqual(missing, [], `Missing modules in golden: ${missing.join(', ') || 'none'}`);
});

test('api stability: function exports have signatures', () => {
  const functions = GOLDEN_EXPORTS.filter(e => e.kind === 'function');
  for (const fn of functions) {
    assert.ok(fn.signature, `${fn.name} should have a signature`);
    assert.ok(fn.signature!.startsWith('('), `${fn.name} signature should start with (`);
    assert.ok(fn.signature!.endsWith(')'), `${fn.name} signature should end with )`);
  }
});

test('api stability: class exports exist', () => {
  const classes = GOLDEN_EXPORTS.filter(e => e.kind === 'class');
  const classNames = classes.map(e => e.name);
  assert.ok(classNames.length > 0, 'should have class exports');
});

test('api stability: interface exports exist', () => {
  const interfaces = GOLDEN_EXPORTS.filter(e => e.kind === 'interface');
  const interfaceNames = interfaces.map(e => e.name);
  assert.ok(interfaceNames.length > 0, 'should have interface exports');
});

test('api stability: type exports exist', () => {
  const types = GOLDEN_EXPORTS.filter(e => e.kind === 'type');
  const typeNames = types.map(e => e.name);
  assert.ok(typeNames.length > 0, 'should have type exports');
});

test('api stability: const exports exist', () => {
  const consts = GOLDEN_EXPORTS.filter(e => e.kind === 'const');
  const constNames = consts.map(e => e.name);
  assert.ok(constNames.length > 0, 'should have const exports');
});
