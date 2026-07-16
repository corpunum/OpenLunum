/**
 * Negative compile fixture: deliberately mutates an actual generated
 * contract projection so that `tsc` produces one intentional TS2322
 * at the marked line below.
 *
 * Strategy:
 *   1. Omit 'world' from LunumSemSchema and replace it with `number`.
 *   2. TwoWay-assert that mutated type against Pick<LunumSem, 'world'>
 *      whose public type is `string`.
 *   3. TS2322 appears on the const assignment at the marked line.
 *
 * This test is excluded from normal build via tsconfig.json.
 */

import type { LunumSem } from '../../src/types.js';
import type { LunumSemSchema as LunumSemSchemaType } from '../../src/types-schema.js';

// Helper: two-way structural assignability
type TwoWay<T, U> = T extends U ? (U extends T ? true : false) : false;

// Mutate generated contract: replace world: string with world: number
type _MutatedSem = Omit<LunumSemSchemaType, 'world'> & {
  world: number;
};

// TwoWay between mutated generated and public: number ≠ string → TwoWay = false
type _NegativeTwoWay = TwoWay<
  Pick<LunumSem, 'world'>,
  Pick<_MutatedSem, 'world'>
>;

// MARK: expected failure — TS2322 on this line
const _assertNegativeTwoWay: _NegativeTwoWay = true;

export { _assertNegativeTwoWay };
