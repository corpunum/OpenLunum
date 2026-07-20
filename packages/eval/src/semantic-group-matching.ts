/**
 * Semantic-group-based cross-lingual matching.
 *
 * Supplements the existing fingerprint-based near-semantic matching
 * (see `@corpunum/lunum`'s `NearSemanticFingerprintGenerator` and
 * `cross-lingual-retrieval.ts`) with a second, dataset-authored
 * equivalence signal: a "semantic group" identifier marks a fixed set
 * of dataset items across languages as parallel / semantically
 * equivalent.
 *
 * Design constraints (accepted proposal, issue #256):
 *
 *  - Dataset-only: group membership is a property of the eval dataset,
 *    curated at authoring time. It is never derived at runtime from a
 *    model's own output -- there is no code path in this module that
 *    reads model output to assign or confirm group membership.
 *  - Closed schema: a record's group id is only trusted if it matches
 *    a group declared in a `SemanticGroupSchema` known ahead of time.
 *    Unknown/forged group ids are a hard validation error, not a
 *    silent skip.
 *  - Fail-closed:
 *      - no group id            -> excluded from group matching, the
 *                                   record falls back to fingerprint
 *                                   matching (this module never throws
 *                                   for a record that simply has no
 *                                   group annotation)
 *      - malformed group id      -> hard validation error
 *      - duplicate group id      -> hard validation error when two
 *        within a language         records in the SAME language claim
 *                                   the same group (dataset corruption)
 *      - wrong-language /         -> the group's members are cross
 *        structurally mismatched     validated for structural
 *        members                     equivalence (via the existing
 *                                     near-semantic fingerprint
 *                                     generator); a group that falls
 *                                     below the similarity threshold is
 *                                     flagged suspect and excluded from
 *                                     group-based matching, and its
 *                                     members fall back to fingerprint
 *                                     matching individually
 *  - Secondary fallback only: fingerprint matching is only used for a
 *    record that has no valid, trustworthy group id. Group and
 *    fingerprint signals are never combined/voted between for the same
 *    pair -- that risks false equivalence when the two disagree.
 */

import { NearSemanticFingerprintGenerator } from '@corpunum/lunum';
import type { LunumRecord } from '@corpunum/lunum';
import type { LanguageCode } from './multilingual-retrieval.js';

// ── Closed schema ────────────────────────────────────────────────────

/**
 * A single semantic group as declared by the dataset author. `languages`
 * is the closed, exact set of languages this group is expected to have
 * exactly one member in -- not a hint, a constraint checked at ingest.
 */
export interface SemanticGroupDefinition {
  groupId: string;
  languages: readonly LanguageCode[];
}

export type SemanticGroupSchema = readonly SemanticGroupDefinition[];

export interface SemanticGroupMember {
  /**
   * Human-readable label only (derived from the record's fingerprint) --
   * NOT used for uniqueness. See SemanticGroupIndex.recordGroupId, which
   * keys by the LunumRecord object itself. A semantic fingerprint is an
   * identity of MEANING, not of the dataset record: intentionally
   * parallel multilingual records may share one, and two independently
   * curated groups could too, so it cannot safely disambiguate distinct
   * records here (2026-07-21, corrected per issue #256 review).
   */
  recordId: string;
  language: LanguageCode;
  record: LunumRecord;
}

export interface SemanticGroupSuspectInfo {
  readonly reasons: readonly string[];
}

export interface SemanticGroupIndex {
  /** groupId -> language -> member, for groups that passed schema and structural validation. */
  readonly groups: ReadonlyMap<string, ReadonlyMap<LanguageCode, SemanticGroupMember>>;
  /**
   * record object identity -> groupId, reverse lookup for records in
   * `groups`. Keyed by the LunumRecord object reference itself, not by
   * fingerprint or any string id -- see SemanticGroupMember.recordId for
   * why a fingerprint cannot be used as the key.
   */
  readonly recordGroupId: ReadonlyMap<LunumRecord, string>;
  /** Records (by object identity) with no group id, or whose group was downgraded to suspect. These must use fingerprint fallback. */
  readonly ungroupedRecords: ReadonlySet<LunumRecord>;
  /** Groups that referenced a real schema group but failed structural cross-validation; excluded from `groups`. */
  readonly suspectGroups: ReadonlyMap<string, SemanticGroupSuspectInfo>;
}

