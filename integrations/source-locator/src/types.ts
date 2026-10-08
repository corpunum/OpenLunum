/**
 * Source-locator provider contract.
 *
 * A locator answers one question about a literal: does it occur in an indexed
 * corpus, and where. It is evidence about the corpus, never semantics: a
 * grounded reference is not thereby true, and an unverified one is not thereby
 * false. Nothing in this package edits, merges or deletes records.
 *
 * The core (`@corpunum/lunum`) never imports this package. Without a locator,
 * Lunum behaves exactly as before.
 */

export type ReferenceKind = 'path' | 'file' | 'identifier' | 'config_key' | 'version';

/** A literal reference found in text. `text.slice(start, end) === reference`. */
export interface Reference {
  kind: ReferenceKind;
  text: string;
  start: number;
  end: number;
}

export interface SourceLocation {
  /** Absolute path of the file in the indexed corpus. */
  file: string;
  /** 1-based line number, or null for a file-name-only hit. */
  line: number | null;
  /** The matched line, clipped; absent for file-name-only hits. */
  text?: string;
}

/**
 * - `found`: at least one location in the corpus.
 * - `not_found`: the whole corpus was searched and the index was fresh.
 * - `out_of_scope`: an absolute path outside every indexed root; no claim either way.
 * - `unavailable`: the locator could not answer reliably (down, stale, truncated, error).
 */
export type ExistsStatus = 'found' | 'not_found' | 'out_of_scope' | 'unavailable';

export interface ExistsResult {
  status: ExistsStatus;
  locations: SourceLocation[];
  /** How the answer was obtained, e.g. `literal`, `filename`, `segments`. */
  evidence: string[];
}

export interface LocatedSpan {
  start: number;
  end: number;
  text: string;
  kind: ReferenceKind;
  locations: SourceLocation[];
}

export interface NearDuplicateCandidate {
  /** Corpus document or file the candidate came from. */
  source: string;
  line: number | null;
  text: string;
  /** Jaccard similarity of the two character-trigram sets, 0..1. */
  similarity: number;
}

export interface NearDuplicateOptions {
  /** Minimum trigram Jaccard (default 0.5). */
  minSimilarity?: number;
  /** Maximum candidates returned (default 10). */
  limit?: number;
}

export interface SourceLocator {
  /** Stable provider name, e.g. `unumsearch` or `memory`. */
  readonly name: string;
  /** Does the literal occur in the corpus? `kind` selects the lookup strategy. */
  exists(literal: string, kind?: ReferenceKind): Promise<ExistsResult>;
  /** Spans of `text` that are references found in the corpus. */
  locate(text: string): Promise<LocatedSpan[]>;
  /** Corpus passages that share most character trigrams with `text`. Candidates only. */
  nearDuplicates(text: string, options?: NearDuplicateOptions): Promise<NearDuplicateCandidate[]>;
}
