/**
 * In-process source locator over a fixed set of documents. Deterministic and
 * offline: for tests, fixtures and small corpora (a session, a wiki page set).
 * Large corpora belong in an indexed backend such as unumsearch.
 */
import { distinctReferences, extractReferences } from './references.js';
import { TrigramIndex } from './trigram.js';
import type {
  ExistsResult, LocatedSpan, NearDuplicateCandidate, NearDuplicateOptions, ReferenceKind, SourceLocation, SourceLocator,
} from './types.js';

export interface MemoryDocument {
  /** File path or record id; must be unique. */
  id: string;
  text: string;
}

export class InMemoryLocator implements SourceLocator {
  readonly name = 'memory';
  private readonly docs: ReadonlyArray<MemoryDocument & { lines: string[] }>;
  private readonly lineIndex = new TrigramIndex<{ id: string; line: number; text: string }>();

  constructor(documents: readonly MemoryDocument[], private readonly maxLocations = 3) {
    const ids = new Set<string>();
    this.docs = documents.map((d) => {
      if (ids.has(d.id)) throw new Error(`duplicate document id: ${d.id}`);
      ids.add(d.id);
      return { ...d, lines: String(d.text ?? '').split('\n') };
    });
    for (const d of this.docs) {
      d.lines.forEach((text, i) => { if (text.trim().length >= 3) this.lineIndex.add(`${d.id}:${i + 1}`, text, { id: d.id, line: i + 1, text }); });
    }
  }

  private find(needle: string): SourceLocation[] {
    const out: SourceLocation[] = [];
    for (const d of this.docs) {
      for (let i = 0; i < d.lines.length && out.length < this.maxLocations; i += 1) {
        if (d.lines[i]!.includes(needle)) out.push({ file: d.id, line: i + 1, text: d.lines[i]! });
      }
      if (out.length >= this.maxLocations) break;
    }
    return out;
  }

  async exists(literal: string, kind: ReferenceKind = 'identifier'): Promise<ExistsResult> {
    const value = String(literal ?? '').trim();
    if (!value) return { status: 'unavailable', locations: [], evidence: ['empty'] };
    if (kind === 'path' || kind === 'file') {
      const rel = value.replace(/^(?:~|\.\.?)?\/+/u, '').replace(/\/+$/u, '');
      const byName = this.docs.filter((d) => d.id === value || d.id.endsWith(`/${rel}`) || d.id === rel || d.id.includes(`/${rel}/`));
      if (byName.length) return { status: 'found', locations: byName.slice(0, this.maxLocations).map((d) => ({ file: d.id, line: null })), evidence: ['filename'] };
    }
    const locations = this.find(value);
    return locations.length ? { status: 'found', locations, evidence: ['literal'] } : { status: 'not_found', locations: [], evidence: ['literal'] };
  }

  async locate(text: string): Promise<LocatedSpan[]> {
    const refs = extractReferences(text);
    const results = new Map<string, ExistsResult>();
    for (const ref of distinctReferences(refs)) results.set(`${ref.kind}\u0000${ref.text}`, await this.exists(ref.text, ref.kind));
    return refs
      .map((ref) => ({ ref, r: results.get(`${ref.kind}\u0000${ref.text}`)! }))
      .filter(({ r }) => r.status === 'found')
      .map(({ ref, r }) => ({ start: ref.start, end: ref.end, text: ref.text, kind: ref.kind, locations: r.locations }));
  }

  async nearDuplicates(text: string, options: NearDuplicateOptions = {}): Promise<NearDuplicateCandidate[]> {
    return this.lineIndex
      .candidates(text, { minSimilarity: options.minSimilarity ?? 0.5, limit: options.limit ?? 10 })
      .map((c) => ({ source: c.value.id, line: c.value.line, text: c.value.text, similarity: c.similarity }));
  }
}
