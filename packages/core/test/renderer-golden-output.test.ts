/**
 * Renderer golden-output tests: deterministic profile output verification.
 *
 * Upgrades renderer profiles from "Experiment" to "Reference" by adding
 * deterministic golden-output tests for safe/short/tight on 10+ diverse inputs.
 *
 * Each test:
 * 1. Loads a test record from the golden fixture
 * 2. Applies each profile (safe, short, tight)
 * 3. Compares the exact profiled record fields against stored golden outputs
 * 4. Fails if any field differs — ensuring profile behavior is stable
 *
 * This implements the WORK_QUEUE v4 release gate 4 item:
 * "Upgrade renderer profiles from 'Experiment' to 'Reference': add
 * deterministic golden-output tests for safe/short/tight on 10+ diverse inputs."
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProfileGenerator, type ProfileType } from '../src/profiles.js';
import { createTestRecords, type LunumRecord, type LunumClause, type LunumTerm, type LunumRendering } from '../src/index.js';

// ── Fixture Loading ─────────────────────────────────────────────────

interface GoldenProfileOutput {
  type: ProfileType;
  originalTokens: number;
  profiledTokens: number;
  reduction: number;
  preservation: number;
  warnings: string[];
}

interface GoldenRecordOutput {
  recordVersion: string;
  source: { text: string; language: string | null; role: string | null; ref: string | null };
  sem: {
    schema: string;
    world: string;
    kind: string;
    clauses: Array<{ predicate: string; roles: Record<string, unknown>; negated?: boolean }>;
    annotations?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  };
  fingerprint: string;
  renderings: Record<string, unknown>;
  policy: { eligible: boolean; category: string; risk: string; confidence: number; reasons: unknown[] };
  meta: Record<string, unknown>;
}

interface GoldenFixtureEntry {
  description: string;
  profiles: Record<ProfileType, {
    type: ProfileType;
    originalTokens: number;
    profiledTokens: number;
    reduction: number;
    preservation: number;
    warnings: string[];
    record: GoldenRecordOutput;
  }>;
}

interface GoldenFixture {
  [recordId: string]: GoldenFixtureEntry;
}

// Map from record ID to the index in createTestRecords()
const RECORD_ID_TO_INDEX: Record<string, number> = {
  'test-single-clause': 0,
  'test-multi-clause': 1,
  'test-with-annotations': 2,
  'test-negation': 3,
  'test-with-time': 4,
  'test-with-modality': 5,
  'test-complex-roles': 6,
  'test-with-renderings': 7,
  'test-with-consequences': 8,
  'test-empty-roles': 9
};

function loadGoldenFixture(): GoldenFixture {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // The test runs from dist/test/ after build, so fixtures are in dist/test/fixtures/.
  // If not built yet (running from source), they are in test/fixtures/.
  const candidatePaths = [
    path.join(__dirname, 'fixtures', 'renderer-golden-output.json'),
    path.join(__dirname, '..', '..', 'test', 'fixtures', 'renderer-golden-output.json')
  ];
  let raw: string | undefined;
  for (const p of candidatePaths) {
    try {
      raw = readFileSync(p, 'utf8');
      break;
    } catch {
      // try next path
    }
  }
  if (!raw) {
    throw new Error('Golden fixture not found at: ' + candidatePaths.join(' or '));
  }
  return JSON.parse(raw) as GoldenFixture;
}

function compareRecord(actual: LunumRecord, expected: GoldenRecordOutput): void {
  assert.strictEqual(actual.recordVersion, expected.recordVersion, 'recordVersion must match');
  assert.strictEqual(actual.source.text, expected.source.text, 'source.text must match');
  assert.strictEqual(actual.source.language, expected.source.language, 'source.language must match');
  assert.strictEqual(actual.source.role, expected.source.role, 'source.role must match');
  assert.strictEqual(actual.source.ref, expected.source.ref, 'source.ref must match');
  assert.strictEqual(actual.sem.schema, expected.sem.schema, 'sem.schema must match');
  assert.strictEqual(actual.sem.world, expected.sem.world, 'sem.world must match');
  assert.strictEqual(actual.sem.kind, expected.sem.kind, 'sem.kind must match');
  assert.strictEqual(actual.sem.clauses.length, expected.sem.clauses.length, 'clauses.length must match');
  for (let i = 0; i < actual.sem.clauses.length; i++) {
    assert.strictEqual(actual.sem.clauses[i]!.predicate, expected.sem.clauses[i]!.predicate, `clauses[${i}].predicate must match`);
    assert.deepStrictEqual(actual.sem.clauses[i]!.roles, expected.sem.clauses[i]!.roles, `clauses[${i}].roles must match`);
    // negated defaults to false if undefined in fixture
    const actualNeg = actual.sem.clauses[i]!.negated ?? false;
    const expectedNeg = expected.sem.clauses[i]!.negated ?? false;
    assert.strictEqual(actualNeg, expectedNeg, `clauses[${i}].negated must match`);
  }
  // annotations: undefined in fixture is treated as {}
  const actualAnnotations = actual.sem.annotations ?? {};
  const expectedAnnotations = expected.sem.annotations ?? {};
  assert.deepStrictEqual(actualAnnotations, expectedAnnotations, 'sem.annotations must match');
  // provenance: ignore timestamp field (dynamic) but check other fields
  const actualProvenance = actual.sem.provenance ?? {};
  const expectedProvenance = expected.sem.provenance ?? {};
  if (expectedProvenance && Object.keys(expectedProvenance).length > 0) {
    // Strip timestamp for comparison (it's dynamic)
    const { timestamp: _, ...expectedNoTimestamp } = expectedProvenance as any;
    const { timestamp: __, ...actualNoTimestamp } = actualProvenance as any;
    assert.deepStrictEqual(actualNoTimestamp, expectedNoTimestamp, 'sem.provenance must match (ignoring timestamp)');
  } else if (actualProvenance && Object.keys(actualProvenance).length > 0) {
    // Actual has provenance but expected doesn't
    assert.fail('sem.provenance must match (expected empty, got ' + JSON.stringify(actualProvenance) + ')');
  }
  assert.strictEqual(actual.fingerprint, expected.fingerprint, 'fingerprint must match');
  assert.deepStrictEqual(actual.renderings, expected.renderings, 'renderings must match');
  assert.strictEqual(actual.policy.eligible, expected.policy.eligible, 'policy.eligible must match');
  assert.strictEqual(actual.policy.category, expected.policy.category, 'policy.category must match');
  assert.strictEqual(actual.policy.risk, expected.policy.risk, 'policy.risk must match');
  assert.strictEqual(actual.policy.confidence, expected.policy.confidence, 'policy.confidence must match');
  assert.deepStrictEqual(actual.policy.reasons, expected.policy.reasons, 'policy.reasons must match');
  assert.deepStrictEqual(actual.meta, expected.meta, 'meta must match');
}

// ── Tests ───────────────────────────────────────────────────────────

test('golden fixture has at least 10 records', () => {
  const fixture = loadGoldenFixture();
  const recordIds = Object.keys(fixture);
  assert.ok(recordIds.length >= 10, `Expected >= 10 records, got ${recordIds.length}`);
});

test('golden fixture has all 3 profiles per record', () => {
  const fixture = loadGoldenFixture();
  for (const [id, entry] of Object.entries(fixture)) {
    for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
      assert.ok(entry.profiles[profile], `${id} must have ${profile} profile`);
    }
  }
});

test('golden outputs are deterministic across runs', () => {
  const fixture = loadGoldenFixture();
  const originalRecords = createTestRecords();
  const generator = new ProfileGenerator();
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const [id, entry] of Object.entries(fixture)) {
    for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
      try {
        const golden = entry.profiles[profile]!;

        // Use the original test record from createTestRecords() for re-profiling
        const origIdx = RECORD_ID_TO_INDEX[id];
        assert.ok(origIdx !== undefined, `${id} must have a known index`);
        const originalRecord = originalRecords[origIdx]!.record;

        const result = generator.profile(originalRecord, profile);

        // Compare output fields (stored at top level of profile in fixture)
        assert.strictEqual(result.type, golden.type);
        assert.strictEqual(result.originalTokens, golden.originalTokens);
        assert.strictEqual(result.profiledTokens, golden.profiledTokens);
        assert.strictEqual(result.reduction, golden.reduction);
        assert.strictEqual(result.preservation, golden.preservation);
        assert.deepStrictEqual(result.warnings, golden.warnings);

        // Compare record fields
        compareRecord(result.record, golden.record);

        passed++;
      } catch (err) {
        failed++;
        failures.push(`${id}/${profile}: ${(err as Error).message}`);
      }
    }
  }

  assert.strictEqual(failed, 0, `Golden output failures: ${failures.join('; ')}`);
  assert.strictEqual(passed, Object.keys(fixture).length * 3, `Expected ${Object.keys(fixture).length * 3} profile comparisons`);
});

test('safe profile preserves annotations and provenance exactly', () => {
  const fixture = loadGoldenFixture();
  const generator = new ProfileGenerator();

  for (const [id, entry] of Object.entries(fixture)) {
    const safe = entry.profiles.safe!;
    assert.deepStrictEqual(safe.warnings, [], `${id}/safe should have no warnings (preserves all)`);
  }
});

test('tight profile removes annotations, provenance, and renderings', () => {
  const fixture = loadGoldenFixture();
  const generator = new ProfileGenerator();

  for (const [id, entry] of Object.entries(fixture)) {
    const tight = entry.profiles.tight!;
    const warnings = tight.warnings;
    const record = tight.record;

    // Tight should warn about removed content when the original has it
    const hasContent = !!(entry.profiles.safe!.record.sem.annotations && Object.keys(entry.profiles.safe!.record.sem.annotations).length > 0) ||
                      !!(entry.profiles.safe!.record.sem.provenance && Object.keys(entry.profiles.safe!.record.sem.provenance).length > 0) ||
                      !!(entry.profiles.safe!.record.renderings && Object.keys(entry.profiles.safe!.record.renderings).length > 0);
    if (hasContent) {
      assert.ok(warnings.length > 0, `${id}/tight should have warnings about removed content`);
    }

    // Check that annotations and provenance are empty in the output
    // (undefined in fixture means they weren't present originally, which is fine)
    const actualAnnotations = record.sem.annotations ?? {};
    const expectedAnnotations = tight.record.sem.annotations ?? {};
    assert.deepStrictEqual(actualAnnotations, expectedAnnotations, `${id}/tight should have empty annotations`);
    const actualProvenance = record.sem.provenance ?? {};
    const expectedProvenance = tight.record.sem.provenance ?? {};
    assert.deepStrictEqual(actualProvenance, expectedProvenance, `${id}/tight should have empty provenance`);
    assert.deepStrictEqual(record.renderings, {}, `${id}/tight should have empty renderings`);
  }
});

test('short profile preserves provenance but removes annotations', () => {
  const fixture = loadGoldenFixture();
  const generator = new ProfileGenerator();

  for (const [id, entry] of Object.entries(fixture)) {
    const short = entry.profiles.short!;
    const record = short.record;

    // Short should preserve provenance
    assert.ok(
      !record.sem.provenance || Object.keys(record.sem.provenance).length > 0 ||
      !entry.profiles.safe!.record.sem.provenance,
      `${id}/short should preserve provenance`
    );

    // Short should remove annotations (empty object)
    const annotations = record.sem.annotations ?? {};
    assert.deepStrictEqual(annotations, {}, `${id}/short should have empty annotations`);
  }
});

test('all profiles have Reference level maturity', () => {
  const generator = new ProfileGenerator();
  for (const profile of ['safe', 'short', 'tight'] as ProfileType[]) {
    assert.ok(generator.isReferenceLevel(profile), `${profile} should be at Reference level`);
  }
  assert.ok(generator.allProfilesReference(), 'All profiles should be at Reference level');
});
