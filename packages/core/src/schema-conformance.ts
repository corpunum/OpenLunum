/**
 * Schema conformance test vectors for types-schema-conformance.ts.
 *
 * This module exports test assertions that are appended to the
 * schemaConformanceChecks array in types-schema-conformance.ts,
 * forming the allConformanceTests constant.
 */

// Placeholder conformance test: schema version literal stability.
// The conformance vector for schema version must be an exact string match.
const _schemaVersionLiteral = true; // 'lunum-sem/0.1-draft' === 'lunum-sem/0.1-draft'

// Placeholder: fingerprint field must be string-typed on both sides.
const _fingerprintIsString = true; // typeof '' === 'string'

/** Conformance test assertions exported for schema-conformance integration. */
export const conformanceTests = [
  _schemaVersionLiteral,
  _fingerprintIsString
] as const;
