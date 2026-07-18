import { strict as assert } from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import * as AjvModule from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SchemaWithDefs {
  $schema?: string;
  $id?: string;
  $defs?: Record<string, unknown>;
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, { $ref?: string; [key: string]: unknown }>;
  title?: string;
  description?: string;
}

const SCHEMA_DIR = path.resolve(__dirname, '../../../../schemas');

describe('schema cross-references', () => {
  let ajv: AjvModule.Ajv;
  let sharedSchema: SchemaWithDefs;
  let experimentSchema: SchemaWithDefs;
  let protectedEvalSchema: SchemaWithDefs;
  let reportValidationSchema: SchemaWithDefs;
  let lunumSemSchema: SchemaWithDefs;
  let lunumRecordSchema: SchemaWithDefs;

  before(() => {
    ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    sharedSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'shared.schema.json'), 'utf8')) as SchemaWithDefs;
    experimentSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'experiment.schema.json'), 'utf8')) as SchemaWithDefs;
    protectedEvalSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'protected-eval.schema.json'), 'utf8')) as SchemaWithDefs;
    reportValidationSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'report-validation.schema.json'), 'utf8')) as SchemaWithDefs;
    lunumSemSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'lunum-sem.schema.json'), 'utf8')) as SchemaWithDefs;
    lunumRecordSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'lunum-record.schema.json'), 'utf8')) as SchemaWithDefs;
  });

  it('shared schema has $defs with dataset, limits, gates, id, task, area, coverage', () => {
    assert.ok(sharedSchema.$defs, 'shared schema must define $defs');
    assert.ok(sharedSchema.$defs.dataset, 'shared schema must define dataset');
    assert.ok(sharedSchema.$defs.limits, 'shared schema must define limits');
    assert.ok(sharedSchema.$defs.gates, 'shared schema must define gates');
    assert.ok(sharedSchema.$defs.id, 'shared schema must define id');
    assert.ok(sharedSchema.$defs.task, 'shared schema must define task');
    assert.ok(sharedSchema.$defs.area, 'shared schema must define area');
    assert.ok(sharedSchema.$defs.coverage, 'shared schema must define coverage');
  });

  it('experiment schema references shared dataset', () => {
    assert.ok(experimentSchema.properties!.dataset!.$ref, 'experiment dataset must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.dataset!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/dataset');
  });

  it('experiment schema references shared limits', () => {
    assert.ok(experimentSchema.properties!.limits!.$ref, 'experiment limits must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.limits!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/limits');
  });

  it('experiment schema references shared gates', () => {
    assert.ok(experimentSchema.properties!.gates!.$ref, 'experiment gates must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.gates!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/gates');
  });

  it('experiment schema references shared id', () => {
    assert.ok(experimentSchema.properties!.id!.$ref, 'experiment id must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.id!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/id');
  });

  it('experiment schema references shared area', () => {
    assert.ok(experimentSchema.properties!.area!.$ref, 'experiment area must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.area!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/area');
  });

  it('experiment schema references shared task', () => {
    assert.ok(experimentSchema.properties!.task!.$ref, 'experiment task must $ref shared definitions');
    assert.strictEqual(experimentSchema.properties!.task!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/task');
  });

  it('protected-eval schema references shared dataset', () => {
    assert.ok(protectedEvalSchema.properties!.dataset!.$ref, 'protected-eval dataset must $ref shared definitions');
    assert.strictEqual(protectedEvalSchema.properties!.dataset!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/dataset');
  });

  it('protected-eval schema references shared coverage', () => {
    assert.ok(protectedEvalSchema.properties!.coverage!.$ref, 'protected-eval coverage must $ref shared definitions');
    assert.strictEqual(protectedEvalSchema.properties!.coverage!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/coverage');
  });

  it('report-validation schema references shared definitions', () => {
    assert.ok(reportValidationSchema.properties!.dataset!.$ref, 'report-validation dataset must $ref shared definitions');
    assert.strictEqual(reportValidationSchema.properties!.dataset!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/dataset');
    assert.ok(reportValidationSchema.properties!.limits!.$ref, 'report-validation limits must $ref shared definitions');
    assert.strictEqual(reportValidationSchema.properties!.limits!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/limits');
    assert.ok(reportValidationSchema.properties!.gates!.$ref, 'report-validation gates must $ref shared definitions');
    assert.strictEqual(reportValidationSchema.properties!.gates!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/gates');
  });

  it('lunum-record schema references lunum-sem schema', () => {
    assert.ok(lunumRecordSchema.properties!.sem!.$ref, 'lunum-record sem must $ref lunum-sem schema');
    assert.strictEqual(lunumRecordSchema.properties!.sem!.$ref, 'https://openlunum.org/schemas/lunum-sem/0.1-draft');
  });

  it('lunum-sem schema references shared coverage for annotations', () => {
    assert.ok(lunumSemSchema.properties!.annotations!.$ref, 'lunum-sem annotations must $ref shared definitions');
    assert.strictEqual(lunumSemSchema.properties!.annotations!.$ref, 'https://openlunum.org/schemas/shared/0.1#/$defs/coverage');
  });

  it('cross-schema validation: valid experiment manifest passes ajv validation', () => {
    const freshAjv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    freshAjv.addSchema(sharedSchema, sharedSchema.$id);
    const validate = freshAjv.compile(experimentSchema);
    const validExperiment = {
      schema: 'openlunum-experiment/0.1',
      id: 'test-exp-001',
      area: 'semantic-contract',
      task: 'parse',
      hypothesis: 'Local models will achieve acceptable parse quality on English and Greek baselines.',
      baselineCommit: 'abc123',
      dataset: { path: 'datasets/gold/en-001.json', sha256: 'a'.repeat(64) },
      limits: { maxItems: 10, maxAttemptsPerItem: 3, maxModelCalls: 100 },
      gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.7, requireProtectedLiteralCoverage: true },
      outputDirectory: '/tmp/test-output'
    };
    const valid = validate(validExperiment);
    assert.strictEqual(valid, true, `Experiment validation failed: ${JSON.stringify(validate.errors)}`);
  });

  it('cross-schema validation: valid protected-eval manifest passes ajv validation', () => {
    const freshAjv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    freshAjv.addSchema(sharedSchema, sharedSchema.$id);
    const validate = freshAjv.compile(protectedEvalSchema);
    const validProtectedEval = {
      schema: 'openlunum-protected-eval/0.1',
      id: 'protected-001',
      datasetId: 'golden-set-v1',
      version: 'v1.0.0',
      dataset: { path: 'datasets/protected/gold.json', sha256: 'b'.repeat(64), license: 'CC-BY-4.0' },
      instructions: 'Evaluate parse quality on protected dataset.',
      coverage: {
        tasks: ['parse', 'realize'],
        languages: ['en', 'el'],
        categories: ['greeting', 'statement', 'question']
      }
    };
    const valid = validate(validProtectedEval);
    assert.strictEqual(valid, true, `Protected-eval validation failed: ${JSON.stringify(validate.errors)}`);
  });

  it('cross-schema validation: valid lunum-sem record passes ajv validation', () => {
    const freshAjv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    freshAjv.addSchema(sharedSchema, sharedSchema.$id);
    const validate = freshAjv.compile(lunumSemSchema);
    const validSem = {
      schema: 'lunum-sem/0.1-draft',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: {
          entity: 'Alice',
          location: 'London'
        }
      }]
    };
    const valid = validate(validSem);
    assert.strictEqual(valid, true, `Lunum-sem validation failed: ${JSON.stringify(validate.errors)}`);
  });

  it('cross-schema validation: full graph resolves without circular reference errors', () => {
    const freshAjv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    freshAjv.addSchema(sharedSchema, sharedSchema.$id);
    freshAjv.addSchema(experimentSchema, 'experiment.schema.json');
    freshAjv.addSchema(protectedEvalSchema, 'protected-eval.schema.json');
    freshAjv.addSchema(lunumSemSchema, 'https://openlunum.org/schemas/lunum-sem/0.1-draft');
    freshAjv.addSchema(lunumRecordSchema, 'lunum-record.schema.json');

    // All schemas should compile without errors
    freshAjv.compile(experimentSchema);
    freshAjv.compile(protectedEvalSchema);
    freshAjv.compile(lunumSemSchema);
    freshAjv.compile(lunumRecordSchema);
  });

  it('shared schema id is resolvable', () => {
    assert.strictEqual(sharedSchema.$id, 'https://openlunum.org/schemas/shared/0.1');
  });

  it('all schemas have $schema and $id', () => {
    for (const [name, schema] of Object.entries({
      shared: sharedSchema,
      experiment: experimentSchema,
      protectedEval: protectedEvalSchema,
      reportValidation: reportValidationSchema,
      lunumSem: lunumSemSchema,
      lunumRecord: lunumRecordSchema
    })) {
      assert.ok(schema.$schema, `${name} must have $schema`);
      assert.ok(schema.$id, `${name} must have $id`);
    }
  });
});