export interface BuildSemanticGroupIndexOptions {
  /**
   * Structural similarity threshold (0-1) below which a group's members
   * are considered not actually equivalent and the group is flagged
   * suspect. Defaults to the project's standard near-semantic threshold.
   */
  structuralSimilarityThreshold?: number;
}

/** The single well-known location a group id may be declared at. Not free-text: validated against `SemanticGroupSchema` below. */
const GROUP_ANNOTATION_KEY = 'semanticGroupId';

// ── Schema validation ───────────────────────────────────────────────

function validateSchema(schema: SemanticGroupSchema): void {
  const seenGroupIds = new Set<string>();
  for (const definition of schema) {
    if (typeof definition.groupId !== 'string' || definition.groupId.trim() === '') {
      throw new Error('Semantic group schema: groupId must be a non-empty string');
    }
    if (seenGroupIds.has(definition.groupId)) {
      throw new Error(`Semantic group schema: duplicate groupId "${definition.groupId}"`);
    }
    seenGroupIds.add(definition.groupId);

    if (!Array.isArray(definition.languages) || definition.languages.length < 2) {
      throw new Error(`Semantic group schema: group "${definition.groupId}" must declare at least 2 languages`);
    }
    const languageSet = new Set(definition.languages);
    if (languageSet.size !== definition.languages.length) {
      throw new Error(`Semantic group schema: group "${definition.groupId}" declares duplicate languages`);
    }
  }
}

// ── Extraction ───────────────────────────────────────────────────────

/**
 * Extract a record's declared semantic group id.
 *
 * Returns `undefined` when the record has no group annotation at all
 * (this is the normal, expected case for ungrouped items -- callers
 * should fall back to fingerprint matching, not treat it as an error).
 *
 * Throws when the annotation is present but malformed (wrong type or
 * empty string) -- that is dataset corruption, not an absent value, and
 * must fail closed rather than be silently treated as "no group".
 */
