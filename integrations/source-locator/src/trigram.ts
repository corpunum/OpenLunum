/**
 * Character-trigram sets and an in-memory blocking index for near-verbatim
 * restatements. Pure and deterministic. A trigram candidate is never a
 * duplicate by itself: the caller must still apply the core literal gate
 * (`retainsLiterals` / `literalsCoveredBy`) before treating two texts as one.
 */

/** NFKC, case-folded, whitespace-collapsed, markdown emphasis removed. */
export function normaliseForTrigrams(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[*_`]{1,3}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('und');
}

/** Distinct character trigrams (by code point) of the normalised text. */
export function trigramSet(text: string): Set<string> {
  const chars = [...normaliseForTrigrams(text)];
  const out = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i += 1) out.add(chars[i]! + chars[i + 1]! + chars[i + 2]!);
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const t of small) if (large.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export interface TrigramCandidate<T> {
  id: string;
  value: T;
  similarity: number;
}

/**
 * Inverted trigram index. `candidates` scores only documents that share at
 * least one trigram, and prunes by the size bound: Jaccard >= s requires
 * s*|A| <= |B| <= |A|/s.
 */
export class TrigramIndex<T = string> {
  private readonly docs = new Map<string, { grams: Set<string>; value: T }>();
  private readonly postings = new Map<string, string[]>();

  get size(): number { return this.docs.size; }

  add(id: string, text: string, value: T): void {
    if (this.docs.has(id)) throw new Error(`duplicate id: ${id}`);
    const grams = trigramSet(text);
    this.docs.set(id, { grams, value });
    for (const g of grams) {
      const list = this.postings.get(g);
      if (list) list.push(id); else this.postings.set(g, [id]);
    }
  }

  candidates(text: string, { minSimilarity = 0.5, limit = 10, exclude }: { minSimilarity?: number; limit?: number; exclude?: (id: string, value: T) => boolean } = {}): TrigramCandidate<T>[] {
    const grams = trigramSet(text);
    if (grams.size === 0) return [];
    const shared = new Map<string, number>();
    for (const g of grams) for (const id of this.postings.get(g) ?? []) shared.set(id, (shared.get(id) ?? 0) + 1);
    const out: TrigramCandidate<T>[] = [];
    for (const [id, count] of shared) {
      const doc = this.docs.get(id)!;
      const size = doc.grams.size;
      if (size < minSimilarity * grams.size || size * minSimilarity > grams.size) continue;
      const similarity = count / (grams.size + size - count);
      if (similarity < minSimilarity) continue;
      if (exclude?.(id, doc.value)) continue;
      out.push({ id, value: doc.value, similarity });
    }
    out.sort((a, b) => b.similarity - a.similarity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out.slice(0, limit);
  }
}
