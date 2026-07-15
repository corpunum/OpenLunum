import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import type { ExperimentTask, WorkArea } from '../dist/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test compiled to packages/eval/dist/test/
// 4 levels up = workspace root
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PKG_DIST = path.resolve(__dirname, '..');

// All 8 task types from CAMPAIGN.md Phase 6.1
const ALL_TASKS: ExperimentTask[] = ['parse', 'realize', 'render', 'context', 'retrieval', 'integration', 'conformance', 'infrastructure'];

// All 8 work areas from WORK_QUEUE.md
const ALL_AREAS: WorkArea[] = ['semantic-contract', 'multilingual-parse', 'realization', 'rendering', 'context', 'retrieval', 'integration', 'infrastructure'];

test('experiment schema has all 8 task types', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'experiment.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const taskEnum = schema.properties.task.enum;
  assert.strictEqual(taskEnum.length, 8, 'Must have exactly 8 task types');
  for (const task of ALL_TASKS) {
    assert.ok(taskEnum.includes(task), `Task "${task}" must be in schema enum`);
  }
});

test('experiment schema has all 8 work areas', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'experiment.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const areaEnum = schema.properties.area.enum;
  assert.strictEqual(areaEnum.length, 8, 'Must have exactly 8 work areas');
  for (const area of ALL_AREAS) {
    assert.ok(areaEnum.includes(area), `Area "${area}" must be in schema enum`);
  }
});

test('deterministic flag is supported', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'experiment.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  assert.ok('deterministic' in schema.properties, 'Schema must support deterministic flag');
});

test('dataset is optional for deterministic tasks', async () => {
  const schemaPath = path.join(WORKSPACE_ROOT, 'schemas', 'experiment.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const required = schema.required;
  assert.ok(!required.includes('dataset'), 'dataset should not be in required fields');
  assert.ok(!required.includes('modelProfile'), 'modelProfile should not be in required fields');
});

test('runner handles all 8 task types', async () => {
  const runnerPath = path.join(PKG_DIST, 'src', 'runner.js');
  const content = fs.readFileSync(runnerPath, 'utf-8');
  for (const task of ALL_TASKS) {
    assert.ok(content.includes(`'${task}'`) || content.includes(`"${task}"`), `Runner must handle task: ${task}`);
  }
});

test('prompts defined for all 8 task types', async () => {
  const promptsPath = path.join(PKG_DIST, 'src', 'prompts.js');
  const content = fs.readFileSync(promptsPath, 'utf-8');
  const promptFunctions = [
    'parsePrompt', 'realizePrompt', 'renderPrompt', 'contextPrompt',
    'retrievalPrompt', 'integrationPrompt', 'conformancePrompt', 'infrastructurePrompt'
  ];
  for (const fn of promptFunctions) {
    assert.ok(content.includes(`function ${fn}`) || content.includes(`${fn}(`), `Prompt function ${fn} must be defined`);
  }
});

test('types export all 8 task types', async () => {
  const dtsPath = path.join(PKG_DIST, 'src', 'types.d.ts');
  const content = fs.readFileSync(dtsPath, 'utf-8');
  for (const task of ALL_TASKS) {
    assert.ok(content.includes(`'${task}'`) || content.includes(`"${task}"`), `Type must include task: ${task}`);
  }
});

// Create a sample deterministic experiment manifest to verify it validates
test('deterministic infrastructure manifest validates', async () => {
  const { validateManifest } = await import('../src/io.js');
  const manifest = {
    schema: 'openlunum-experiment/0.1' as const,
    id: 'test-infra',
    area: 'infrastructure',
    task: 'infrastructure',
    deterministic: true,
    hypothesis: 'Testing infrastructure checks run without model',
    baselineCommit: 'ca623ec',
    limits: { maxItems: 5, maxAttemptsPerItem: 1, maxModelCalls: 1 },
    gates: { minimumExactRate: 0.5 },
    outputDirectory: 'reports/experiments/test-infra'
  };
  assert.doesNotThrow(() => validateManifest(manifest), 'Deterministic manifest should validate without dataset/modelProfile');
});

// Create a sample model-based experiment manifest to verify it validates
test('model-based parse manifest validates', async () => {
  const { validateManifest } = await import('../src/io.js');
  const manifest = {
    schema: 'openlunum-experiment/0.1' as const,
    id: 'test-parse',
    area: 'multilingual-parse',
    task: 'parse',
    hypothesis: 'Testing parse task with model profile',
    baselineCommit: 'ca623ec',
    dataset: { path: 'datasets/dev/multilingual-core-v1.jsonl', sha256: 'a'.repeat(64) },
    modelProfile: 'profiles/models/test.json',
    limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 30 },
    gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.8, requireProtectedLiteralCoverage: true },
    outputDirectory: 'reports/experiments/test-parse'
  };
  assert.doesNotThrow(() => validateManifest(manifest), 'Model-based manifest should validate with dataset/modelProfile');
});
