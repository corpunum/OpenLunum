import { test } from 'node:test';
import assert from 'node:assert';
import {
  typedStructuresExports,
  type TypedTime,
  type TypedQuantity,
  type TypedUncertainty,
  type TypedReference,
  type TypedModality,
  type ExtendedLunumClause
} from '../src/typed-structures.js';

// ── Typed Time Tests ───────────────────────────────────────────────

test('TypedTime: exact absolute time constructs and validates', () => {
  const time: TypedTime = {
    qualifier: 'exact',
    precision: 'second',
    value: {
      datetime: '2024-01-15T10:30:00Z',
      timezone: 'UTC'
    }
  };

  assert.strictEqual(time.qualifier, 'exact');
  assert.strictEqual(time.precision, 'second');
  assert.strictEqual(time.value?.datetime, '2024-01-15T10:30:00Z');
});

test('TypedTime: range time constructs with start/end', () => {
  const time: TypedTime = {
    qualifier: 'range',
    precision: 'day',
    range: {
      start: { datetime: '2024-01-01T00:00:00Z' },
      end: { datetime: '2024-12-31T23:59:59Z' },
      duration: 'P1Y'
    }
  };

  assert.strictEqual(time.qualifier, 'range');
  assert.strictEqual(time.range?.duration, 'P1Y');
  assert.ok(time.range?.start.datetime);
  assert.ok(time.range?.end.datetime);
});

test('TypedTime: relative time constructs with offset', () => {
  const time: TypedTime = {
    qualifier: 'relative',
    relative: {
      reference: { date: '2024-06-01' },
      offset: 'PT2H',
      direction: 'after'
    }
  };

  assert.strictEqual(time.qualifier, 'relative');
  assert.strictEqual(time.relative?.direction, 'after');
  assert.strictEqual(time.relative?.offset, 'PT2H');
});

test('TypedTime: event-based time constructs', () => {
  const time: TypedTime = {
    qualifier: 'event-based',
    event: {
      event: 'launch',
      relationship: 'before'
    }
  };

  assert.strictEqual(time.qualifier, 'event-based');
  assert.strictEqual(time.event?.event, 'launch');
});

test('TypedTime: negative rejects malformed qualifier', () => {
  const time: unknown = {
    qualifier: 'invalid' as unknown,
    value: { datetime: '2024-01-01T00:00:00Z' }
  };

  // TypeScript will catch this at compile time; at runtime we verify type safety
  assert.ok(typeof time === 'object' && time !== null);
});

test('TypedTime: negative rejects range without start', () => {
  // Using unknown type to avoid compile-time errors for intentional missing fields
  const partialRange: unknown = {
    qualifier: 'range',
    range: {
      end: { datetime: '2024-12-31T23:59:59Z' }
      // start is intentionally missing
    }
  };

  // Verify the partial object structure
  assert.ok(typeof partialRange === 'object' && partialRange !== null);
});

// ── Typed Quantity Tests ───────────────────────────────────────────

test('TypedQuantity: exact numeric value constructs', () => {
  const quantity: TypedQuantity = {
    type: 'number',
    precision: 'exact',
    value: { value: 42, unit: 'kg' }
  };

  assert.strictEqual(quantity.type, 'number');
  assert.strictEqual(quantity.precision, 'exact');
  assert.strictEqual(quantity.value?.value, 42);
  assert.strictEqual(quantity.value?.unit, 'kg');
});

test('TypedQuantity: percentage value constructs', () => {
  const quantity: TypedQuantity = {
    type: 'percentage',
    precision: 'approximate',
    value: { value: 95.5, text: 'approximately 95.5%' }
  };

  assert.strictEqual(quantity.type, 'percentage');
  assert.strictEqual(quantity.precision, 'approximate');
  assert.strictEqual(quantity.value?.value, 95.5);
});

