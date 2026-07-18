import { test } from 'node:test';
import assert from 'node:assert';
import { 
  ConformanceVectorGenerator,
  PropertyTestRunner
} from '../src/conformance-vectors.js';

// Helper to create mock semantic representations
const createMockSem = (overrides = {}) => ({
  schema: 'lunum-sem/0.1-draft',
  world: 'test',
  kind: 'test',
  clauses: [{ 
    predicate: 'test', 
    roles: { subject: 'test' },
    ...overrides
  }],
  references: [],
  provenance: {},
  annotations: {}
});

test('ConformanceVectorGenerator generates vectors', () => {
  const generator = new ConformanceVectorGenerator();
  
  const sem = createMockSem();
  const vector = generator.generateVector(sem);
  
  assert.ok(vector.id.startsWith('cv:'));
  assert.ok(vector.dimensions);
  assert.ok(vector.canonical);
  assert.ok(vector.hash.startsWith('cvh:'));
});

test('ConformanceVectorGenerator extracts dimensions', () => {
  const generator = new ConformanceVectorGenerator();
  
  const sem = createMockSem({
    negated: true,
    modality: 'certainty'
  });
  
  const vector = generator.generateVector(sem);
  
  assert.ok(vector.dimensions.negation > 0);
  assert.ok(vector.dimensions.modality > 0);
});

test('ConformanceVectorGenerator increments vector count', () => {
  const generator = new ConformanceVectorGenerator();
  
  const sem = createMockSem();
  generator.generateVector(sem);
  generator.generateVector(sem);
  
  assert.strictEqual(generator.getVectorCount(), 2);
});

test('ConformanceVectorGenerator resets vector count', () => {
  const generator = new ConformanceVectorGenerator();
  
  const sem = createMockSem();
  generator.generateVector(sem);
  generator.reset();
  
  assert.strictEqual(generator.getVectorCount(), 0);
});

test('PropertyTestRunner tests schema consistency', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  const tests = runner.runTests(sem);
  
  const schemaTest = tests.find(t => t.name === 'schema-consistency');
  assert.ok(schemaTest);
  assert.ok(schemaTest!.passed);
});

test('PropertyTestRunner tests world consistency', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  const tests = runner.runTests(sem);
  
  const worldTest = tests.find(t => t.name === 'world-consistency');
  assert.ok(worldTest);
  assert.ok(worldTest!.passed);
});

test('PropertyTestRunner tests kind consistency', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  const tests = runner.runTests(sem);
  
  const kindTest = tests.find(t => t.name === 'kind-consistency');
  assert.ok(kindTest);
  assert.ok(kindTest!.passed);
});

test('PropertyTestRunner tests clause structure', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  const tests = runner.runTests(sem);
  
  const clauseTest = tests.find(t => t.name === 'clause-structure');
  assert.ok(clauseTest);
  assert.ok(clauseTest!.passed);
});

test('PropertyTestRunner tests clause negation', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem({ negated: true });
  const tests = runner.runTests(sem);
  
  const negationTest = tests.find(t => t.name === 'clause-0-negation');
  assert.ok(negationTest);
  assert.ok(negationTest!.passed);
});

test('PropertyTestRunner gets results', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  runner.runTests(sem);
  
  const results = runner.getResults();
  
  assert.ok(results.totalTests > 0);
  assert.ok(results.passedTests > 0);
  assert.ok(results.failedTests >= 0);
  assert.ok(results.passRate >= 0 && results.passRate <= 1);
});

test('PropertyTestRunner clears results', () => {
  const runner = new PropertyTestRunner();
  
  const sem = createMockSem();
  runner.runTests(sem);
  runner.clear();
  
  const tests = runner.getResults();
  assert.strictEqual(tests.totalTests, 0);
});