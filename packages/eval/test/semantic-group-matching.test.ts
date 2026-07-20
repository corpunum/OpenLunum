/**
 * Tests for semantic-group-based cross-lingual matching (issue #256).
 *
 * Covers the maintainer's acceptance conditions:
 *  - positive multilingual parallel-group fixtures across EN/EL/ES/ID
 *  - forged/unknown group id -> hard validation error
 *  - same-language collision -> hard validation error
 *  - missing group id -> excluded from group matching, fingerprint fallback applies
 *  - malformed group id -> hard validation error
 *  - structural mismatch (extra clause) between "equivalent" items -> caught, not silently accepted
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';
import type { LunumRecord } from '@corpunum/lunum';
import {
  buildSemanticGroupIndex,
  extractGroupId,
  matchSemanticGroupOrFingerprint,
  type SemanticGroupSchema
} from '../src/semantic-group-matching.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeRecord(
  lang: string,
  text: string,
  fingerprint: string,
  options: {
    groupId?: unknown;
    roles?: Record<string, unknown>;
    predicate?: string;
    extraClause?: boolean;
    negated?: boolean;
    modality?: string | null;
  } = {}
): LunumRecord {
  const clauses: any[] = [{
    predicate: options.predicate ?? 'greet',
    roles: options.roles ?? { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'welcome' } },
    negated: options.negated ?? false,
    ...(options.modality !== undefined ? { modality: options.modality } : {})
  }];
  if (options.extraClause) {
    clauses.push({
      predicate: 'warn',
      roles: { agent: { type: 'actor', id: 'speaker' }, theme: { type: 'concept', id: 'danger' } },
      negated: false
    });
  }

  const annotations: Record<string, unknown> | undefined =
    'groupId' in options ? { semanticGroupId: options.groupId } : undefined;

  return {
    recordVersion: 'lunum-record/0.1-draft' as const,
    source: { text, language: lang, role: null, ref: null },
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses,
      ...(annotations ? { annotations } : {})
    },
    fingerprint,
    renderings: {},
    policy: { eligible: true, category: 'test', risk: 'low' as const, confidence: 0.9, reasons: ['test'] },
    meta: {}
  };
}

const FOUR_LANG_SCHEMA: SemanticGroupSchema = [
  { groupId: 'greet-1', languages: ['en', 'el', 'es', 'id'] }
];

// ── extractGroupId ───────────────────────────────────────────────────

test('extractGroupId: returns undefined when no annotation is present', () => {
  const record = makeRecord('en', 'Hello', 'fp-en-1');
  assert.equal(extractGroupId(record), undefined);
});

test('extractGroupId: returns the group id when present and well-formed', () => {
  const record = makeRecord('en', 'Hello', 'fp-en-1', { groupId: 'greet-1' });
  assert.equal(extractGroupId(record), 'greet-1');
});

test('extractGroupId: throws on non-string group id', () => {
  const record = makeRecord('en', 'Hello', 'fp-en-1', { groupId: 42 });
  assert.throws(() => extractGroupId(record), /Malformed semantic group id/);
});

test('extractGroupId: throws on empty-string group id', () => {
  const record = makeRecord('en', 'Hello', 'fp-en-1', { groupId: '' });
  assert.throws(() => extractGroupId(record), /Malformed semantic group id/);
});

// ── buildSemanticGroupIndex: positive case ──────────────────────────

test('positive fixture: 4-language parallel group (EN/EL/ES/ID) indexes cleanly', () => {
  const en = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  const el = makeRecord('el', 'Γεια σου, καλώς όρισες!', 'fp-el-1', { groupId: 'greet-1' });
  const es = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  const id = makeRecord('id', 'Halo, selamat datang!', 'fp-id-1', { groupId: 'greet-1' });
  const records = [en, el, es, id];

  const index = buildSemanticGroupIndex(records, FOUR_LANG_SCHEMA);

  assert.equal(index.groups.size, 1);
  assert.equal(index.suspectGroups.size, 0);
  assert.equal(index.ungroupedRecords.size, 0);

  const group = index.groups.get('greet-1');
  assert.ok(group);
  assert.equal(group!.size, 4);
  for (const lang of ['en', 'el', 'es', 'id']) {
    assert.ok(group!.has(lang), `expected member in ${lang}`);
  }

  for (const record of records) {
    assert.equal(index.recordGroupId.get(record), 'greet-1');
  }
});

test('positive fixture: group-based matching reports two members of the same valid group as matched', () => {
  const en = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  const es = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  const el = makeRecord('el', 'Γεια σου, καλώς όρισες!', 'fp-el-1', { groupId: 'greet-1' });
  const id = makeRecord('id', 'Halo, selamat datang!', 'fp-id-1', { groupId: 'greet-1' });

  const index = buildSemanticGroupIndex([en, es, el, id], FOUR_LANG_SCHEMA);

  const result = matchSemanticGroupOrFingerprint(en, es, index);
  assert.equal(result.method, 'group');
  assert.equal(result.matched, true);
  assert.equal(result.groupId, 'greet-1');
});

// ── Negative: forged / unknown group id ─────────────────────────────

test('negative: unknown/forged group id is a hard validation error', () => {
  const records = [
    makeRecord('en', 'Hello', 'fp-en-1', { groupId: 'this-group-does-not-exist-in-schema' })
  ];

  assert.throws(
    () => buildSemanticGroupIndex(records, FOUR_LANG_SCHEMA),
    /Unknown semantic group id/
  );
});

// ── Negative: same-language collision ───────────────────────────────

test('negative: two EN items claiming the same group id is a hard validation error', () => {
  const records = [
    makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' }),
    makeRecord('en', 'A completely different EN item', 'fp-en-2', { groupId: 'greet-1' }),
    makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' })
  ];

  assert.throws(
    () => buildSemanticGroupIndex(records, FOUR_LANG_SCHEMA),
    /Duplicate semantic group membership/
  );
});

// ── Negative: malformed group id ────────────────────────────────────

test('negative: malformed group id (wrong type) is a hard validation error at ingest', () => {
  const records = [
    makeRecord('en', 'Hello', 'fp-en-1', { groupId: 123 })
  ];

  assert.throws(
    () => buildSemanticGroupIndex(records, FOUR_LANG_SCHEMA),
    /Malformed semantic group id/
  );
});

test('negative: malformed group id (empty string) is a hard validation error at ingest', () => {
  const records = [
    makeRecord('en', 'Hello', 'fp-en-1', { groupId: '' })
  ];

  assert.throws(
    () => buildSemanticGroupIndex(records, FOUR_LANG_SCHEMA),
    /Malformed semantic group id/
  );
});

test('negative: wrong-language membership (language not declared for group) is a hard validation error', () => {
  const schema: SemanticGroupSchema = [{ groupId: 'greet-1', languages: ['en', 'es'] }];
  const records = [
    makeRecord('en', 'Hello', 'fp-en-1', { groupId: 'greet-1' }),
    makeRecord('fr', 'Bonjour', 'fp-fr-1', { groupId: 'greet-1' })
  ];

  assert.throws(
    () => buildSemanticGroupIndex(records, schema),
    /language "fr" is not one of the languages declared/
  );
});

// ── Negative: missing group id -> fingerprint fallback ──────────────

test('negative/fallback: record with no group id is excluded from group matching and falls back to fingerprint matching', () => {
  const grouped = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  const otherGrouped = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  const ungrouped = makeRecord('en', 'Hello, welcome!', 'fp-en-2'); // no groupId at all

  const index = buildSemanticGroupIndex([grouped, otherGrouped, ungrouped], FOUR_LANG_SCHEMA);

  assert.ok(index.ungroupedRecords.has(ungrouped));
  assert.equal(index.recordGroupId.has(ungrouped), false);

  // Matching an ungrouped record against a grouped one must fall back to
  // fingerprint comparison rather than erroring or silently joining the group.
  const result = matchSemanticGroupOrFingerprint(ungrouped, grouped, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(typeof result.fingerprintSimilarity, 'number');
  // Same structure/content -> fingerprint fallback still finds them equivalent.
  assert.equal(result.matched, true);
});

test('negative/fallback: two fully ungrouped records still match via existing fingerprint matching', () => {
  const a = makeRecord('en', 'Hello, welcome!', 'fp-a');
  const b = makeRecord('es', '¡Hola, bienvenido!', 'fp-b');

  const index = buildSemanticGroupIndex([a, b], FOUR_LANG_SCHEMA);
  assert.equal(index.groups.size, 0);
  assert.equal(index.ungroupedRecords.size, 2);

  const result = matchSemanticGroupOrFingerprint(a, b, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, true);
});

test('negative/fallback: fingerprint matching still correctly rejects genuinely different ungrouped records', () => {
  const a = makeRecord('en', 'Hello, welcome!', 'fp-a');
  const b = makeRecord('es', 'El gato corre en el jardín', 'fp-b', { predicate: 'run', roles: { agent: { type: 'actor', id: 'cat' } } });

  const index = buildSemanticGroupIndex([a, b], FOUR_LANG_SCHEMA);
  const result = matchSemanticGroupOrFingerprint(a, b, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, false);
});

// ── Regression: fingerprint is not a safe record-identity key ──────
// (maintainer finding, issue #256 review, 2026-07-21: recordGroupId was
// previously keyed by record.fingerprint, which is an identity of MEANING
// not of the dataset record. A grouped record and an ungrouped record
// that happen to share an exact fingerprint must not cross-contaminate --
// the ungrouped one must still correctly fall back to fingerprint
// matching and must never be reported as belonging to the other's group.)

test('regression: grouped and ungrouped records sharing an exact fingerprint do not cross-contaminate', () => {
  const SHARED_FP = 'fp-shared-collision';

  const groupedEn = makeRecord('en', 'Hello, welcome!', SHARED_FP, { groupId: 'greet-1' });
  const groupedEs = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  // Deliberately shares groupedEn's exact fingerprint string, but has NO
  // group annotation and is a structurally different item -- this is the
  // scenario a fingerprint-keyed map would get wrong.
  const ungroupedSameFp = makeRecord('id', 'Halo, selamat datang!', SHARED_FP);

  const index = buildSemanticGroupIndex([groupedEn, groupedEs, ungroupedSameFp], FOUR_LANG_SCHEMA);

  // groupedEn resolves to its real group.
  assert.equal(index.recordGroupId.get(groupedEn), 'greet-1');
  assert.equal(index.ungroupedRecords.has(groupedEn), false);

  // ungroupedSameFp must NOT inherit groupedEn's group membership merely
  // because they share a fingerprint string -- it has no group id of its
  // own and must be treated as ungrouped.
  assert.equal(index.recordGroupId.has(ungroupedSameFp), false);
  assert.ok(index.ungroupedRecords.has(ungroupedSameFp));

  // Matching ungroupedSameFp against the real group member must use the
  // fingerprint fallback, not silently resolve as a group match via the
  // shared fingerprint string.
  const result = matchSemanticGroupOrFingerprint(ungroupedSameFp, groupedEn, index);
  assert.equal(result.method, 'fingerprint');
  assert.notEqual(result.groupId, 'greet-1');
});

test('regression: two independently curated groups sharing an exact fingerprint on one member each do not overwrite each other', () => {
  const SHARED_FP = 'fp-shared-collision-2';
  const schema: SemanticGroupSchema = [
    { groupId: 'greet-1', languages: ['en', 'es'] },
    { groupId: 'farewell-1', languages: ['en', 'es'] }
  ];

  // Two members of DIFFERENT groups happen to share a fingerprint string
  // (e.g. a generator collision or coincidentally identical structure).
  const greetEn = makeRecord('en', 'Hello, welcome!', SHARED_FP, { groupId: 'greet-1' });
  const greetEs = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-greet', { groupId: 'greet-1' });
  const farewellEn = makeRecord('en', 'Goodbye!', SHARED_FP, { groupId: 'farewell-1' });
  const farewellEs = makeRecord('es', '¡Adiós!', 'fp-es-farewell', { groupId: 'farewell-1' });

  const index = buildSemanticGroupIndex([greetEn, greetEs, farewellEn, farewellEs], schema);

  // A fingerprint-keyed reverse map would have the second insert
  // (farewellEn) silently overwrite the first (greetEn)'s entry, since
  // both use SHARED_FP as the key. Object-identity keying keeps them
  // distinct even though they share a fingerprint string.
  assert.equal(index.recordGroupId.get(greetEn), 'greet-1');
  assert.equal(index.recordGroupId.get(farewellEn), 'farewell-1');
});

// ── Negative: structural mismatch ("wrong-language membership") ────

test('negative: extra/mismatched clause between "equivalent" items is caught (group flagged suspect, excluded)', () => {
  const en = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  // es has an extra clause not present in en -- structurally different despite sharing a group id.
  const esMismatched = makeRecord('es', '¡Hola, bienvenido! Cuidado.', 'fp-es-1', {
    groupId: 'greet-1',
    extraClause: true
  });

  const index = buildSemanticGroupIndex([en, esMismatched], FOUR_LANG_SCHEMA);

  // The group must NOT be trusted for group-based matching.
  assert.equal(index.groups.has('greet-1'), false);
  assert.ok(index.suspectGroups.has('greet-1'));
  assert.ok(index.suspectGroups.get('greet-1')!.reasons.length > 0);

  // Both members fall back to individual fingerprint matching instead of
  // being silently treated as equivalent because they share a group id.
  assert.ok(index.ungroupedRecords.has(en));
  assert.ok(index.ungroupedRecords.has(esMismatched));

  const result = matchSemanticGroupOrFingerprint(en, esMismatched, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, false, 'structurally mismatched records must not be reported as matching');
});

// ── Negative: structural mismatch mutations (negation / modality / role) ──
// (maintainer finding, issue #256 review, 2026-07-21: the required negative
// matrix also covers negation, modality, and role mutations, not just an
// extra clause. Each of these genuinely changes the hard structural
// signature or weighted similarity score in NearSemanticFingerprintGenerator
// -- see packages/core/src/near-semantic-fingerprints.ts clauseShape(),
// which includes `negated`/`modality` directly, and the weighted role-term
// features used for the soft similarity score.)

test('negative mutation: negation differs between "equivalent" items -> group flagged suspect', () => {
  const en = makeRecord('en', 'The assistant will delete the file', 'fp-en-1', { groupId: 'greet-1', predicate: 'delete', negated: false });
  const es = makeRecord('es', 'El asistente no eliminará el archivo', 'fp-es-1', { groupId: 'greet-1', predicate: 'delete', negated: true });

  const index = buildSemanticGroupIndex([en, es], FOUR_LANG_SCHEMA);

  assert.equal(index.groups.has('greet-1'), false, 'a negation mismatch must not be trusted as a valid parallel group');
  assert.ok(index.suspectGroups.has('greet-1'));
  assert.ok(index.ungroupedRecords.has(en));
  assert.ok(index.ungroupedRecords.has(es));

  const result = matchSemanticGroupOrFingerprint(en, es, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, false, 'negated vs non-negated must not be reported as matching');
});

test('negative mutation: modality differs between "equivalent" items -> group flagged suspect', () => {
  const en = makeRecord('en', 'The assistant must delete the file', 'fp-en-1', { groupId: 'greet-1', predicate: 'delete', modality: 'obligation' });
  const es = makeRecord('es', 'El asistente podría eliminar el archivo', 'fp-es-1', { groupId: 'greet-1', predicate: 'delete', modality: 'possibility' });

  const index = buildSemanticGroupIndex([en, es], FOUR_LANG_SCHEMA);

  assert.equal(index.groups.has('greet-1'), false, 'an obligation-vs-possibility modality mismatch must not be trusted as a valid parallel group');
  assert.ok(index.suspectGroups.has('greet-1'));

  const result = matchSemanticGroupOrFingerprint(en, es, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, false, 'differing modality must not be reported as matching');
});

test('negative mutation: role content differs between "equivalent" items -> group flagged suspect', () => {
  // NOTE on threshold sensitivity (measured, not assumed): a single role
  // value differing while everything else matches (e.g. only the theme:
  // concise_answers -> detailed_answers) produces similarity ~0.8095,
  // which is ABOVE the module's default 0.8 threshold and would NOT be
  // flagged as suspect. That is a genuine, disclosed limitation of the
  // current weighted-feature scoring at the default threshold, not
  // something this test papers over -- it means a translation error that
  // changes exactly one role value has a real chance of silently passing
  // structural cross-validation. Flagged for the independent evaluator;
  // not fixed here since changing the default threshold or the scoring
  // weights is a broader calibration decision outside the scope of the
  // reported bug (fingerprint-as-map-key).
  //
  // This test instead uses a case that IS reliably caught: BOTH the agent
  // and the theme differ (measured similarity ~0.652), which is a more
  // realistic "wrong item entirely" mistranslation than a single-field slip.
  const en = makeRecord('en', 'The user prefers concise answers', 'fp-en-1', {
    groupId: 'greet-1',
    predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }
  });
  const es = makeRecord('es', 'El administrador prefiere respuestas detalladas', 'fp-es-1', {
    groupId: 'greet-1',
    predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'admin' }, theme: { type: 'concept', id: 'detailed_answers' } }
  });

  const index = buildSemanticGroupIndex([en, es], FOUR_LANG_SCHEMA);

  assert.equal(index.groups.has('greet-1'), false, 'a different agent AND theme must not be trusted as a valid parallel group');
  assert.ok(index.suspectGroups.has('greet-1'));

  const result = matchSemanticGroupOrFingerprint(en, es, index);
  assert.equal(result.method, 'fingerprint');
  assert.equal(result.matched, false, 'a genuinely different role value must not be reported as matching');
});

test('KNOWN LIMITATION (documented, not fixed here): a single differing role value at default threshold can pass structural cross-validation', () => {
  // Same scenario as the note above, asserted explicitly so this
  // limitation is a visible, tracked test rather than a comment that can
  // silently go stale. If this test starts failing because someone
  // tightens the default threshold or scoring, that is a welcome change
  // -- update/remove this test rather than treating the failure as a
  // regression.
  const en = makeRecord('en', 'The user prefers concise answers', 'fp-en-1', {
    groupId: 'greet-1',
    predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }
  });
  const es = makeRecord('es', 'El usuario prefiere respuestas detalladas', 'fp-es-1', {
    groupId: 'greet-1',
    predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'detailed_answers' } }
  });

  const index = buildSemanticGroupIndex([en, es], FOUR_LANG_SCHEMA);

  // Documents actual current behavior: this group is NOT flagged suspect
  // despite "concise" vs "detailed" being genuinely different preferences.
  assert.ok(index.groups.has('greet-1'), 'documents: single-role-difference currently passes at the default 0.8 threshold');
});

// ── Schema validation itself ────────────────────────────────────────

test('schema validation: rejects a schema with duplicate group ids', () => {
  const badSchema: SemanticGroupSchema = [
    { groupId: 'dup', languages: ['en', 'es'] },
    { groupId: 'dup', languages: ['en', 'el'] }
  ];
  assert.throws(() => buildSemanticGroupIndex([], badSchema), /duplicate groupId/);
});

test('schema validation: rejects a group definition with fewer than 2 languages', () => {
  const badSchema: SemanticGroupSchema = [{ groupId: 'lonely', languages: ['en'] }];
  assert.throws(() => buildSemanticGroupIndex([], badSchema), /at least 2 languages/);
});

test('schema validation: rejects a group definition with duplicate languages', () => {
  const badSchema: SemanticGroupSchema = [{ groupId: 'dup-lang', languages: ['en', 'en', 'es'] }];
  assert.throws(() => buildSemanticGroupIndex([], badSchema), /duplicate languages/);
});

// ── Dataset-only scope: no runtime/model-output derivation ─────────

test('scope: matching never accepts a caller-supplied group id that bypasses the validated index', () => {
  // Simulate what a "runtime-derived" group id from model output would look
  // like: a record whose group id was never validated against the schema
  // (i.e. never passed through buildSemanticGroupIndex). Because
  // matchSemanticGroupOrFingerprint only consults index.recordGroupId (built
  // exclusively by ingest-time validation), such a record is correctly
  // treated as ungrouped and routed to the fingerprint fallback -- there is
  // no path for an unvalidated group claim to influence matching.
  const validated = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  const validatedPeer = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  const index = buildSemanticGroupIndex([validated, validatedPeer], FOUR_LANG_SCHEMA);

  const unvalidatedClaim = makeRecord('id', 'Halo, selamat datang!', 'fp-id-unvalidated', { groupId: 'greet-1' });
  // Note: unvalidatedClaim was never passed to buildSemanticGroupIndex.
  const result = matchSemanticGroupOrFingerprint(validated, unvalidatedClaim, index);
  assert.equal(result.method, 'fingerprint', 'an unvalidated group claim must not enable group-based matching');
});

// ── Fingerprint fallback stays secondary, not combined ──────────────

test('fingerprint fallback stays secondary: valid-group pair uses group method even when a custom generator is supplied', () => {
  const en = makeRecord('en', 'Hello, welcome!', 'fp-en-1', { groupId: 'greet-1' });
  const es = makeRecord('es', '¡Hola, bienvenido!', 'fp-es-1', { groupId: 'greet-1' });
  const index = buildSemanticGroupIndex([en, es], FOUR_LANG_SCHEMA);

  // Even with a generator tuned to disagree (impossibly strict threshold),
  // the group path is used exclusively once both sides carry a valid group id.
  const strictGenerator = new NearSemanticFingerprintGenerator(1);
  const result = matchSemanticGroupOrFingerprint(en, es, index, strictGenerator);
  assert.equal(result.method, 'group');
  assert.equal(result.matched, true);
  assert.equal(result.fingerprintSimilarity, undefined);
});