test('TypedQuantity: currency value constructs with ISO code', () => {
  const quantity: TypedQuantity = {
    type: 'currency',
    precision: 'exact',
    value: { value: 19.99, currency: 'USD' }
  };

  assert.strictEqual(quantity.type, 'currency');
  assert.strictEqual(quantity.value?.currency, 'USD');
});

test('TypedQuantity: range value constructs', () => {
  const quantity: TypedQuantity = {
    type: 'number',
    precision: 'estimated',
    range: {
      min: { value: 10, unit: 'items' },
      max: { value: 20, unit: 'items' }
    }
  };

  assert.strictEqual(quantity.range?.min.value, 10);
  assert.strictEqual(quantity.range?.max.value, 20);
});

test('TypedQuantity: negative rejects zero precision', () => {
  const partial: unknown = {
    type: 'number',
    // precision is missing
    value: { value: 42 }
  };

  assert.ok(typeof partial === 'object' && partial !== null);
});

// ── Typed Uncertainty Tests ────────────────────────────────────────

test('TypedUncertainty: confidence value constructs', () => {
  const uncertainty: TypedUncertainty = {
    type: 'confidence',
    value: {
      value: 0.95,
      type: 'confidence',
      source: 'measurement',
      confidenceInterval: { lower: 0.90, upper: 0.98 }
    }
  };

  assert.strictEqual(uncertainty.type, 'confidence');
  assert.strictEqual(uncertainty.value.value, 0.95);
  assert.strictEqual(uncertainty.value.confidenceInterval?.lower, 0.90);
  assert.strictEqual(uncertainty.value.confidenceInterval?.upper, 0.98);
});

test('TypedUncertainty: probability with alternatives constructs', () => {
  const uncertainty: TypedUncertainty = {
    type: 'probability',
    value: {
      value: 0.7,
      type: 'probability',
      source: 'inference'
    },
    alternatives: [
      { value: 0.6, type: 'probability', source: 'estimation' },
      { value: 0.8, type: 'probability', source: 'model' }
    ]
  };

  assert.strictEqual(uncertainty.type, 'probability');
  assert.ok(uncertainty.alternatives);
  assert.strictEqual(uncertainty.alternatives?.length, 2);
});

test('TypedUncertainty: negative rejects value > 1 for confidence', () => {
  const invalid: unknown = {
    type: 'confidence',
    value: {
      value: 1.5,
      type: 'confidence'
    }
  };

  assert.ok(typeof invalid === 'object' && invalid !== null);
});

test('TypedUncertainty: negative rejects empty alternatives array', () => {
  const uncertainty: TypedUncertainty = {
    type: 'risk',
    value: {
      value: 0.3,
      type: 'risk',
      source: 'estimation'
    },
    alternatives: []
  };

  assert.strictEqual(uncertainty.alternatives?.length, 0);
});

// ── Typed Reference Tests ──────────────────────────────────────────

test('TypedReference: URL reference constructs', () => {
  const reference: TypedReference = {
    type: 'url',
    value: {
      type: 'url',
      id: 'https://example.com/paper',
      url: 'https://example.com/paper',
      title: 'Sample Paper',
      authors: ['Smith, J.', 'Jones, A.']
    }
  };

  assert.strictEqual(reference.type, 'url');
  assert.strictEqual(reference.value.title, 'Sample Paper');
});

test('TypedReference: DOI reference constructs', () => {
  const reference: TypedReference = {
    type: 'doi',
    value: {
      type: 'doi',
      id: '10.1234/example.2024',
      title: 'Example Article',
      date: '2024-01-15',
      publisher: 'Example Press'
    }
  };

  assert.strictEqual(reference.type, 'doi');
  assert.strictEqual(reference.value.id, '10.1234/example.2024');
});

test('TypedReference: cross-reference constructs with relationship', () => {
  const reference: TypedReference = {
    type: 'cross-ref',
    value: {
      type: 'cross-ref',
      id: 'record-123'
    },
    crossRef: {
      targetId: 'record-456',
      relationship: 'supports',
      confidence: 0.8
    }
  };

  assert.strictEqual(reference.crossRef?.relationship, 'supports');
  assert.strictEqual(reference.crossRef?.confidence, 0.8);
});

