import { SEM_SCHEMA } from './constants.js';

/**
 * SEM_SCHEMA_FROZEN is the current 0.1-draft version that remains backward-compatible.
 * All new documents should use SEM_SCHEMA_V1 ('lunum-sem/1.0') instead.
 */
export const SEM_SCHEMA_FROZEN = SEM_SCHEMA;

/**
 * SEM_SCHEMA_V1 is the frozen 1.0 release of the Lunum-Sem schema.
 * This version is immutable and will not change. Future semantic model changes
 * require a new major version (e.g., 2.0, 3.0).
 */
export const SEM_SCHEMA_V1 = 'lunum-sem/1.0' as const;

/**
 * FROZEN_SEM_SCHEMAS lists all schema versions that are frozen and immutable.
 * No changes to the field structure are permitted for these versions.
 */
export const FROZEN_SEM_SCHEMAS = [SEM_SCHEMA_FROZEN, SEM_SCHEMA_V1] as const;

export type FrozenSemSchema = typeof FROZEN_SEM_SCHEMAS[number];

/**
 * FINGERPRINT_VERSION specifies the canonical version of the fingerprint algorithm.
 * Fingerprints are version-tagged (e.g., 'lfp:1.0:sha256:...') to enable
 * deterministic migration when the algorithm changes.
 */
export const FINGERPRINT_VERSION = 'lunum-fp/1.0' as const;

/**
 * FINGERPRINT_MIGRATION_POLICY documents how fingerprints must be handled
 * when the fingerprint algorithm changes.
 *
 * Key principles:
 * - Fingerprints are immutable once computed under a specific version
 * - The fingerprint version is embedded in the fingerprint string itself (lfp:VERSION:algo:digest)
 * - Old fingerprints remain valid for retrieval and matching
 * - New fingerprints are always computed under the current version
 * - Explicit migration is required when upgrading fingerprint versions across large datasets
 */
export const FINGERPRINT_MIGRATION_POLICY = {
  version: FINGERPRINT_VERSION,
  frozen: true,
  backwardCompatible: true,
  versionField: 'The second field in the fingerprint string (e.g., "1.0" in "lfp:1.0:sha256:...")',
  migrationRules: [
    'Fingerprints computed under lunum-fp/1.0 are immutable and must not be recomputed.',
    'New schema versions may introduce a new fingerprint version (e.g. lunum-fp/2.0).',
    'Each fingerprint carries its version tag; fingerprints of different versions coexist in the same dataset.',
    'Migration between fingerprint versions requires explicit opt-in via migrateFingerprint() or migrateRecord().',
    'A migration manifest should be maintained to track which records have been migrated to new versions.',
    'Existing fingerprints remain valid for retrieval; new fingerprints are computed under the new version.',
    'During retrieval, version-aware matching should first try exact fingerprint match, then fall back to content-based matching if needed.',
  ],
} as const;

/**
 * CANONICALIZATION_VERSION specifies the canonical version of the canonicalization algorithm.
 * The canonicalization algorithm transforms semantic content into a deterministic form
 * suitable for fingerprinting.
 */
export const CANONICALIZATION_VERSION = 'lunum-canon/1.0' as const;

/**
 * CANONICALIZATION_POLICY documents the normalization rules applied during canonicalization.
 *
 * The canonicalization algorithm ensures that semantically equivalent content produces
 * identical fingerprints. The algorithm:
 *
 * 1. Normalizes identifiers (world, kind, predicates, role keys, type, id, ref, language fields)
 *    using NFKC Unicode normalization, trimming, lowercasing, and underscore replacement
 * 2. Normalizes text values using NFKC, trimming, and whitespace consolidation
 * 3. Sorts role keys lexicographically to ensure deterministic ordering
 * 4. Omits null values and false boolean values to reduce noise
 * 5. Preserves clause order (significant for multi-clause semantics)
 * 6. Recursively canonicalizes nested structures (conditions, consequences, references)
 * 7. Uses stable JSON stringification (sorted keys) for hashing
 */
