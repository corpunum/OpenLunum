/**
 * Source grounding: check the literal references of a text (or of each
 * discourse unit) against a source locator and attach file:line provenance.
 *
 * A reference the locator cannot find is labelled `unverified` -- an
 * "unverified reference" flag for a reader or an agent to check. It is never
 * removed, rewritten or used to block a record. A reference outside every
 * indexed root, or one the locator could not answer for, is reported as such
 * and is not flagged.
 */
import { analyzeDiscourse, literalsCoveredBy, unitLiterals } from '../../../packages/core/dist/src/index.js';
import { distinctReferences, extractReferences, REFERENCE_EXTRACTOR_VERSION } from './references.js';
import type { ExtractReferencesOptions } from './references.js';
import { TrigramIndex } from './trigram.js';
import type { ExistsResult, Reference, SourceLocation, SourceLocator } from './types.js';

export const SOURCE_GROUNDING_VERSION = 'lunum-source-grounding/0.1' as const;

export type GroundingStatus = 'grounded' | 'unverified' | 'out_of_scope' | 'unavailable';

export interface GroundedReference extends Reference {
  status: GroundingStatus;
  locations: SourceLocation[];
  evidence: string[];
  /** Discourse unit index, when grounded per unit. */
  unit?: number;
}

export interface GroundingReport {
  version: typeof SOURCE_GROUNDING_VERSION;
  extractor: typeof REFERENCE_EXTRACTOR_VERSION;
  locator: string;
  references: GroundedReference[];
  counts: Record<GroundingStatus, number>;
  /** Distinct literals looked up (each is looked up once per report). */
  lookups: number;
  elapsedMs: number;
}

export interface GroundOptions extends ExtractReferencesOptions {
  /** Parallel lookups (default 4). */
  concurrency?: number;
  /** Locations kept per reference (default 3). */
  maxLocations?: number;
}

function statusOf(result: ExistsResult): GroundingStatus {
  if (result.status === 'found') return 'grounded';
  if (result.status === 'not_found') return 'unverified';
  return result.status;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function lookupAll(references: readonly Reference[], locator: SourceLocator, options: GroundOptions): Promise<Map<string, ExistsResult>> {
  const distinct = distinctReferences(references);
  const results = await mapLimit(distinct, options.concurrency ?? 4, async (ref) => {
    try {
      return await locator.exists(ref.text, ref.kind);
    } catch {
      return { status: 'unavailable', locations: [], evidence: ['error'] } satisfies ExistsResult;
    }
  });
  const map = new Map<string, ExistsResult>();
  distinct.forEach((ref, i) => map.set(`${ref.kind}\u0000${ref.text}`, results[i]!));
  return map;
}

function report(locator: SourceLocator, references: GroundedReference[], lookups: number, started: number): GroundingReport {
  const counts: Record<GroundingStatus, number> = { grounded: 0, unverified: 0, out_of_scope: 0, unavailable: 0 };
  for (const ref of references) counts[ref.status] += 1;
  return {
    version: SOURCE_GROUNDING_VERSION,
    extractor: REFERENCE_EXTRACTOR_VERSION,
    locator: locator.name,
    references,
    counts,
    lookups,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
  };
}

function attach(ref: Reference, result: ExistsResult, maxLocations: number, unit?: number): GroundedReference {
  return {
    ...ref,
    status: statusOf(result),
    locations: result.locations.slice(0, maxLocations),
    evidence: result.evidence,
    ...(unit !== undefined ? { unit } : {}),
  };
}

/** Ground every reference of `text`. Offsets are into `text`. */
export async function groundText(text: string, locator: SourceLocator, options: GroundOptions = {}): Promise<GroundingReport> {
  const started = performance.now();
  const references = extractReferences(text, options);
  const results = await lookupAll(references, locator, options);
  const grounded = references.map((ref) => attach(ref, results.get(`${ref.kind}\u0000${ref.text}`)!, options.maxLocations ?? 3));
  return report(locator, grounded, results.size, started);
}

/**
 * Ground per discourse unit (core `analyzeDiscourse`). Offsets are into the
 * whole `source`; each reference names its unit.
 */
export async function groundDiscourse(source: string, locator: SourceLocator, options: GroundOptions = {}): Promise<GroundingReport> {
  const started = performance.now();
  const analysis = analyzeDiscourse(source);
  const perUnit: Array<{ unit: number; ref: Reference }> = [];
  for (const a of analysis.units) {
    // Children (fields of a list item / tool call) are covered by their parent span.
    if (a.unit.parent !== undefined) continue;
    for (const ref of extractReferences(a.unit.text, options)) {
      perUnit.push({ unit: a.unit.index, ref: { ...ref, start: ref.start + a.unit.start, end: ref.end + a.unit.start } });
    }
  }
  const results = await lookupAll(perUnit.map((p) => p.ref), locator, options);
  const grounded = perUnit.map(({ unit, ref }) => attach(ref, results.get(`${ref.kind}\u0000${ref.text}`)!, options.maxLocations ?? 3, unit));
  return report(locator, grounded, results.size, started);
}

export interface UnitRef {
  messageId: string;
  unit: number;
  text: string;
}

export interface NearDuplicatePair {
  a: UnitRef;
  b: UnitRef;
  similarity: number;
  /** Every literal of the older unit is stated by the newer one (core gate). */
  literalsCovered: boolean;
}

export interface NearDuplicateUnitOptions {
  minSimilarity?: number;
  /** Minimum unit length in characters (default 80). */
  minChars?: number;
  /** Candidates per unit (default 5). */
  perUnit?: number;
}

/**
 * Near-verbatim restatement candidates among the discourse units of ordered
 * messages (oldest first): pairs from different messages with different
 * surface keys whose trigram Jaccard is at least `minSimilarity`. Exact
 * surface duplicates are left to the core (`lsu` keys). Candidates only.
 */
export function nearDuplicateUnits(messages: ReadonlyArray<{ id: string; content: string }>, options: NearDuplicateUnitOptions = {}): NearDuplicatePair[] {
  const minChars = options.minChars ?? 80;
  const minSimilarity = options.minSimilarity ?? 0.5;
  const index = new TrigramIndex<UnitRef & { key: string; order: number }>();
  const pairs: NearDuplicatePair[] = [];
  messages.forEach((message, order) => {
    const analysis = analyzeDiscourse(message.content);
    for (const a of analysis.units) {
      if (a.unit.text.length < minChars) continue;
      const ref = { messageId: message.id, unit: a.unit.index, text: a.unit.text };
      const hits = index.candidates(a.unit.text, {
        minSimilarity,
        limit: options.perUnit ?? 5,
        exclude: (_id, v) => v.messageId === message.id || v.key === a.key,
      });
      for (const hit of hits) {
        const older = hit.value;
        pairs.push({
          a: { messageId: older.messageId, unit: older.unit, text: older.text },
          b: ref,
          similarity: hit.similarity,
          literalsCovered: literalsCoveredBy(unitLiterals(older.text), unitLiterals(a.unit.text)),
        });
      }
      index.add(`${order}:${a.unit.index}`, a.unit.text, { ...ref, key: a.key, order });
    }
  });
  return pairs;
}
