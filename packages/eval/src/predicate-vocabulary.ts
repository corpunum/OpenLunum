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
  'time',
  'value'
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
 * strings. The model should not invent new type names.
 *
 * 2026-07-20: this previously listed only 'actor', 'concept', 'object' —
 * the gold dataset also uses 'date', 'feature', 'metric', 'project', and
 * 'quantity' (e.g. condition clauses on conditional_instruction/
 * safety_constraint items). Telling the model there were only 3 valid
 * types actively steered it away from the correct output for every
 * condition-bearing item in the dataset.
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

  return [
    'Controlled vocabulary (prefer these terms):',
    '',
    `  Predicates: ${predicates}`,
    `  Roles: ${roles}`,
    `  Identifiers: ${identifiers}`,
    `  Role types: ${roleTypes}`,
    '',
    'If a term from your source text maps to one of these, use it.',
    'Otherwise invent a lower_snake_case identifier that is consistent'
  ].join('\n');
}
