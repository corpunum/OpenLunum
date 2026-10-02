import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecord } from '../src/derive.js';
import { checkLiteralRetention, datesInText, numbersInText } from '../src/literal-retention.js';
import { submitCandidate } from '../src/agent-native.js';
import { semanticFingerprint } from '../src/fingerprint.js';
import type { LunumSem } from '../src/types.js';

const provenance = { extractorType: 'agent' as const, extractorId: 'date-retention-development-test' };

function sem(clauses: LunumSem['clauses'], references?: LunumSem['references']): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'event',
    clauses,
    ...(references ? { references } : {}),
  };
}

function deadline(dateValue: string, extra: LunumSem['clauses'] = []): LunumSem {
  return sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: { type: 'date', value: dateValue } }, negated: false },
    ...extra,
  ]);
}

test('datesInText normalizes valid ISO and unambiguous dotted dates only', () => {
  assert.deepEqual(datesInText('Deadline 2026-11-30; review by 30.11.2026.'), ['2026-11-30', '2026-11-30']);
  assert.deepEqual(datesInText('2024-02-29 and 29.02.2024'), ['2024-02-29', '2024-02-29']);
  assert.deepEqual(datesInText('2023-02-29 31.04.2026 31.11.2026 30.02.2024'), []);
  // A day at or below 12 is ambiguous in dotted notation and stays unnormalized.
  assert.deepEqual(datesInText('04.05.2026 12.11.2026 11.12.2026'), []);
  assert.deepEqual(datesInText('30.11'), []);
});

test('date tokens use Unicode letter and number boundaries', () => {
  assert.deepEqual(datesInText('(2026-04-13), [13.04.2026]'), ['2026-04-13', '2026-04-13']);
  assert.deepEqual(datesInText('π2026-04-13 2026-04-13β 9x2026-04-13 2026-04-13٣'), []);
  assert.deepEqual(datesInText('e\u03012026-04-13 2026-04-13\u0301'), []);
  // Thousands grouping and letter-hyphen-digit identifiers are not dates.
  assert.deepEqual(datesInText('1,234 U-31 AC-3'), []);
  assert.deepEqual(numbersInText('under 5,000 euros; user U-31; 2.000,5'), [5000, 2000.5]);
});

test('dotted date normalization is exact and does not turn a decimal into a date', () => {
  const equivalent = checkLiteralRetention('Orion is due by 30.11.2026.', deadline('2026-11-30'));
  assert.equal(equivalent.retained, true);
  assert.deepEqual(equivalent.sourceDates, ['2026-11-30']);
  assert.deepEqual(equivalent.missingDates, []);
  assert.deepEqual(equivalent.sourceNumbers, []);

  const decimal = checkLiteralRetention('Keep the threshold at 30.11.', sem([
    { predicate: 'above', roles: { subject: 'metric', value: { type: 'quantity', value: 30.11, unit: 'units' } } },
  ]));
  assert.equal(decimal.retained, true);
  assert.deepEqual(decimal.sourceDates, []);
  assert.deepEqual(decimal.sourceNumbers, [30.11]);

  const decimalCannotStandForDate = checkLiteralRetention('Orion is due by 30.11.2026.', sem([
    { predicate: 'deadline', roles: { subject: 'Orion', time: { type: 'text', value: '30.11' } } },
  ]));
  assert.equal(decimalCannotStandForDate.retained, false);
  assert.deepEqual(decimalCannotStandForDate.missingDates, ['2026-11-30']);
});

