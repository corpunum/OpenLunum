/**
 * Positive compilation fixture: proves that the actual public types
 * (LunumSem, LunumRecord) and the generated schema types
 * (LunumSemSchema, LunumRecordSchema) are structurally compatible
 * on the retained TwoWay-checked projections.
 *
 * Uses the same TwoWay helper from types-schema-conformance.ts.
 * Expected: this file compiles without error.
 */

import type { LunumSem, LunumRecord } from '../../src/types.js';
import type { LunumSemSchema, LunumRecordSchema } from '../../src/types-schema.js';

type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// LunumSem world/kind ↔ LunumSemSchema world/kind
const _checkLunumSemCore: TwoWay<
  Pick<LunumSem, 'world' | 'kind'>,
  Pick<LunumSemSchema, 'world' | 'kind'>
> = true;

// LunumRecord fingerprint ↔ LunumRecordSchema fingerprint
const _checkRecordFingerprint: TwoWay<
  Pick<LunumRecord, 'fingerprint'>,
  Pick<LunumRecordSchema, 'fingerprint'>
> = true;

// LunumRecord sem world/kind ↔ LunumRecordSchema sem world/kind
const _checkRecordSem: TwoWay<
  Pick<LunumRecord['sem'], 'world' | 'kind'>,
  Pick<LunumRecordSchema['sem'], 'world' | 'kind'>
> = true;

// LunumRecord source.text ↔ LunumRecordSchema source.text
const _checkRecordSource: TwoWay<
  Pick<LunumRecord['source'], 'text'>,
  Pick<LunumRecordSchema['source'], 'text'>
> = true;

// Schema const value
const _checkSchemaConst: 'lunum-sem/0.2' extends LunumSemSchema['schema']
  ? LunumSemSchema['schema'] extends 'lunum-sem/0.2'
    ? true
    : false
  : false = true;

export {
  _checkLunumSemCore,
  _checkRecordFingerprint,
  _checkRecordSem,
  _checkRecordSource,
  _checkSchemaConst
};