export function extractGroupId(record: LunumRecord): string | undefined {
  const annotations = record.sem?.annotations;
  if (!annotations || typeof annotations !== 'object') return undefined;
  if (!(GROUP_ANNOTATION_KEY in annotations)) return undefined;

  const raw = (annotations as Record<string, unknown>)[GROUP_ANNOTATION_KEY];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      `Malformed semantic group id on record ${describeRecord(record)}: ` +
      `"${GROUP_ANNOTATION_KEY}" annotation must be a non-empty string, got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

function describeRecord(record: LunumRecord): string {
  return record.fingerprint || '(no fingerprint)';
}

function recordLanguage(record: LunumRecord): LanguageCode {
  return (record.source?.language as LanguageCode) || 'en';
}

// ── Ingest / index build ────────────────────────────────────────────

/**
 * Validate a dataset's records against a closed semantic-group schema
 * and build an index usable for group-based cross-lingual matching.
 *
 * This is the ingest-time validation gate: it is meant to run once,
 * over curated dataset records, before any retrieval scoring happens.
 * It never inspects model output.
 */
export function buildSemanticGroupIndex(
  records: readonly LunumRecord[],
  schema: SemanticGroupSchema,
  options: BuildSemanticGroupIndexOptions = {}
): SemanticGroupIndex {
  validateSchema(schema);
  const threshold = options.structuralSimilarityThreshold ?? 0.8;
  const schemaById = new Map(schema.map((definition) => [definition.groupId, definition] as const));

  const provisional = new Map<string, Map<LanguageCode, SemanticGroupMember>>();
  const ungrouped = new Set<LunumRecord>();

  for (const record of records) {
    // recordId is a DISPLAY label only (error messages) -- object identity
    // (the `record` reference itself) is what actually keys the indices
    // below, since fingerprint is not guaranteed unique per record.
    const recordId = record.fingerprint;
    if (!recordId) {
      throw new Error('Semantic group ingest: record is missing a fingerprint, cannot be indexed');
    }

    const groupId = extractGroupId(record); // throws on malformed
    if (groupId === undefined) {
      ungrouped.add(record);
      continue;
    }

    const definition = schemaById.get(groupId);
    if (!definition) {
      throw new Error(
        `Unknown semantic group id "${groupId}" on record ${recordId}: ` +
        'does not correspond to any group declared in the dataset schema'
      );
    }

    const language = recordLanguage(record);
    if (!definition.languages.includes(language)) {
      throw new Error(
        `Semantic group "${groupId}" on record ${recordId}: language "${language}" is not one of the ` +
        `languages declared for this group in the dataset schema (${definition.languages.join(', ')})`
      );
    }

    let members = provisional.get(groupId);
    if (!members) {
      members = new Map();
      provisional.set(groupId, members);
    }
    const existing = members.get(language);
    if (existing) {
      throw new Error(
        `Duplicate semantic group membership: group "${groupId}" already has a "${language}" member ` +
        `(record ${existing.recordId}); record ${recordId} claims the same group and language. ` +
        'This indicates dataset corruption -- two different items in the same language cannot share a group.'
      );
    }
    members.set(language, { recordId, language, record });
  }

  // Structural cross-validation: members of a real, valid group must
  // actually be structurally equivalent (same Lunum-Sem shape) once
  // language-specific surface text is set aside, or the shared group id
  // itself is suspect ("wrong-language membership" -- content that
  // doesn't belong together got tagged as parallel). Groups that fail
  // this check are excluded from group-based matching entirely; their
  // members fall back to fingerprint matching individually, same as any
  // other ungrouped record.
  const generator = new NearSemanticFingerprintGenerator(threshold);
  const groups = new Map<string, ReadonlyMap<LanguageCode, SemanticGroupMember>>();
  const recordGroupId = new Map<LunumRecord, string>();
  const suspectGroups = new Map<string, SemanticGroupSuspectInfo>();

  for (const [groupId, members] of provisional) {
    const memberList = [...members.values()];
    const reasons: string[] = [];

    for (let i = 0; i < memberList.length; i += 1) {
      for (let j = i + 1; j < memberList.length; j += 1) {
        const a = memberList[i]!;
        const b = memberList[j]!;
        const comparison = generator.compareRecords(a.record, b.record);
        if (!comparison.similar) {
          const hardReasons = comparison.hardMismatchReasons?.length
            ? ` (${comparison.hardMismatchReasons.join('; ')})`
            : '';
          reasons.push(
            `${a.language}/${a.recordId} vs ${b.language}/${b.recordId}: structural similarity ` +
            `${comparison.similarity.toFixed(3)} below threshold ${threshold}${hardReasons}`
          );
        }
      }
    }

    if (reasons.length > 0) {
      suspectGroups.set(groupId, { reasons });
      for (const member of memberList) ungrouped.add(member.record);
      continue;
    }

    groups.set(groupId, members);
    for (const member of memberList) recordGroupId.set(member.record, groupId);
  }

  return { groups, recordGroupId, ungroupedRecords: ungrouped, suspectGroups };
}

// ── Matching ─────────────────────────────────────────────────────────

export type SemanticMatchMethod = 'group' | 'fingerprint';

export interface SemanticMatchResult {
  matched: boolean;
  method: SemanticMatchMethod;
  /** Populated when method === 'group' and the records matched. */
  groupId?: string;
  /** Populated when method === 'fingerprint'. */
  fingerprintSimilarity?: number;
}

/**
 * Determine whether two records are cross-lingual semantic matches.
 *
 * Group-based matching is used only when BOTH records carry a valid,
 * indexed (non-suspect) semantic group id -- in which case the match is
 * a simple group-id equality check. Otherwise this falls back to the
 * existing fingerprint-based near-semantic comparison for that pair.
 *
 * The two signals are never combined or voted between for the same
 * pair: doing so risks false equivalence if the fingerprint fallback
 * coincidentally agrees or disagrees with a group signal that wasn't
 * actually applicable to one side of the pair.
 */
export function matchSemanticGroupOrFingerprint(
  a: LunumRecord,
  b: LunumRecord,
  index: SemanticGroupIndex,
  fingerprintGenerator: NearSemanticFingerprintGenerator = new NearSemanticFingerprintGenerator()
): SemanticMatchResult {
  const groupIdA = index.recordGroupId.get(a);
  const groupIdB = index.recordGroupId.get(b);

  if (groupIdA !== undefined && groupIdB !== undefined) {
    return groupIdA === groupIdB
      ? { matched: true, method: 'group', groupId: groupIdA }
      : { matched: false, method: 'group' };
  }

  const comparison = fingerprintGenerator.compareRecords(a, b);
  return {
    matched: comparison.similar,
    method: 'fingerprint',
    fingerprintSimilarity: comparison.similarity
  };
}

export const semanticGroupMatchingExports = [
  buildSemanticGroupIndex,
  extractGroupId,
  matchSemanticGroupOrFingerprint
] as const;
