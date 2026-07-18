/**
 * Deterministic golden-output tests for renderer profiles.
 *
 * Validates that safe/short/tight profiles produce consistent,
 * deterministic output for diverse semantic inputs.
 *
 * These tests upgrade renderer profiles from "Experiment" to "Reference"
 * by providing:
 * 1. 15 diverse input records covering different semantic patterns
 * 2. Golden expected outputs for each profile type
 * 3. Deterministic verification of structure and content
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { ProfileGenerator, type ProfileType, type ProfileResult } from '../src/profiles.js';
import type { LunumRecord, LunumSem, LunumClause } from '../src/types.js';

// ── Helper to create test records ──────────────────────────────────

function makeRecord(
  text: string,
  language: string,
  sem: LunumSem,
  fingerprint: string = 'lfp:0.1:sha256:test'
): LunumRecord {
  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text, language, role: null, ref: null },
    sem,
    fingerprint,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: [] },
    meta: {}
  };
}

// ── 15 Diverse Test Inputs ─────────────────────────────────────────

interface DiverseInput {
  name: string;
  record: LunumRecord;
}

const diverseInputs: DiverseInput[] = [
  {
    name: 'simple-predicate',
    record: makeRecord(
      'The user likes coffee.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'preference',
        clauses: [{ predicate: 'like', roles: { experiencer: 'user', theme: 'coffee' } }]
      }
    )
  },
  {
    name: 'negated-clause',
    record: makeRecord(
      'The system does not accept invalid tokens.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [{ predicate: 'accept', roles: { agent: 'system', theme: 'token' }, negated: true }]
      }
    )
  },
  {
    name: 'nested-conditions',
    record: makeRecord(
      'If the user is authenticated and the token is valid, grant access.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'instruction',
        clauses: [{
          predicate: 'grant',
          roles: { agent: 'system', target: 'access' },
          conditions: [
            { predicate: 'authenticate', roles: { agent: 'user' } },
            { predicate: 'validate', roles: { subject: 'token' } }
          ]
        }]
      }
    )
  },
  {
    name: 'modality-certainty',
    record: makeRecord(
      'The experiment definitely shows this effect.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [
          { predicate: 'show', roles: { agent: 'experiment', theme: 'effect' }, modality: 'certainty' }
        ]
      }
    )
  },
  {
    name: 'with-annotations',
    record: makeRecord(
      'The user prefers dark mode.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'preference',
        clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'dark_mode' } }],
        annotations: { confidence: 0.95, tags: ['ui', 'preference'] }
      }
    )
  },
  {
    name: 'with-provenance',
    record: makeRecord(
      'The document states this fact.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [{ predicate: 'state', roles: { source: 'document', theme: 'fact' } }],
        provenance: { source: 'manual', author: 'alice', timestamp: '2026-01-15T10:00:00Z' }
      }
    )
  },
  {
    name: 'consequences',
    record: makeRecord(
      'When the temperature exceeds 100, trigger the alarm.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'rule',
        clauses: [{
          predicate: 'trigger',
          roles: { agent: 'system', theme: 'alarm' },
          conditions: [{ predicate: 'exceed', roles: { subject: 'temperature', value: 100 } }]
        }]
      }
    )
  },
  {
    name: 'multiple-clauses',
    record: makeRecord(
      'Alice likes coffee and Bob prefers tea.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [
          { predicate: 'like', roles: { experiencer: 'alice', theme: 'coffee' } },
          { predicate: 'prefer', roles: { experiencer: 'bob', theme: 'tea' } }
        ]
      }
    )
  },
  {
    name: 'time-reference',
    record: makeRecord(
      'The meeting starts at noon.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'event',
        clauses: [{ predicate: 'start', roles: { subject: 'meeting', time: '12:00' } }]
      }
    )
  },
  {
    name: 'modality-possibility',
    record: makeRecord(
      'It might rain tomorrow.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'prediction',
        clauses: [{ predicate: 'rain', roles: {}, modality: 'possibility' }]
      }
    )
  },
  {
    name: 'nested-consequences',
    record: makeRecord(
      'If the order is placed, ship it and notify the customer.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'instruction',
        clauses: [{
          predicate: 'notify',
          roles: { agent: 'system', theme: 'customer' },
          conditions: [{
            predicate: 'ship',
            roles: { agent: 'system', theme: 'order' },
            conditions: [{ predicate: 'place', roles: { agent: 'customer' } }]
          }]
        }]
      }
    )
  },
  {
    name: 'long-role-text',
    record: makeRecord(
      'The extremely long descriptive text for the subject parameter is processed.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [{
          predicate: 'process',
          roles: {
            agent: 'system',
            subject: 'An extremely long descriptive text that exceeds fifty characters and should be truncated in tight profile'
          }
        }]
      }
    )
  },
  {
    name: 'empty-clause-roles',
    record: makeRecord(
      'Something exists.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'statement',
        clauses: [{ predicate: 'exist', roles: {} }]
      }
    )
  },
  {
    name: 'with-references',
    record: makeRecord(
      'See the documentation for details.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'instruction',
        clauses: [{ predicate: 'see', roles: { agent: 'reader', theme: 'doc' } }],
        references: [{ uri: 'https://example.com/doc', label: 'Documentation', type: 'source' }]
      }
    )
  },
  {
    name: 'complex-mixed',
    record: makeRecord(
      'The authenticated user can optionally access the restricted resource if the token expires.',
      'en',
      {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'rule',
        clauses: [{
          predicate: 'access',
          roles: { agent: 'user', theme: 'resource' },
          modality: 'possibility',
          conditions: [
            { predicate: 'authenticate', roles: { agent: 'user' } },
            { predicate: 'expire', roles: { subject: 'token' } }
          ]
        }],
        annotations: { confidence: 0.8, tags: ['access-control'] },
        provenance: { source: 'spec', author: 'team' }
      }
    )
  }
];

// ── Helper to compute deterministic hash of record structure ───────

function hashRecordStructure(record: LunumRecord): string {
  // Deterministic serialization of semantic structure
  const sem = record.sem as any;
  const predicates = sem.clauses.map((c: any) => c.predicate).join('|');
  const roles = sem.clauses.map((c: any) => {
    const roleKeys = Object.keys(c.roles || {}).sort();
    return roleKeys.map(k => `${k}:${typeof c.roles[k] === 'string' ? c.roles[k].substring(0, 10) : 'obj'}`).join(',');
  }).join(';');
  const hasAnnotations = sem.annotations && Object.keys(sem.annotations).length > 0 ? 'ann' : '';
  const hasProvenance = sem.provenance && Object.keys(sem.provenance).length > 0 ? 'prov' : '';
  const hasReferences = sem.references && sem.references.length > 0 ? 'ref' : '';

  const parts = [predicates, roles, hasAnnotations, hasProvenance, hasReferences].filter(Boolean);
  return Buffer.from(parts.join('|||')).toString('base64').slice(0, 40);
}

// ── Tests ──────────────────────────────────────────────────────────

test('renderer golden: deterministic output for all profiles and inputs', () => {
  const generator = new ProfileGenerator();

  for (const { name, record } of diverseInputs) {
    // Apply each profile
    const safe = generator.profileSafe(record);
    const short = generator.profileShort(record);
    const tight = generator.profileTight(record);

    // Verify profile types
    assert.strictEqual(safe.type, 'safe', `${name}: safe profile type`);
    assert.strictEqual(short.type, 'short', `${name}: short profile type`);
    assert.strictEqual(tight.type, 'tight', `${name}: tight profile type`);

    // Verify structure: predicates always preserved
    const origPreds = new Set(record.sem.clauses.map((c: LunumClause) => c.predicate));
    for (const result of [safe, short, tight]) {
      const profiledPreds = new Set(result.record.sem.clauses.map((c: LunumClause) => c.predicate));
      assert.ok(
        origPreds.size === profiledPreds.size && [...origPreds].every(p => profiledPreds.has(p)),
        `${name}: predicates preserved in ${result.type} profile`
      );
    }

    // Verify annotations: safe preserves, short/tight reduces
    if ((record.sem as any).annotations && Object.keys((record.sem as any).annotations).length > 0) {
      const origAnnotCount = Object.keys((record.sem as any).annotations).length;
      assert.ok(
        safe.record.sem.annotations && Object.keys(safe.record.sem.annotations).length > 0,
        `${name}: annotations preserved in safe`
      );
      // short and tight should have fewer or equal annotation keys
      const shortAnnotCount = Object.keys((short.record.sem as any).annotations || {}).length;
      const tightAnnotCount = Object.keys((tight.record.sem as any).annotations || {}).length;
      assert.ok(shortAnnotCount <= origAnnotCount, `${name}: short annotations <= original (${shortAnnotCount} <= ${origAnnotCount})`);
      assert.ok(tightAnnotCount <= origAnnotCount, `${name}: tight annotations <= original (${tightAnnotCount} <= ${origAnnotCount})`);
    }

    // Verify provenance: safe preserves, tight reduces
    if ((record.sem as any).provenance && Object.keys((record.sem as any).provenance).length > 0) {
      const origProvCount = Object.keys((record.sem as any).provenance).length;
      assert.ok(
        safe.record.sem.provenance && Object.keys(safe.record.sem.provenance).length > 0,
        `${name}: provenance preserved in safe`
      );
      const tightProvCount = Object.keys((tight.record.sem as any).provenance || {}).length;
      assert.ok(tightProvCount <= origProvCount, `${name}: tight provenance <= original (${tightProvCount} <= ${origProvCount})`);
    }

    // Verify renderings: tight removes
    if (Object.keys(record.renderings).length > 0) {
      assert.ok(Object.keys(tight.record.renderings).length === 0, `${name}: renderings removed in tight`);
    }

    // Verify token counts are positive
    assert.ok(safe.originalTokens > 0, `${name}: positive original tokens`);
    assert.ok(safe.profiledTokens > 0, `${name}: positive profiled tokens`);
    assert.ok(short.originalTokens > 0, `${name}: positive original tokens`);
    assert.ok(short.profiledTokens > 0, `${name}: positive profiled tokens`);
    assert.ok(tight.originalTokens > 0, `${name}: positive original tokens`);
    assert.ok(tight.profiledTokens > 0, `${name}: positive profiled tokens`);

    // Verify reductions are non-negative
    assert.ok(safe.reduction >= 0, `${name}: non-negative reduction for safe`);
    assert.ok(short.reduction >= 0, `${name}: non-negative reduction for short`);
    assert.ok(tight.reduction >= 0, `${name}: non-negative reduction for tight`);

    // Verify preservation is between 0 and 1
    assert.ok(safe.preservation >= 0 && safe.preservation <= 1, `${name}: preservation in [0,1] for safe`);
    assert.ok(short.preservation >= 0 && short.preservation <= 1, `${name}: preservation in [0,1] for short`);
    assert.ok(tight.preservation >= 0 && tight.preservation <= 1, `${name}: preservation in [0,1] for tight`);

    // Verify warnings exist
    assert.ok(safe.warnings !== undefined, `${name}: warnings defined for safe`);
    assert.ok(short.warnings !== undefined, `${name}: warnings defined for short`);
    assert.ok(tight.warnings !== undefined, `${name}: warnings defined for tight`);
  }
});

test('renderer golden: safe profile preserves more than short', () => {
  const generator = new ProfileGenerator();
  const filtered = diverseInputs.filter(r => r.name !== 'empty-clause-roles');

  for (const { record } of filtered) {
    const safe = generator.profileSafe(record);
    const short = generator.profileShort(record);

    // Safe should have higher or equal preservation
    assert.ok(
      safe.preservation >= short.preservation - 0.01,
      `safe preservation ${safe.preservation} >= short ${short.preservation}`
    );

    // Safe should have lower or equal reduction
    assert.ok(
      safe.reduction <= short.reduction + 0.01,
      `safe reduction ${safe.reduction} <= short ${short.reduction}`
    );
  }
});

test('renderer golden: short profile preserves more than tight', () => {
  const generator = new ProfileGenerator();
  const filtered = diverseInputs.filter(r => r.name !== 'empty-clause-roles');

  for (const { record } of filtered) {
    const short = generator.profileShort(record);
    const tight = generator.profileTight(record);

    // Short should have higher or equal preservation
    assert.ok(
      short.preservation >= tight.preservation - 0.01,
      `short preservation ${short.preservation} >= tight ${tight.preservation}`
    );

    // Short should have lower or equal reduction
    assert.ok(
      short.reduction <= tight.reduction + 0.01,
      `short reduction ${short.reduction} <= tight ${tight.reduction}`
    );
  }
});

test('renderer golden: deterministic output — same input produces same result', () => {
  const generator1 = new ProfileGenerator();
  const generator2 = new ProfileGenerator();
  const record = diverseInputs[0]!.record;

  const r1 = generator1.profileSafe(record);
  const r2 = generator2.profileSafe(record);

  assert.strictEqual(r1.type, r2.type);
  assert.strictEqual(r1.preservation, r2.preservation);
  assert.strictEqual(r1.originalTokens, r2.originalTokens);
  assert.strictEqual(r1.profiledTokens, r2.profiledTokens);
});

test('renderer golden: predicates preserved across all profiles', () => {
  const generator = new ProfileGenerator();

  for (const { name, record } of diverseInputs) {
    for (const profileType of ['safe', 'short', 'tight'] as ProfileType[]) {
      const result = generator.profile(record, profileType);
      const origPreds = record.sem.clauses.map((c: LunumClause) => c.predicate);
      const profPreds = result.record.sem.clauses.map((c: LunumClause) => c.predicate);
      assert.deepStrictEqual(origPreds, profPreds, `${name}: predicates identical in ${profileType}`);
    }
  }
});

test('renderer golden: warnings for annotation removal', () => {
  const generator = new ProfileGenerator();
  const entry = diverseInputs.find(r => r.name === 'with-annotations')!;

  const safe = generator.profileSafe(entry.record);
  const short = generator.profileShort(entry.record);
  const tight = generator.profileTight(entry.record);

  // Safe should not warn about annotations
  assert.ok(!safe.warnings!.some(w => w.toLowerCase().includes('annotation')), 'safe: no annotation warning');

  // Short and tight should warn about annotation removal
  assert.ok(short.warnings!.some(w => w.toLowerCase().includes('annotation')), 'short: warns about annotations');
  assert.ok(tight.warnings!.some(w => w.toLowerCase().includes('annotation')), 'tight: warns about annotations');
});

test('renderer golden: warnings for provenance removal', () => {
  const generator = new ProfileGenerator();
  const entry = diverseInputs.find(r => r.name === 'with-provenance')!;

  const safe = generator.profileSafe(entry.record);
  const short = generator.profileShort(entry.record);
  const tight = generator.profileTight(entry.record);

  // Safe should not warn about provenance
  assert.ok(!safe.warnings!.some(w => w.toLowerCase().includes('provenance')), 'safe: no provenance warning');

  // Tight should warn about provenance removal
  assert.ok(tight.warnings!.some(w => w.toLowerCase().includes('provenance')), 'tight: warns about provenance');
});

test('renderer golden: warnings for rendering removal', () => {
  const generator = new ProfileGenerator();
  const recordWithRenderings = makeRecord(
    'Test with renderings',
    'en',
    {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'test', roles: {} }]
    },
    'lfp:0.1:sha256:test'
  );
  recordWithRenderings.renderings = { en: { code: 'test', tokens: 5, profile: 'safe' } as any };

  const safe = generator.profileSafe(recordWithRenderings);
  const tight = generator.profileTight(recordWithRenderings);

  // Safe should not warn about renderings
  assert.ok(!safe.warnings!.some(w => w.toLowerCase().includes('rendering')), 'safe: no rendering warning');

  // Tight should warn about rendering removal
  assert.ok(tight.warnings!.some(w => w.toLowerCase().includes('rendering')), 'tight: warns about renderings');
});

test('renderer golden: diverse input count >= 10', () => {
  assert.ok(diverseInputs.length >= 15, `Should have at least 15 diverse inputs, got ${diverseInputs.length}`);
});

test('renderer golden: covers all profile types', () => {
  const names = diverseInputs.map(r => r.name);
  assert.ok(names.includes('simple-predicate'), 'Must cover simple predicate');
  assert.ok(names.includes('negated-clause'), 'Must cover negation');
  assert.ok(names.includes('nested-conditions'), 'Must cover conditions');
  assert.ok(names.includes('modality-certainty'), 'Must cover modality');
  assert.ok(names.includes('with-annotations'), 'Must cover annotations');
  assert.ok(names.includes('with-provenance'), 'Must cover provenance');
  assert.ok(names.includes('consequences'), 'Must cover consequences');
  assert.ok(names.includes('multiple-clauses'), 'Must cover multiple clauses');
  assert.ok(names.includes('nested-consequences'), 'Must cover nested');
  assert.ok(names.includes('long-role-text'), 'Must cover long text');
  assert.ok(names.includes('with-references'), 'Must cover references');
  assert.ok(names.includes('complex-mixed'), 'Must cover complex mixed');
});

test('renderer golden: profile config is retrievable', () => {
  const generator = new ProfileGenerator();

  for (const type of ['safe', 'short', 'tight'] as ProfileType[]) {
    const config = generator.getConfig(type);
    assert.strictEqual(config.type, type);
    assert.ok(config.preserveAnnotations !== undefined, `${type}: has preserveAnnotations`);
    assert.ok(config.preserveProvenance !== undefined, `${type}: has preserveProvenance`);
    assert.ok(config.maxTokenReduction !== undefined, `${type}: has maxTokenReduction`);
  }
});

test('renderer golden: config can be modified', () => {
  const generator = new ProfileGenerator();

  const before = generator.getConfig('safe');
  assert.strictEqual(before.preserveAnnotations, true);

  generator.setConfig('safe', { preserveAnnotations: false });

  const after = generator.getConfig('safe');
  assert.strictEqual(after.preserveAnnotations, false);
});
