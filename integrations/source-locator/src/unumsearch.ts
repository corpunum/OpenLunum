/**
 * Source locator backed by an unumsearch daemon (https://github.com/corpunum/unumsearch)
 * over its local HTTP/JSON API (`GET /status`, `/search`, `/files`).
 *
 * Every doubt is `unavailable`, never `not_found`: daemon down or slow, a root
 * not covered, an index that is not fresh, a truncated listing. Only a
 * complete, fresh, covered search with no hit is `not_found`.
 *
 * The daemon answers one root (a unit or a split root) per request, so a
 * whole-corpus lookup walks the configured roots, single units first, and
 * stops at the first hit.
 */
import http from 'node:http';
import { distinctReferences, extractReferences } from './references.js';
import { jaccard, trigramSet } from './trigram.js';
import type {
  ExistsResult, LocatedSpan, NearDuplicateCandidate, NearDuplicateOptions, ReferenceKind, SourceLocation, SourceLocator,
} from './types.js';

export const DEFAULT_UNUMSEARCH_URL = 'http://127.0.0.1:7781';

export type UnumsearchTransport = (path: '/status' | '/search' | '/files', params: Record<string, string>) => Promise<unknown>;

export interface UnumsearchLocatorOptions {
  url?: string;
  /** Roots to search (units or split roots). Default: derived from `/status`. */
  roots?: readonly string[];
  timeoutMs?: number;
  /** Expands a leading `~/` in path references. */
  homeDir?: string;
  /** Locations kept per lookup (default 3). */
  maxLocations?: number;
  /**
   * Optional check for an absolute path the index does not list (for example a
   * gitignored or build file inside a root). When it returns true the path is
   * `found` with evidence `disk`. Default: none (index only).
   */
  pathExists?: (absolutePath: string) => boolean;
  /** Injected transport (tests). Default: one loopback GET per call. */
  transport?: UnumsearchTransport;
}

interface UnumResult {
  backend?: string;
  covered?: boolean;
  fresh?: boolean;
  truncated?: boolean;
  files?: string[];
  matches?: Array<{ path: string; line: number; text: string }>;
  units?: Array<{ path: string }>;
}

function httpTransport(base: string, timeoutMs: number): UnumsearchTransport {
  return (path, params) => new Promise((resolve) => {
    let done = false;
    const finish = (value: unknown): void => { if (!done) { done = true; resolve(value); } };
    const query = new URLSearchParams(params).toString();
    let req: http.ClientRequest;
    try {
      // agent:false -- pooled keep-alive sockets measured ~40 ms on every
      // other request against this daemon, slower than the search itself.
      req = http.get(`${base}${path}${query ? `?${query}` : ''}`, { agent: false, timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) { res.resume(); finish(null); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => { try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { finish(null); } });
        res.on('error', () => finish(null));
      });
    } catch { finish(null); return; }
    req.on('timeout', () => { req.destroy(); finish(null); });
    req.on('error', () => finish(null));
  });
}

/**
 * Group unit paths into search roots: single units first, then parents that
 * hold several units. `isSplitRoot` decides whether such a parent is a split
 * root the daemon can answer for as a whole; when it is not, its children
 * stay individual roots.
 */
export async function rootsFromUnits(unitPaths: readonly string[], isSplitRoot: (parent: string) => Promise<boolean> = async () => false): Promise<string[]> {
  const units = new Set(unitPaths);
  const byParent = new Map<string, string[]>();
  for (const u of unitPaths) {
    const parent = u.slice(0, u.lastIndexOf('/')) || '/';
    const list = byParent.get(parent);
    if (list) list.push(u); else byParent.set(parent, [u]);
  }
  const single: string[] = [];
  const split: string[] = [];
  for (const [parent, children] of byParent) {
    if (children.length >= 2 && !units.has(parent) && await isSplitRoot(parent)) split.push(parent);
    else single.push(...children);
  }
  return [...single.sort(), ...split.sort()];
}

function clip(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function under(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);
}

function globEscape(text: string): string {
  return text.replace(/[*?[\]{}!\\]/gu, (c) => `\\${c}`);
}

export class UnumsearchLocator implements SourceLocator {
  readonly name = 'unumsearch';
  private readonly transport: UnumsearchTransport;
  private readonly maxLocations: number;
  private roots: string[] | null;
  private unitPaths: string[] | null = null;

  constructor(private readonly options: UnumsearchLocatorOptions = {}) {
    const url = String(options.url ?? DEFAULT_UNUMSEARCH_URL).replace(/\/+$/u, '');
    this.transport = options.transport ?? httpTransport(url, options.timeoutMs ?? 1500);
    this.maxLocations = options.maxLocations ?? 3;
    this.roots = options.roots ? [...options.roots] : null;
  }

