import { Ajv2020 } from 'ajv/dist/2020.js';
import { types } from 'node:util';
import { SEMANTIC_TRANSPORT_SCHEMA } from './semantic-transport-schema.js';

export { SEMANTIC_TRANSPORT_SCHEMA_SHA256 } from './semantic-transport-schema.js';

const validate = new Ajv2020({
  strict: false, allErrors: true, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false,
}).compile(SEMANTIC_TRANSPORT_SCHEMA);

/** Check JSON safety before a recursive schema validator sees an in-process value. */
function jsonSafety(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value) || types.isProxy(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  // Inspect data descriptors without invoking getters. Accessors/proxies can
  // mutate already-validated fields between the schema and identity gates.
  const ok = Reflect.ownKeys(value).every(key => {
    if (Array.isArray(value) && key === 'length') return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) return false;
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key)) return false;
    return jsonSafety(descriptor.value, ancestors);
  });
  ancestors.delete(value);
  return ok;
}

/** Actual wire-schema validation, with no defaults, coercion or field removal. */
export function validateSemanticTransport(value: unknown): { ok: boolean; errors: string[] } {
  try {
    if (!jsonSafety(value)) return { ok: false, errors: ['transport: candidate must be finite, acyclic plain JSON'] };
    const ok = Boolean(validate(value));
    return { ok, errors: ok ? [] : (validate.errors ?? []).map(error =>
      `transport:${error.instancePath || '/'}:${error.keyword}:${JSON.stringify(error.params)}: ${error.message}`) };
  } catch {
    return { ok: false, errors: ['transport: candidate exceeds safe recursive validation limits'] };
  }
}
