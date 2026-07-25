/**
 * Controlled predicate, role, and identifier vocabulary for the parse prompt.
 *
 * Extracted from the gold dataset's identifier inventory so that models
 * can hit gold identifiers instead of guessing synonyms (e.g. "delete"
 * vs "remove_file"). Models should prefer these terms when they apply.
 *
 * The vocabulary is deliberately small and conservative: only terms that
 * actually appear in the gold Lunum-Sem records are included. New terms
 * may be added as the dataset grows, but existing entries must not be
 * removed without updating the gold dataset's inventory.
 */

// ── Predicates (clause-level verbs) ─────────────────────────────────────

/**
 * Canonical predicate inventory derived from gold Lunum-Sem records.
 *
 * Each entry is a lower_snake_case verb that appears as the `predicate`
 * field in at least one gold clause. When the model detects one of these
 * semantic intents it should emit the corresponding predicate rather
 * than inventing a synonym.
 */
export const PREDICATES: readonly string[] = Object.freeze([
  'below',
  'confirmed',
  'deadline',
  'delete',
  'enable',
  'prefer'
] satisfies readonly string[]);

/** Set for O(1) membership tests during prompt assembly. */
export const PREDICATE_SET = new Set(PREDICATES);

// ── Roles (parameter names within a clause) ─────────────────────────────

/**
 * Canonical role inventory derived from gold Lunum-Sem records.
 *
 * Each entry is a role name that appears as a key inside the `roles`
 * map of at least one gold clause. The model should use these exact
 * role names when structuring the parsed output.
 */
export const ROLES: readonly string[] = Object.freeze([
  'agent',
  'experiencer',
  'object',
  'subject',
  'theme',
  'time'
] satisfies readonly string[]);

/** Set for O(1) membership tests during prompt assembly. */
export const ROLE_SET = new Set(ROLES);

// ── Identifiers (lower_snake_case entity IDs) ───────────────────────────

/**
 * Canonical identifier inventory derived from gold Lunum-Sem records.
 *
 * Each entry is a lower_snake_case `id` value that appears in at least
 * one gold role. The model should prefer these identifiers when the
 * source text refers to a known entity. For entities not in this list,
 * the model should invent a new lower_snake_case identifier that is
 * consistent across the output.
 */
export const IDENTIFIERS: readonly string[] = Object.freeze([
  'assistant',
  'concise_answers',
  'files',
  'power_saving',
  'project',
  'system',
  'user'
] satisfies readonly string[]);

/** Set for O(1) membership tests during prompt assembly. */
export const IDENTIFIER_SET = new Set(IDENTIFIERS);

// ── Role types ──────────────────────────────────────────────────────────

/**
 * Allowed role `type` values in the Lunum-Sem schema.
 *
 * Every role object carries a `type` field that must be one of these
 * three strings. The model should not invent new type names.
 */
export const ROLE_TYPES: readonly string[] = Object.freeze([
  'actor',
  'concept',
  'date',
  'feature',
  'metric',
  'object',
  'project',
  'quantity'
] satisfies readonly string[]);

/** Set for O(1) membership tests during prompt assembly. */
export const ROLE_TYPE_SET = new Set(ROLE_TYPES);

// ── Modality values ───────────────────────────────────────────────────

/**
 * Allowed clause-level `modality` values.
 *
 * `ModalityType` is defined in `packages/core/src/typed-structures.ts` but
 * is not re-exported from `@corpunum/lunum`'s public entrypoint (`index.ts`
 * only re-exports selected modules, and `typed-structures.ts` is not among
 * them), so it cannot be imported here. This array is hard-coded and MUST
 * be kept in sync with `ModalityType` in `packages/core/src/typed-structures.ts`
 * by hand; do not add, remove, or reorder values here without updating that
 * enum (and vice versa).
 */
export const MODALITY_VALUES: readonly string[] = Object.freeze([
  'fact',
  'opinion',
  'belief',
  'possibility',
  'necessity',
  'obligation',
  'permission',
  'ability',
  'intention',
  'certainty'
] satisfies readonly string[]);

/** Set for O(1) membership tests during prompt assembly. */
export const MODALITY_VALUE_SET = new Set(MODALITY_VALUES);

// ── Prompt fragments ────────────────────────────────────────────────────

/**
 * Return a natural-language vocabulary block suitable for embedding
 * in a system prompt. Models are told to prefer these terms when
 * they apply.
 */
export function vocabularyBlock(): string {
  const predicates = PREDICATES.join(', ');
  const roles = ROLES.join(', ');
  const identifiers = IDENTIFIERS.join(', ');
  const roleTypes = ROLE_TYPES.join(', ');
  const modalityValues = MODALITY_VALUES.join(', ');

  return [
    'Controlled vocabulary (prefer these terms):',
    '',
    `  Predicates: ${predicates}`,
    `  Roles: ${roles}`,
    `  Identifiers: ${identifiers}`,
    `  Role types: ${roleTypes}`,
    `  Modality values: ${modalityValues}`,
    '',
    'If a term from your source text maps to one of these, use it.',
    'Otherwise invent a lower_snake_case identifier that is consistent',
    '',
    'When the source expresses a modal meaning — permission, obligation, possibility, etc. — set the clause `modality` to the matching value from the modality values above; omit `modality` when the source is a plain non-modal statement.'
  ].join('\n');
}
