/**
 * Fixture-driven tests for semantic-group-based cross-lingual matching
 * (issue #256). Mirrors the dataset ingest pattern used by
 * `retrieval-runner.ts`: fixtures live on disk under
 * `test-fixtures/semantic-groups/` and are validated at load time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LunumRecord } from '@corpunum/lunum';
import {
  buildSemanticGroupIndex,
  type SemanticGroupSchema
} from '../src/semantic-group-matching.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve from the compiled dist/test location up to the workspace root,
// since test-fixtures (plain JSON) are not copied into dist/ by tsc.
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE_DIR = path.join(WORKSPACE_ROOT, 'packages', 'eval', 'test-fixtures', 'semantic-groups');

interface FixtureRecord {
  fingerprint: string;
  language: string;
  text: string;
  groupId?: unknown;
  predicate: string;
  roles: Record<string, unknown>;
  extraClause?: boolean;
}

interface Fixture {
  description: string;
  expect: 'ok' | 'error' | 'suspect';
  expectedErrorPattern?: string;
  expectedSuspectGroupId?: string;
  records: FixtureRecord[];
}

interface SchemaFile {
  groups: SemanticGroupSchema;
}

function toLunumRecord(fixtureRecord: FixtureRecord): LunumRecord {
  const clauses: any[] = [{
    predicate: fixtureRecord.predicate,
    roles: fixtureRecord.roles,
    negated: false
  }];
  if (fixtureRecord.extraClause) {
    clauses.push({
      predicate: 'warn',
      roles: { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'danger' } },
      negated: false
    });
  }

  // A fixture's groupId is only materialized as a real annotation when it
  // is present and non-null -- matching the "missing group id" case, which
  // must have no annotation at all rather than an explicit null/empty one.
  const annotations = (fixtureRecord.groupId !== undefined && fixtureRecord.groupId !== null)
    ? { semanticGroupId: fixtureRecord.groupId }
    : undefined;

  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text: fixtureRecord.text, language: fixtureRecord.language, role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses,
      ...(annotations ? { annotations } : {})
    },
    fingerprint: fixtureRecord.fingerprint,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: ['test'] },
    meta: {}
  };
}

async function loadSchema(): Promise<SemanticGroupSchema> {
  const raw = await readFile(path.join(FIXTURE_DIR, 'schema.json'), 'utf8');
  const parsed = JSON.parse(raw) as SchemaFile;
  return parsed.groups;
}

async function loadFixture(file: string): Promise<Fixture> {
  const raw = await readFile(path.join(FIXTURE_DIR, file), 'utf8');
  return JSON.parse(raw) as Fixture;
}

test('semantic-group fixtures: directory contains all required negative + positive cases', async () => {
  const entries = await readdir(FIXTURE_DIR);
  const fixtureFiles = entries.filter((f) => f.endsWith('.json') && f !== 'schema.json');

  assert.ok(fixtureFiles.includes('positive-parallel-group.json'), 'missing positive EN/EL/ES/ID fixture');
  assert.ok(fixtureFiles.includes('negative-forged-group-id.json'), 'missing forged group id fixture');
  assert.ok(fixtureFiles.includes('negative-same-language-collision.json'), 'missing same-language collision fixture');
  assert.ok(fixtureFiles.includes('negative-malformed-group-id.json'), 'missing malformed group id fixture');
  assert.ok(fixtureFiles.includes('negative-missing-group-fallback.json'), 'missing missing-group-id fallback fixture');
  assert.ok(fixtureFiles.includes('negative-structural-mismatch.json'), 'missing structural mismatch fixture');
});

test('fixture: positive-parallel-group.json ingests cleanly with 4 EN/EL/ES/ID members', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('positive-parallel-group.json');
  assert.equal(fixture.expect, 'ok');

  const records = fixture.records.map(toLunumRecord);
  const index = buildSemanticGroupIndex(records, schema);

  assert.equal(index.groups.size, 1);
  assert.equal(index.suspectGroups.size, 0);
  const group = index.groups.get('greet-1');
  assert.ok(group);
  assert.equal(group!.size, 4);
  for (const lang of ['en', 'el', 'es', 'id']) {
    assert.ok(group!.has(lang), `expected a ${lang} member in the positive fixture group`);
  }
});

test('fixture: negative-forged-group-id.json is rejected with a hard validation error', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('negative-forged-group-id.json');
  assert.equal(fixture.expect, 'error');

  const records = fixture.records.map(toLunumRecord);
  assert.throws(
    () => buildSemanticGroupIndex(records, schema),
    new RegExp(fixture.expectedErrorPattern!)
  );
});

test('fixture: negative-same-language-collision.json is rejected with a hard validation error', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('negative-same-language-collision.json');
  assert.equal(fixture.expect, 'error');

  const records = fixture.records.map(toLunumRecord);
  assert.throws(
    () => buildSemanticGroupIndex(records, schema),
    new RegExp(fixture.expectedErrorPattern!)
  );
});

test('fixture: negative-malformed-group-id.json is rejected with a hard validation error', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('negative-malformed-group-id.json');
  assert.equal(fixture.expect, 'error');

  const records = fixture.records.map(toLunumRecord);
  assert.throws(
    () => buildSemanticGroupIndex(records, schema),
    new RegExp(fixture.expectedErrorPattern!)
  );
});

test('fixture: negative-missing-group-fallback.json ingests OK, missing-group record excluded from group matching', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('negative-missing-group-fallback.json');
  assert.equal(fixture.expect, 'ok');

  const records = fixture.records.map(toLunumRecord);
  const index = buildSemanticGroupIndex(records, schema);

  // .find() by fingerprint locates the object reference to test identity-
  // based membership with -- fingerprint is fine to READ here, it's only
  // unsafe to use AS the index's map/set key (see semantic-group-matching.ts).
  const missingEn = records.find((r) => r.fingerprint === 'sgfx:neg:missing-en-1')!;
  const missingEs = records.find((r) => r.fingerprint === 'sgfx:neg:missing-es-1')!;

  // The ungrouped EN record must not appear in any group.
  assert.ok(index.ungroupedRecords.has(missingEn));
  assert.equal(index.recordGroupId.has(missingEn), false);

  // The grouped ES record with no EN peer forms a (partial) group entry --
  // it is still a real, schema-valid group membership on its own.
  assert.ok(index.recordGroupId.has(missingEs));
});

test('fixture: negative-structural-mismatch.json flags the group as suspect and excludes it', async () => {
  const schema = await loadSchema();
  const fixture = await loadFixture('negative-structural-mismatch.json');
  assert.equal(fixture.expect, 'suspect');

  const records = fixture.records.map(toLunumRecord);
  const index = buildSemanticGroupIndex(records, schema);

  const mismatchEn = records.find((r) => r.fingerprint === 'sgfx:neg:mismatch-en-1')!;
  const mismatchEs = records.find((r) => r.fingerprint === 'sgfx:neg:mismatch-es-1')!;

  assert.equal(index.groups.has(fixture.expectedSuspectGroupId!), false);
  assert.ok(index.suspectGroups.has(fixture.expectedSuspectGroupId!));
  assert.ok(index.ungroupedRecords.has(mismatchEn));
  assert.ok(index.ungroupedRecords.has(mismatchEs));
});