  /** The roots searched, in order; null when the daemon cannot be reached. */
  async searchRoots(): Promise<string[] | null> {
    if (this.roots && this.unitPaths) return this.roots;
    const body = await this.transport('/status', {}) as { ok?: boolean; units?: Array<{ path?: string }> } | null;
    const units = body?.ok && Array.isArray(body.units) ? body.units.map((u) => String(u.path ?? '')).filter(Boolean) : null;
    if (!units) return this.roots;
    this.unitPaths = units;
    if (!this.roots) {
      this.roots = await rootsFromUnits(units, async (parent) => (await this.call('/files', { root: parent, max_files: '1' })) !== null);
    }
    return this.roots;
  }

  private async call(path: '/search' | '/files', params: Record<string, string>): Promise<UnumResult | null> {
    let body: { ok?: boolean; result?: UnumResult } | null;
    try { body = await this.transport(path, { scan_fallback: '0', ...params }) as typeof body; } catch { return null; }
    const r = body?.ok ? body.result : null;
    if (!r || r.backend !== 'index' || r.covered !== true) return null;
    return r;
  }

  /**
   * Run `query` against each root until one returns locations. `not_found`
   * only when every root answered fresh and complete.
   */
  private async acrossRoots(query: (root: string) => Promise<{ locations: SourceLocation[]; reliable: boolean }>, evidence: string): Promise<ExistsResult> {
    const roots = await this.searchRoots();
    if (!roots || roots.length === 0) return { status: 'unavailable', locations: [], evidence: ['no-roots'] };
    // Sequential with early exit: most references hit in the first (single-unit)
    // roots. Fanning out to every root in parallel measured ~9x slower against
    // the daemon (experiments/source-locator-v1).
    let reliable = true;
    for (const root of roots) {
      const r = await query(root);
      if (r.locations.length > 0) return { status: 'found', locations: r.locations.slice(0, this.maxLocations), evidence: [evidence] };
      if (!r.reliable) reliable = false;
    }
    return reliable ? { status: 'not_found', locations: [], evidence: [evidence] } : { status: 'unavailable', locations: [], evidence: [evidence, 'incomplete'] };
  }

  private literal(pattern: string, caseSensitive = true): Promise<ExistsResult> {
    return this.acrossRoots(async (root) => {
      const r = await this.call('/search', { root, pattern, mode: 'literal', ci: caseSensitive ? '0' : '1', max_matches: String(this.maxLocations) });
      if (!r) return { locations: [], reliable: false };
      const locations = (r.matches ?? []).map((m) => ({ file: m.path, line: m.line, text: clip(m.text) }));
      return { locations, reliable: r.fresh === true };
    }, 'literal');
  }

  private filesMatching(glob: string, accept: (file: string) => boolean): Promise<ExistsResult> {
    return this.acrossRoots(async (root) => {
      const r = await this.call('/files', { root, glob, max_files: '200' });
      if (!r) return { locations: [], reliable: false };
      const locations = (r.files ?? []).filter(accept).map((file) => ({ file, line: null }));
      return { locations, reliable: r.fresh === true && r.truncated !== true };
    }, 'filename');
  }

  private async absolute(path: string): Promise<ExistsResult> {
    await this.searchRoots();
    const units = this.unitPaths ?? this.roots ?? [];
    const scopes = [...units, ...(this.roots ?? [])];
    if (!scopes.some((root) => under(root, path) || under(path, root))) return { status: 'out_of_scope', locations: [], evidence: ['outside-roots'] };
    const trimmed = path.replace(/\/+$/u, '') || '/';
    const dir = trimmed.slice(0, trimmed.lastIndexOf('/')) || '/';
    const base = trimmed.slice(trimmed.lastIndexOf('/') + 1);
    const asFile = await this.call('/files', { root: dir, glob: globEscape(base), max_files: '5' });
    if (asFile?.files?.includes(trimmed)) return { status: 'found', locations: [{ file: trimmed, line: null }], evidence: ['filename'] };
    const asDir = await this.call('/files', { root: trimmed, max_files: '1' });
    if (asDir?.files?.length) return { status: 'found', locations: [{ file: asDir.files[0]!, line: null }], evidence: ['directory'] };
    if (this.options.pathExists?.(trimmed)) return { status: 'found', locations: [{ file: trimmed, line: null }], evidence: ['disk'] };
    const reliable = (asFile !== null && asFile.fresh === true) || (asDir !== null && asDir.fresh === true);
    // An absolute path above every unit (e.g. a split root itself) cannot be listed.
    if (!reliable) return { status: 'unavailable', locations: [], evidence: ['filename', 'incomplete'] };
    return { status: 'not_found', locations: [], evidence: ['filename', 'directory'] };
  }

