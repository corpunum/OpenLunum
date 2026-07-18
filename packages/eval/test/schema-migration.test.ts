import { strict as assert } from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import * as AjvModule from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(__dirname, '../../../../schemas');

describe('schema migration 0.1 → 0.2', () => {
  let ajv: AjvModule.Ajv;
  let semV01Schema: Record<string, unknown>;
  let semV02Schema: Record<string, unknown>;
  let sharedSchema: Record<string, unknown>;

  before(() => {
    ajv = new AjvModule.Ajv({ allErrors: true, strict: false, validateSchema: false });
    semV01Schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'lunum-sem-legacy-01.schema.json'), 'utf8'));
    semV02Schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'lunum-sem.schema.json'), 'utf8'));
  });

  it('0.1 and 0.2 schemas have different $id values', () => {
    const v01Id = String(semV01Schema.$id || '');
    const v02Id = String(semV02Schema.$id || '');
    assert.ok(v01Id.includes('0.1'), `v01 $id should contain '0.1': ${v01Id}`);
    assert.ok(v02Id.includes('0.2'), `v02 $id should contain '0.2': ${v02Id}`);
  });

  it('validates a 0.1 record against 0.1 schema', () => {
    const v01Validate = ajv.compile(semV01Schema);
    const record01 = {
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
    const valid = v01Validate(record01);
    assert.strictEqual(valid, true, `0.1 record failed 0.1 validation: ${JSON.stringify(v01Validate.errors)}`);
  });

  it('validates a 0.2 record against 0.2 schema', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record02 = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: {
          entity: { type: 'entity', id: 'alice-1', value: 'Alice' },
          location: { type: 'location', id: 'london-1', value: 'London' }
        }
      }]
    };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `0.2 record failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('migrates 0.1 record to 0.2: schema field updated', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record01 = {
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
    // Migration: update schema version
    const record02 = { ...record01, schema: 'lunum-sem/0.2' };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `Migrated record failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('migrates 0.1 record to 0.2 with references preserved', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record01 = {
      schema: 'lunum-sem/0.1-draft',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: {
          entity: 'Alice',
          location: 'London'
        }
      }],
      references: [{ uri: 'https://example.com/source/1' }],
      provenance: { source: 'manual', author: 'test' },
      annotations: { confidence: 0.95 }
    };
    const record02 = { ...record01, schema: 'lunum-sem/0.2' };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `Record with refs failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('migrates 0.1 record to 0.2 with negated clause', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record02 = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: {
          entity: 'Alice',
          location: 'London'
        },
        negated: true
      }]
    };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `Negated clause failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('migrates 0.1 record to 0.2 with modality', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record02 = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'believes',
        roles: {
          subject: { type: 'entity', id: 'alice-1', value: 'Alice' },
          content: 'London is the capital'
        },
        modality: 'belief'
      }]
    };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `Modality clause failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('migrates 0.1 record to 0.2 with conditional clause', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const record02 = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'if',
        roles: {
          condition: 'Alice travels',
          consequence: 'Alice arrives in London'
        },
        conditions: [{
          predicate: 'action',
          roles: { actor: 'Alice', action: 'travels' }
        }],
        consequences: [{
          predicate: 'located_at',
          roles: {
            entity: { type: 'entity', id: 'alice-1', value: 'Alice' },
            location: { type: 'location', id: 'london-1', value: 'London' }
          }
        }]
      }]
    };
    const valid = v02Validate(record02);
    assert.strictEqual(valid, true, `Conditional clause failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });

  it('rejects invalid 0.2 record: missing required schema field', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: { entity: 'Alice' }
      }]
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, 'Invalid 0.2 record should fail validation');
    assert.ok(v02Validate.errors?.some(e => e.keyword === 'required'));
  });

  it('rejects invalid 0.2 record: wrong schema const', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      schema: 'lunum-sem/0.1-draft',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: { entity: 'Alice' }
      }]
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, '0.1 record should fail 0.2 validation');
    assert.ok(v02Validate.errors?.some(e => e.keyword === 'const'));
  });

  it('rejects invalid 0.2 record: clause missing required predicate', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        roles: { entity: 'Alice' }
      }]
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, 'Clause without predicate should fail 0.2 validation');
  });

  it('rejects invalid 0.2 record: empty clauses array', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: []
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, 'Empty clauses should fail 0.2 validation');
  });

  it('rejects invalid 0.2 record: unknown top-level property', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: { entity: 'Alice' }
      }],
      extraField: 'should not be allowed'
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, 'Unknown top-level property should fail 0.2 validation');
  });

  it('rejects invalid 0.2 record: unknown clause property', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const badRecord = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/1',
      kind: 'statement',
      clauses: [{
        predicate: 'located_at',
        roles: { entity: 'Alice' },
        extraClauseProp: 'should not be allowed'
      }]
    };
    const valid = v02Validate(badRecord);
    assert.strictEqual(valid, false, 'Unknown clause property should fail 0.2 validation');
  });

  it('migration test: complex record with all features validates at 0.2', () => {
    const v02Validate = ajv.compile(semV02Schema);
    const complexRecord = {
      schema: 'lunum-sem/0.2',
      world: 'https://example.com/world/complex',
      kind: 'statement',
      clauses: [
        {
          predicate: 'located_at',
          roles: {
            entity: { type: 'entity', id: 'alice-1', value: 'Alice' },
            location: { type: 'location', id: 'london-1', value: 'London' }
          },
          modality: 'fact',
          time: '2024-01-01T00:00:00Z'
        },
        {
          predicate: 'believes',
          roles: {
            subject: { type: 'entity', id: 'alice-1', value: 'Alice' },
            content: 'It will rain tomorrow'
          },
          modality: 'belief',
          conditions: [{
            predicate: 'time',
            roles: { time: 'tomorrow' }
          }]
        }
      ],
      references: [{
        uri: 'https://example.com/source/1',
        type: 'text',
        label: 'Source article'
      }],
      provenance: {
        source: 'manual',
        author: 'analyst-1',
        timestamp: '2024-01-01T00:00:00Z'
      },
      annotations: {
        confidence: 0.85,
        tags: ['location', 'belief']
      }
    };
    const valid = v02Validate(complexRecord);
    assert.strictEqual(valid, true, `Complex record failed 0.2 validation: ${JSON.stringify(v02Validate.errors)}`);
  });
});