test('date components cannot satisfy a quantity and numeric lookalikes cannot satisfy a date', () => {
  const dateCannotCarryQuantity = checkLiteralRetention('Use 30.11 units for the report.', sem([
    { predicate: 'above', roles: { subject: 'report', value: { type: 'date', value: '30.11.2026' } } },
  ]));
  assert.equal(dateCannotCarryQuantity.retained, false);
  assert.deepEqual(dateCannotCarryQuantity.sourceNumbers, [30.11]);
  assert.deepEqual(dateCannotCarryQuantity.missingNumbers, [30.11]);

  const sameComponentsWrongDate = checkLiteralRetention('Orion is due on 2026-04-13.', deadline('2026-13-04'));
  assert.equal(sameComponentsWrongDate.retained, false);
  assert.deepEqual(sameComponentsWrongDate.sourceDates, ['2026-04-13']);
  assert.deepEqual(sameComponentsWrongDate.missingDates, ['2026-04-13']);
  assert.deepEqual(sameComponentsWrongDate.sourceNumbers, []);

  // Both dates are valid and contain exactly the same numeric values.
  const validSwap = checkLiteralRetention('Orion is due on 2026-04-05.', deadline('2026-05-04'));
  assert.equal(validSwap.retained, false);
  assert.deepEqual(validSwap.missingDates, ['2026-04-05']);
  const separateQuantity = checkLiteralRetention('Orion is due on 2026-04-05 after 5 retries.', deadline('2026-04-05'));
  assert.equal(separateQuantity.retained, false);
  assert.deepEqual(separateQuantity.missingNumbers, [5]);
});

test('dates and literals in nested conditions and consequences are retained', () => {
  const candidate = sem([{
    predicate: 'deadline',
    roles: { subject: { type: 'project', id: 'orion' }, time: { type: 'date', value: '2026-04-13' } },
    conditions: [{
      predicate: 'above',
      roles: { subject: 'CPU usage', value: { type: 'quantity', value: 30.11, unit: 'percent' } },
      consequences: [{
        predicate: 'deadline',
        roles: { subject: 'notification', time: { type: 'date', value: '2026-04-14' } },
      }],
    }],
  }]);
  const result = checkLiteralRetention('Orion is due 2026-04-13 if CPU usage exceeds 30.11 percent; notify on 2026-04-14.', candidate);
  assert.equal(result.retained, true);
  assert.deepEqual(result.sourceDates, ['2026-04-13', '2026-04-14']);
  assert.deepEqual(result.sourceNumbers, [30.11]);
});

test('surface evidence and metadata cannot launder date or numeric literals', () => {
  const evidenceOnly = sem([{
    predicate: 'deadline',
    roles: {
      subject: {
        type: 'text',
        token: '2026-04-13',
        surface: '2026-04-13',
        span: { start: 20, end: 30 },
        provider: 'development-fixture',
        metadata: { value: 7, date: '2026-04-13' },
      },
      time: { type: 'date', token: '2026-04-13', surface: '2026-04-13', provider: 'fixture' },
    },
  }], [{
    referenceKind: 'surface-evidence',
    sourceRef: 'development-source',
    surface: '2026-04-13 7',
    span: { start: 0, end: 13 },
    id: '2026-04-13',
    ref: '7',
    provider: 'fixture',
    metadata: { value: '2026-04-13 7' },
  }]);
  const result = checkLiteralRetention('Orion deadline 2026-04-13; threshold 7.', evidenceOnly);
  assert.equal(result.retained, false);
  assert.deepEqual(result.missingDates, ['2026-04-13']);
  assert.deepEqual(result.missingNumbers, [7]);
});

test('every identity-excluded evidence field cannot rescue omitted date/identifier content', () => {
  const sourceText = 'Orion is due on 2026-04-05 for AC-7.';
  const base = deadline('soon');
  const baseIdentity = semanticFingerprint(base);
  for (const field of ['language', 'token', 'surface', 'span', 'sourceSpan', 'provenance', 'provider', 'metadata']) {
    const candidate = structuredClone(base);
    (candidate.clauses[0]!.roles.subject as Record<string, unknown>)[field] = '2026-04-05 AC-7';
    assert.equal(semanticFingerprint(candidate), baseIdentity, `${field} is not identity`);
    const response = submitCandidate({ sourceText, candidateSem: candidate, provenance });
    assert.equal(response.candidateIdentityAvailable, false, `${field} must not bypass retention`);
    assert.deepEqual(response.literalRetention?.missingDates, ['2026-04-05']);
    assert.deepEqual(response.literalRetention?.missingIdentifiers, ['ac-7']);
  }
});