  private async relativePath(path: string): Promise<ExistsResult> {
    const rel = path.replace(/^(?:\.\.?\/)+/u, '').replace(/\/+$/u, '');
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    if (!base) return { status: 'unavailable', locations: [], evidence: ['empty'] };
    const suffix = `/${rel}`;
    const asFile = await this.filesMatching(`**/${globEscape(base)}`, (file) => file.endsWith(suffix));
    if (asFile.status === 'found') return asFile;
    const asDir = await this.filesMatching(`**/${globEscape(rel)}/**`, (file) => file.includes(`${suffix}/`));
    if (asDir.status === 'found') return { ...asDir, evidence: ['directory'] };
    const literal = await this.literal(rel);
    if (literal.status === 'found') return literal;
    return worst([asFile, asDir, literal]);
  }

  async exists(literal: string, kind: ReferenceKind = 'identifier'): Promise<ExistsResult> {
    const value = String(literal ?? '').trim();
    if (!value) return { status: 'unavailable', locations: [], evidence: ['empty'] };
    if (kind === 'path' || (kind === 'file' && value.includes('/'))) {
      const home = this.options.homeDir?.replace(/\/+$/u, '');
      if (value.startsWith('~/')) {
        if (!home) return { status: 'out_of_scope', locations: [], evidence: ['home-unknown'] };
        return this.absolute(`${home}/${value.slice(2)}`);
      }
      if (value.startsWith('/')) return this.absolute(value);
      return this.relativePath(value);
    }
    if (kind === 'file') {
      const asFile = await this.filesMatching(`**/${globEscape(value)}`, (file) => file.endsWith(`/${value}`));
      if (asFile.status === 'found') return asFile;
      const mention = await this.literal(value);
      return mention.status === 'found' ? mention : worst([asFile, mention]);
    }
    const exact = await this.literal(value);
    if (exact.status !== 'not_found') return exact;
    if (kind === 'version' && /^v\d/u.test(value)) {
      const bare = await this.literal(value.slice(1));
      return bare.status === 'found' ? { ...bare, evidence: ['literal-unprefixed'] } : exact;
    }
    if (kind === 'config_key') {
      // Nested config is rarely written dotted: every segment must occur.
      const segments = value.split('.').filter((s) => s.length >= 3).slice(-4);
      const results: ExistsResult[] = [];
      for (const segment of segments) {
        const r = await this.literal(segment);
        results.push(r);
        if (r.status !== 'found') return { ...worst([exact, r]), evidence: ['literal', 'segments'] };
      }
      const last = results[results.length - 1];
      if (last) return { status: 'found', locations: last.locations, evidence: ['segments'] };
    }
    return exact;
  }

  async locate(text: string): Promise<LocatedSpan[]> {
    const references = extractReferences(text);
    const results = new Map<string, ExistsResult>();
    for (const ref of distinctReferences(references)) results.set(`${ref.kind}\u0000${ref.text}`, await this.exists(ref.text, ref.kind));
    return references
      .map((ref) => ({ ref, r: results.get(`${ref.kind}\u0000${ref.text}`)! }))
      .filter(({ r }) => r.status === 'found')
      .map(({ ref, r }) => ({ start: ref.start, end: ref.end, text: ref.text, kind: ref.kind, locations: r.locations }));
  }

  async nearDuplicates(text: string, options: NearDuplicateOptions = {}): Promise<NearDuplicateCandidate[]> {
    const min = options.minSimilarity ?? 0.5;
    const limit = options.limit ?? 10;
    const flat = String(text ?? '').replace(/\s+/gu, ' ').trim();
    if (flat.length < 24) return [];
    // Three 24-character probes (head, middle, tail): a near-verbatim
    // restatement keeps at least one of them intact.
    const mid = Math.floor((flat.length - 24) / 2);
    const probes = [...new Set([flat.slice(0, 24), flat.slice(mid, mid + 24), flat.slice(-24)].map((p) => p.trim()))];
    const target = trigramSet(flat);
    const roots = (await this.searchRoots()) ?? [];
    const seen = new Map<string, NearDuplicateCandidate>();
    for (const probe of probes) {
      for (const root of roots) {
        const r = await this.call('/search', { root, pattern: probe, mode: 'literal', ci: '1', max_matches: '20' });
        for (const m of r?.matches ?? []) {
          const key = `${m.path}:${m.line}`;
          if (seen.has(key)) continue;
          const similarity = jaccard(target, trigramSet(m.text));
          if (similarity >= min) seen.set(key, { source: m.path, line: m.line, text: clip(m.text, 400), similarity });
        }
      }
    }
    return [...seen.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }
}

const RANK: Record<ExistsResult['status'], number> = { found: 0, unavailable: 1, out_of_scope: 2, not_found: 3 };

/** The least conclusive of several negative results (unavailable beats not_found). */
function worst(results: ExistsResult[]): ExistsResult {
  const sorted = [...results].sort((a, b) => RANK[a.status] - RANK[b.status]);
  const pick = sorted[0]!;
  return { status: pick.status, locations: [], evidence: [...new Set(results.flatMap((r) => r.evidence))] };
}