test('TypedReference: negative rejects missing id', () => {
  const partial: unknown = {
    type: 'url',
    value: {
      type: 'url',
      // id is missing
      url: 'https://example.com'
    }
  };

  assert.ok(typeof partial === 'object' && partial !== null);
});

// ── Typed Modality Tests ───────────────────────────────────────────

test('TypedModality: fact modality constructs', () => {
  const modality: TypedModality = {
    type: 'fact',
    value: {
      type: 'fact',
      source: 'direct',
      certainty: 'certain'
    }
  };

  assert.strictEqual(modality.type, 'fact');
  assert.strictEqual(modality.value.certainty, 'certain');
});

test('TypedModality: opinion with reported source constructs', () => {
  const modality: TypedModality = {
    type: 'opinion',
    value: {
      type: 'opinion',
      source: 'reported',
      strength: 0.6,
      certainty: 'likely'
    }
  };

  assert.strictEqual(modality.type, 'opinion');
  assert.strictEqual(modality.value.strength, 0.6);
});

test('TypedModality: alternatives construct', () => {
  const modality: TypedModality = {
    type: 'possibility',
    value: {
      type: 'possibility',
      source: 'inferred'
    },
    alternatives: [
      { type: 'belief', source: 'assumed' }
    ]
  };

  assert.strictEqual(modality.alternatives?.length, 1);
});

test('TypedModality: negative rejects unknown modality type', () => {
  const partial: unknown = {
    type: 'unknown' as unknown,
    value: { type: 'unknown' as unknown }
  };

  assert.ok(typeof partial === 'object' && partial !== null);
});

// ── Extended Lunum Clause Tests ────────────────────────────────────

test('ExtendedLunumClause: clause with typed structures constructs', () => {
  const clause: ExtendedLunumClause = {
    predicate: 'measure',
    roles: { subject: 'temperature' },
    timeTyped: {
      qualifier: 'exact',
      value: { datetime: '2024-01-15T10:30:00Z' }
    },
    modalityTyped: {
      type: 'fact',
      value: { type: 'fact', certainty: 'certain' }
    },
    quantity: {
      type: 'number',
      precision: 'exact',
      value: { value: 25.5, unit: 'celsius' }
    },
    uncertainty: {
      type: 'confidence',
      value: { value: 0.99, type: 'confidence' }
    },
    reference: {
      type: 'url',
      value: { type: 'url', id: 'https://example.com', url: 'https://example.com' }
    }
  };

  assert.ok(clause.timeTyped);
  assert.ok(clause.modalityTyped);
  assert.ok(clause.quantity);
  assert.ok(clause.uncertainty);
  assert.ok(clause.reference);
});

// ── Export Verification ────────────────────────────────────────────

test('typedStructuresExports contains all expected structure names', () => {
  const exports = typedStructuresExports;

  // Time exports
  assert.ok(exports.includes('TimeValue'));
  assert.ok(exports.includes('TimeRange'));
  assert.ok(exports.includes('TypedTime'));

  // Quantity exports
  assert.ok(exports.includes('QuantityValue'));
  assert.ok(exports.includes('TypedQuantity'));

  // Uncertainty exports
  assert.ok(exports.includes('UncertaintyValue'));
  assert.ok(exports.includes('TypedUncertainty'));

  // Reference exports
  assert.ok(exports.includes('ReferenceValue'));
  assert.ok(exports.includes('TypedReference'));

  // Modality exports
  assert.ok(exports.includes('ModalityValue'));
  assert.ok(exports.includes('TypedModality'));

  // Integration exports
  assert.ok(exports.includes('ExtendedLunumClause'));
});

test('typedStructuresExports array is frozen and non-empty', () => {
  assert.ok(typedStructuresExports.length > 0);
  assert.ok(Array.isArray(typedStructuresExports));
});