test('semantic reference id/ref and declared identity-bearing term fields count', () => {
  const candidate = sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: { type: 'date', format: '2026-04-13' } } },
    { predicate: 'above', roles: { subject: 'metric', value: { type: 'quantity', min: 7, max: 7, unit: '7', id: '7' } } },
  ], [
    { referenceKind: 'semantic', id: '2026-04-13', value: 'untrusted-value-is-not-identity' },
    { referenceKind: 'semantic', ref: '7', surface: 'irrelevant evidence' },
  ]);
  const result = checkLiteralRetention('Orion deadline 2026-04-13; threshold 7.', candidate);
  assert.equal(result.retained, true);
  assert.deepEqual(result.missingDates, []);
  assert.deepEqual(result.missingNumbers, []);
});

test('calendar property loop normalizes equivalent forms and rejects harmful swaps', () => {
  for (const year of [2024, 2025, 2026, 2100]) {
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 13; day <= 26; day += 1) {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dotted = `${day}.${String(month).padStart(2, '0')}.${year}`;
        assert.deepEqual(datesInText(dotted), [iso], `dotted normalization for ${dotted}`);
        assert.deepEqual(datesInText(iso), [iso], `ISO normalization for ${iso}`);

        const swapped = `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
        assert.deepEqual(datesInText(swapped), [], `invalid swapped ISO date ${swapped}`);
        assert.deepEqual(
          checkLiteralRetention(iso, deadline(swapped)).missingDates,
          [iso],
          `swapped date must not be rescued by matching numeric components: ${iso} vs ${swapped}`,
        );
      }
    }
  }
});

test('submitCandidate and createRecord retain dates or withhold identity when they are dropped', () => {
  const sourceText = 'Orion is due on 2026-04-13.';
  const retained = submitCandidate({ sourceText, candidateSem: deadline('13.04.2026'), provenance });
  assert.equal(retained.frameValid, true);
  assert.equal(retained.candidateIdentityAvailable, true);
  assert.equal(retained.literalRetention?.retained, true);
  assert.deepEqual(retained.literalRetention?.sourceDates, ['2026-04-13']);
  assert.equal(retained.trust.promoted, false);

  const dropped = submitCandidate({ sourceText, candidateSem: sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: 'soon' } },
  ]), provenance });
  assert.equal(dropped.candidateIdentityAvailable, false);
  assert.equal(dropped.semanticFingerprint, null);
  assert.equal(dropped.failureClass, 'unretained_source_literal');
  assert.deepEqual(dropped.literalRetention?.missingDates, ['2026-04-13']);
  assert.equal(dropped.trust.promoted, false);

  const recordRetained = createRecord({ sem: deadline('2026-04-13'), sourceText });
  assert.ok(recordRetained.semanticFingerprint);
  assert.equal(recordRetained.meta.semanticPromoted, false);
  assert.equal(recordRetained.meta.semanticTrustStatus, 'candidate');
  assert.equal((recordRetained.meta.sourceLiteralRetention as { retained: boolean }).retained, true);

  const recordDropped = createRecord({ sem: sem([
    { predicate: 'deadline', roles: { subject: { type: 'project', id: 'orion' }, time: 'soon' } },
  ]), sourceText });
  assert.equal(recordDropped.semanticFingerprint, undefined);
  assert.equal(recordDropped.meta.semanticPromoted, false);
  assert.equal(recordDropped.meta.semanticTrustStatus, 'candidate');
  assert.deepEqual((recordDropped.meta.sourceLiteralRetention as { missingDates: string[] }).missingDates, ['2026-04-13']);
});

test('documented role and multiplicity limits stay explicit', () => {
  // Presence is checked without proving that a date or number fills the right role.
  assert.equal(checkLiteralRetention('Deadline 2026-04-13.', sem([
    { predicate: 'deadline', roles: { subject: '2026-04-13', time: 'soon' } },
  ])).retained, true);

  // Source values are sets, so repeated occurrences do not impose multiplicity.
  assert.equal(checkLiteralRetention('Use 7 units, then use 7 units again.', sem([
    { predicate: 'above', roles: { subject: 'metric', value: 7 } },
  ])).retained, true);
});