export const CANONICALIZATION_POLICY = {
  version: CANONICALIZATION_VERSION,
  frozen: true,
  rules: [
    'Clause order is significant and must be preserved.',
    'Role keys are sorted lexicographically during canonicalization.',
    'Identifiers (world, kind, predicate, roles, type, id, ref, language) are normalized: NFKC Unicode, trimmed, lowercased, spaces→underscores.',
    'String values in "value" fields are normalized: NFKC Unicode, trimmed, spaces→single spaces.',
    'Null values in optional fields are omitted, not serialized.',
    'Boolean false for negated is omitted during canonicalization.',
    'Empty arrays (conditions, consequences) are omitted during canonicalization.',
    'Numeric values preserve their original precision.',
    'Fingerprint computation uses stable JSON stringification (lexicographically sorted keys).',
  ],
} as const;

export interface NormativeExample {
  id: string;
  description: string;
  sourceText: string;
  sem: {
    schema: FrozenSemSchema;
    world: string;
    kind: string;
    clauses: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  expectedFingerprint?: string;
}

export const NORMATIVE_EXAMPLES: readonly NormativeExample[] = [
  {
    id: 'simple-preference',
    description: 'A simple preference with a single predicate and two roles.',
    sourceText: 'The user prefers dark mode.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'user', theme: 'dark mode' }, negated: false }],
    },
  },
  {
    id: 'negated-safety',
    description: 'A negated safety constraint with must_not modality.',
    sourceText: 'The system must not share personal data.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'safety_constraint',
      clauses: [{ predicate: 'share', roles: { agent: 'system', theme: 'personal data' }, negated: true, modality: 'must_not' }],
    },
  },
  {
    id: 'conditional-action',
    description: 'A conditional clause: if authenticated, grant access.',
    sourceText: 'If the user is authenticated, grant access to the dashboard.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'grant',
        roles: { agent: 'system', theme: 'access', target: 'dashboard' },
        negated: false,
        conditions: [{ predicate: 'authenticate', roles: { agent: 'user' }, negated: false }],
      }],
    },
  },
  {
    id: 'temporal-deadline',
    description: 'A temporal clause with a date anchoring.',
    sourceText: 'The report is due on 2025-06-15.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'due',
        roles: { theme: 'report' },
        negated: false,
        time: { type: 'date', value: '2025-06-15' },
      }],
    },
  },
  {
    id: 'multi-role-transfer',
    description: 'A multi-role clause with agent, amount, source, and destination.',
    sourceText: 'The user transfers 500 USD from checking to savings.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'transfer',
        roles: {
          agent: 'user',
          amount: { type: 'quantity', value: 500, unit: 'USD' },
          source: 'checking',
          destination: 'savings',
        },
        negated: false,
      }],
    },
  },
  {
    id: 'multi-clause-pipeline',
    description: 'A multi-clause semantic with three sequential actions.',
    sourceText: 'The CI builds, tests, and deploys the artifact.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'simple_fact',
      clauses: [
        { predicate: 'build', roles: { agent: 'CI', theme: 'artifact' }, negated: false },
        { predicate: 'test', roles: { agent: 'CI', theme: 'artifact' }, negated: false },
        { predicate: 'deploy', roles: { agent: 'CI', theme: 'artifact' }, negated: false },
      ],
    },
  },
  {
    id: 'belief-state',
    description: 'An epistemic belief state with belief modality.',
    sourceText: 'The user believes the meeting was cancelled.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'real',
      kind: 'belief_state',
      clauses: [{ predicate: 'believe', roles: { experiencer: 'user', theme: 'meeting was cancelled' }, negated: false, modality: 'belief' }],
    },
  },
  {
    id: 'hypothetical-world',
    description: 'A hypothetical-world clause.',
    sourceText: 'If the system were offline, users would see a maintenance page.',
    sem: {
      schema: SEM_SCHEMA_FROZEN,
      world: 'hypothetical',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'see',
        roles: { experiencer: 'users', theme: 'maintenance page' },
        negated: false,
        conditions: [{ predicate: 'offline', roles: { theme: 'system' }, negated: false }],
      }],
    },
  },
] as const;

export function isFrozenSemSchema(schema: string): schema is FrozenSemSchema {
  return (FROZEN_SEM_SCHEMAS as readonly string[]).includes(schema);
}
