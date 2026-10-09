/**
 * Discourse records (decisions/0021): long, multi-sentence and structured text
 * as source-span units with deterministic surface records.
 *
 * Real agent traffic is mostly long messages, assistant reports and tool
 * output, where the single-sentence Sem path abstains on every message. This
 * module splits such text into units (headings, list items, key: value
 * fields, table rows, code blocks, sentences and tool-result fields), keeps the
 * exact source span of every unit, and derives deterministic records from
 * structure alone: key/value facts, test counts, exit statuses, errors,
 * decisions, commitments and open items, and the literals each unit states.
 * A document record links the units.
 *
 * Boundaries (unchanged from the rest of core):
 * - Every record here is a SURFACE record. It is never a Sem, never carries an
 *   lfp identity and never claims meaning beyond its span. Unit keys
 *   (`lsu:0.1`) and fact keys (`lkv:0.1`) are surface keys over normalised
 *   text, not semantic fingerprints.
 * - A record may stand in for its unit's text only when it passes the
 *   per-unit literal-retention gate: every number, identifier, full date,
 *   relative time, path, hash and URL in the unit appears in the record's
 *   rendering, and every value the record states is a verbatim slice of the
 *   unit. Otherwise the unit stays natural text.
 * - Nothing here deletes source text. Compaction plans describe what a caller
 *   may show in place of a message; the source stays where the caller keeps it.
 *
 * Cue lexicons (decision, commitment, open item, error) are English and Greek
 * keyword heuristics. They only choose which units a compactor keeps first;
 * they are not semantic claims and do not affect any identity.
 */
import crypto from 'node:crypto';
import { datesInText, identifiersInText, numbersInText, relativeTimesInText } from './literal-retention.js';

export const DISCOURSE_RECORD_VERSION = 'lunum-discourse/0.1' as const;
export const UNIT_KEY_VERSION = 'lsu:0.1' as const;
export const FACT_KEY_VERSION = 'lkv:0.1' as const;

export type DiscourseUnitKind =
  | 'heading'
  | 'list_item'
  | 'kv'
  | 'table_row'
  | 'code'
  | 'sentence'
  | 'tool_call'
  | 'blob';

export interface DiscourseUnit {
  index: number;
  kind: DiscourseUnitKind;
  /** Offsets into the source text; `source.slice(start, end) === text`. */
  start: number;
  end: number;
  text: string;
  /** Index of the enclosing list item / tool call when this unit is one of its fields or sentences. */
  parent?: number;
}

export interface UnitLiterals {
  numbers: number[];
  identifiers: string[];
  dates: string[];
  relativeTimes: string[];
  paths: string[];
  hashes: string[];
  urls: string[];
}

export type DiscourseCue = 'decision' | 'commitment' | 'open_item' | 'error' | 'status';

export type UnitRecord =
  | { type: 'kv'; key: string; value: string; factKey: string }
  | { type: 'test_result'; counts: Record<string, number> }
  | { type: 'exit_status'; code: number }
  | { type: 'error'; text: string }
  | { type: 'decision' | 'commitment' | 'open_item'; text: string };

export interface UnitAnalysis {
  unit: DiscourseUnit;
  /** Surface key of the normalised unit text (lsu:0.1); equal keys = same text up to formatting. */
  key: string;
  literals: UnitLiterals;
  literalCount: number;
  cues: DiscourseCue[];
  records: UnitRecord[];
  /**
   * Compact rendering of the records that passed the per-unit literal gate,
   * or null when no record may stand in for the unit's text.
   */
  recordText: string | null;
  /** No record and no literal: natural text only (the unit abstains). */
  abstained: boolean;
}

export interface DocumentRecord {
  version: typeof DISCOURSE_RECORD_VERSION;
  chars: number;
  unitCount: number;
  /** Unit index of the first heading, else the first sentence-like unit. */
  topic: number | null;
  decisions: number[];
  commitments: number[];
  openItems: number[];
  errors: number[];
  literalUnits: number[];
  structuredUnits: number[];
  abstainedUnits: number[];
  /** Latest value per fact key within this document. */
  facts: Record<string, { key: string; value: string; unit: number }>;
}

export interface DiscourseAnalysis {
  version: typeof DISCOURSE_RECORD_VERSION;
  units: UnitAnalysis[];
  document: DocumentRecord;
}

// ---------------------------------------------------------------------------
// Segmentation

const FENCE = /^\s*(```|~~~)/u;
const HEADING = /^\s{0,3}(?:#{1,6}\s+\S.*|\*\*[^*\n]{1,100}\*\*:?\s*|__[^_\n]{1,100}__:?\s*)$/u;
const TABLE_ROW = /^\s*\|.*\|\s*$/u;
const LIST_ITEM = /^(\s*)(?:[-*+•]|\d{1,3}[.)])\s+\S/u;
// "key: value" with a short key that is not a URL scheme or a clock time.
const KV_LINE = /^\s*(?:[-*+•]\s+)?(?:\*\*)?([\p{L}_][\p{L}\p{N} _./()'-]{0,48}?)(?:\*\*)?\s*(?:[:=]|\s—\s|\s-\s)\s+(\S.*)$/u;
// "tool(args) — ok: true; code: 0; stdout: ..." (agent observed-tool-result lines)
const TOOL_CALL_LINE = /^\s*(?:[-*+•]\s+)?([\w.-]{2,48})\(([^)]{0,400})\)\s+[—–-]\s+(.*)$/u;
const FIELD_SPLIT = /;\s+(?=[\p{L}_][\w.]{0,40}:\s)/gu;
const BLOB_CHARS = 1200;

/** Sentence boundaries inside a prose span; avoids decimals, paths, abbreviations and ellipses inside words. */
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|etc|vs|cf|approx|Dr|Mr|Mrs|Ms|St|No|Fig|al))([.!?;…]+)(["')\]*_`]*)\s+(?=["'(\[*_`]*[\p{Lu}\p{N}#>@~/])/gu;

interface Span { start: number; end: number }

function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/u.test(text[start]!)) start += 1;
  while (end > start && /\s/u.test(text[end - 1]!)) end -= 1;
  return end > start ? { start, end } : null;
}

function splitSentences(text: string, start: number, end: number): Span[] {
  const body = text.slice(start, end);
  const out: Span[] = [];
  let cursor = 0;
  for (const match of body.matchAll(SENTENCE_END)) {
    const stop = match.index + match[1]!.length + match[2]!.length;
    const span = trimSpan(text, start + cursor, start + stop);
    if (span) out.push(span);
    cursor = stop;
  }
  const tail = trimSpan(text, start + cursor, end);
  if (tail) out.push(tail);
  return out;
}

function splitFields(text: string, start: number, end: number): Span[] {
  const body = text.slice(start, end);
  const out: Span[] = [];
  let cursor = 0;
  for (const match of body.matchAll(FIELD_SPLIT)) {
    const span = trimSpan(text, start + cursor, start + match.index);
    if (span) out.push(span);
    cursor = match.index + match[0].length;
  }
  const tail = trimSpan(text, start + cursor, end);
  if (tail) out.push(tail);
  return out;
}

/**
 * Split text into units with exact source spans. Deterministic. Every
 * non-whitespace character belongs to exactly one unit, except Markdown table
 * separator rows (`|---|---|`), which carry no content.
 */
export function segmentDiscourse(source: string): DiscourseUnit[] {
  const text = String(source ?? '');
  const units: DiscourseUnit[] = [];
  const push = (kind: DiscourseUnitKind, span: Span | null, parent?: number): number => {
    if (!span) return -1;
    const index = units.length;
    units.push({ index, kind, start: span.start, end: span.end, text: text.slice(span.start, span.end), ...(parent !== undefined ? { parent } : {}) });
    return index;
  };
  const lines: Span[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    lines.push({ start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  let prose: Span | null = null;
  const flushProse = (): void => {
    if (!prose) return;
    for (const sentence of splitSentences(text, prose.start, prose.end)) {
      push(sentence.end - sentence.start > BLOB_CHARS ? 'blob' : 'sentence', sentence);
    }
    prose = null;
  };
  const longItem = (kind: DiscourseUnitKind, span: Span): void => {
    // A list item or field that is itself long prose: the item, then its sentences.
    const sentences = splitSentences(text, span.start, span.end);
    if (sentences.length <= 1) { push(span.end - span.start > BLOB_CHARS ? 'blob' : kind, span); return; }
    const first = sentences[0]!;
    const parent = push(kind, first);
    for (const sentence of sentences.slice(1)) push(sentence.end - sentence.start > BLOB_CHARS ? 'blob' : 'sentence', sentence, parent);
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const raw = text.slice(line.start, line.end);
    if (FENCE.test(raw)) {
      flushProse();
      const fence = FENCE.exec(raw)![1]!;
      let j = i + 1;
      while (j < lines.length && !text.slice(lines[j]!.start, lines[j]!.end).trimStart().startsWith(fence)) j += 1;
      const last = lines[Math.min(j, lines.length - 1)]!;
      push('code', trimSpan(text, line.start, last.end));
      i = j;
      continue;
    }
    const span = trimSpan(text, line.start, line.end);
    if (!span) { flushProse(); continue; }
    const body = text.slice(span.start, span.end);
    if (HEADING.test(body)) { flushProse(); push('heading', span); continue; }
    if (TABLE_ROW.test(body)) {
      flushProse();
      if (!/^\|[\s|:-]+\|$/u.test(body)) push('table_row', span);
      continue;
    }
    const tool = TOOL_CALL_LINE.exec(body);
    if (tool) {
      flushProse();
      const resultStart = span.start + body.length - tool[3]!.length;
      const parent = push('tool_call', trimSpan(text, span.start, resultStart));
      for (const field of splitFields(text, resultStart, span.end)) {
        const fieldText = text.slice(field.start, field.end);
        push(field.end - field.start > BLOB_CHARS ? 'blob' : (KV_LINE.test(fieldText) ? 'kv' : 'sentence'), field, parent);
      }
      continue;
    }
    if (LIST_ITEM.test(body)) {
      flushProse();
      // Continuation lines (indented, not a new item or structure) belong to the item.
      let end = span.end;
      while (i + 1 < lines.length) {
        const next = text.slice(lines[i + 1]!.start, lines[i + 1]!.end);
        if (!/^\s{2,}\S/u.test(next) || LIST_ITEM.test(next) || FENCE.test(next)) break;
        i += 1; end = lines[i]!.end;
      }
      const itemSpan = trimSpan(text, span.start, end)!;
      const itemText = text.slice(itemSpan.start, itemSpan.end);
      if (KV_LINE.test(itemText) && itemText.length <= 300) push('kv', itemSpan);
      else longItem('list_item', itemSpan);
      continue;
    }
    const kv = KV_LINE.exec(body);
    if (kv && body.length <= 300 && kv[1]!.trim().split(/\s+/u).length <= 6 && !/^https?$/iu.test(kv[1]!.trim())) {
      flushProse(); push('kv', span); continue;
    }
    // Prose: join consecutive lines into one paragraph span.
    prose = prose ? { start: prose.start, end: span.end } : span;
  }
  flushProse();
  return units;
}

// ---------------------------------------------------------------------------
// Literals, cues and records

// Paths: absolute or ./~ relative; relative with a file extension; bare file
// names with a known extension; and (ambient-discourse-v1 follow-up) relative
// paths of three or more segments without an extension (`src/memory/lunum`,
// `propose/check/decide`). The last shape contains the two-segment absolute
// spelling (`/check/decide`) that a reader quoting the path would use; without
// it a clip could drop that literal while keeping the unit. A host prefix
// (`rig:/srv/app`) no longer hides an absolute path either.
const PATH = /(?<![\w/.-])(?:~|\.{1,2})?\/(?:[\w.@+-]+\/)*[\w.@+-]+\/?|(?<![\w/.-])[\w-]+(?:\/[\w.@+-]+)+\.[A-Za-z0-9]{1,6}\b|(?<![\w/.-])[\w-]+\.(?:mjs|cjs|js|ts|tsx|jsx|json|jsonl|md|py|sh|ya?ml|toml|sql|db|log|txt|css|html|gguf|service|ini)\b|(?<![\w/.:@+-])[\w.@+-]+(?:\/[\w.@+-]+){2,}\/?/gu;
const HASH = /(?<![\w-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,64}(?![\w-])/gu;
const URL = /\bhttps?:\/\/[^\s<>()"'`]+[^\s<>()"'`.,;:!?]/gu;

function uniq<T>(values: T[]): T[] { return [...new Set(values)]; }

export function unitLiterals(text: string): UnitLiterals {
  const urls = uniq([...text.matchAll(URL)].map((m) => m[0]));
  const withoutUrls = urls.reduce((rest, url) => rest.split(url).join(' '), text);
  const paths = uniq([...withoutUrls.matchAll(PATH)].map((m) => m[0]).filter((p) => p.length > 2 && !/^\/\d+$/u.test(p)));
  const hashes = uniq([...withoutUrls.matchAll(HASH)].map((m) => m[0]));
  return {
    numbers: uniq(numbersInText(text)),
    identifiers: uniq(identifiersInText(text)),
    dates: uniq(datesInText(text)),
    relativeTimes: relativeTimesInText(text),
    paths,
    hashes,
    urls,
  };
}

function literalCount(literals: UnitLiterals): number {
  return literals.numbers.length + literals.identifiers.length + literals.dates.length + literals.relativeTimes.length
    + literals.paths.length + literals.hashes.length + literals.urls.length;
}

/** True when every literal of `literals` is stated by `text` (the per-unit literal-retention gate). */
export function retainsLiterals(literals: UnitLiterals, text: string): boolean {
  const other = unitLiterals(text);
  const numbers = new Set(other.numbers);
  const identifiers = new Set(other.identifiers);
  const dates = new Set(other.dates);
  const relative = new Set(other.relativeTimes);
  return literals.numbers.every((n) => numbers.has(n))
    && literals.identifiers.every((id) => identifiers.has(id))
    && literals.dates.every((d) => dates.has(d))
    && literals.relativeTimes.every((r) => relative.has(r))
    && [...literals.paths, ...literals.hashes, ...literals.urls].every((s) => text.includes(s));
}

const CUES: ReadonlyArray<readonly [DiscourseCue, RegExp]> = [
  ['error', /\b(?:error|errors|failed|failure|failing|exception|traceback|fatal|denied|timed? ?out|timeout|panic|refused|crash(?:ed)?|ENOENT|EACCES|EADDRINUSE|ECONNREFUSED|not found|cannot|can't|unable)\b|σφάλμα|απέτυχε|αποτυχία/iu],
  ['decision', /\b(?:decided|decision|we will|we'll|chose|chosen|going with|agreed|must|must not|never|always|do not|don't|should not|instead of|keep .{1,40} (?:off|on)|default (?:off|on))\b|αποφασ|πρέπει|ποτέ|πάντα|μην /iu],
  ['commitment', /\b(?:todo|to do|next step|next:|i will|i'll|will (?:add|fix|run|check|update|push|commit|open|write|report)|follow[- ]up|pending|remaining|blocked|tbd|not yet)\b|θα |εκκρεμ/iu],
  ['status', /\b(?:passed|passing|pass|ok|green|red|done|merged|pushed|committed|shipped|deployed|succeeded|success|complete[ds]?|incomplete)\b/iu],
];

// `(?<!\d)`: start only at the first digit of a run. Without it a long digit
// run (a dump of numbers) is retried from every position -- quadratic, 36 s on
// 200k digits. Matches are unchanged: the leftmost match already began there.
const TEST_COUNTS = /(?<!\d)(\d+)\s+(passed|failed|failing|skipped|pending|todo|errors?|tests?|suites?|files?)\b|\b(pass|fail|skipped|todo|tests|suites)\s+(\d+)\b/giu;
const EXIT_STATUS = /\b(?:exit(?:ed)?(?:\s+with)?(?:\s+(?:code|status))?|exit_code|exitCode|code|status)\s*[:= ]\s*(-?\d{1,3})\b/iu;

function normaliseKey(key: string): string {
  return key.normalize('NFKC').toLocaleLowerCase('und').replace(/[*_`]/gu, '').replace(/\s+/gu, ' ').trim();
}

function sha(text: string, length = 24): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, length);
}

/** Surface normalisation: case, width, markdown emphasis, bullets/numbering and whitespace. Literals are kept. */
export function normaliseUnitText(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/u, '')
    .replace(/[*_`]{1,3}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.;:,]+$/u, '')
    .toLocaleLowerCase('und');
}

/** `lsu:0.1:sha256:<24 hex>` over the normalised unit text. A surface key, never a semantic identity. */
export function unitKey(text: string): string {
  return `${UNIT_KEY_VERSION}:sha256:${sha(normaliseUnitText(text))}`;
}

/** `lkv:0.1:sha256:<24 hex>` over a normalised fact key, scoped by an optional subject (e.g. a tool or document). */
export function factKey(key: string, scope = ''): string {
  return `${FACT_KEY_VERSION}:sha256:${sha(`${normaliseKey(scope)}\u0000${normaliseKey(key)}`)}`;
}

function recordsFor(unit: DiscourseUnit, cues: DiscourseCue[], scope: string): UnitRecord[] {
  const records: UnitRecord[] = [];
  const text = unit.text;
  if (unit.kind === 'kv') {
    const match = KV_LINE.exec(text);
    if (match) {
      const key = match[1]!.trim();
      const value = match[2]!.trim().replace(/\*\*$/u, '').trim();
      if (value && text.includes(value)) records.push({ type: 'kv', key, value, factKey: factKey(key, scope) });
    }
  }
  const counts: Record<string, number> = {};
  for (const match of text.matchAll(TEST_COUNTS)) {
    const label = (match[2] ?? match[3] ?? '').toLowerCase().replace(/s$/u, '').replace(/^failing$/u, 'fail').replace(/^passed$/u, 'pass').replace(/^failed$/u, 'fail');
    const value = Number(match[1] ?? match[4]);
    if (label && Number.isFinite(value) && counts[label] === undefined) counts[label] = value;
  }
  if (Object.keys(counts).length && (counts.pass !== undefined || counts.fail !== undefined || counts.test !== undefined)) {
    records.push({ type: 'test_result', counts });
  }
  const exit = EXIT_STATUS.exec(text);
  if (exit && /exit|code/iu.test(exit[0])) records.push({ type: 'exit_status', code: Number(exit[1]) });
  if (cues.includes('error')) records.push({ type: 'error', text });
  if (cues.includes('decision')) records.push({ type: 'decision', text });
  if (cues.includes('commitment')) records.push({ type: 'commitment', text });
  if (cues.includes('open_item')) records.push({ type: 'open_item', text });
  return records;
}

/** The compact rendering a verified record set may show in place of its unit. */
function renderRecords(records: UnitRecord[]): string | null {
  const parts: string[] = [];
  for (const record of records) {
    if (record.type === 'kv') parts.push(`${record.key}: ${record.value}`);
    else if (record.type === 'test_result') parts.push(`tests ${Object.entries(record.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    else if (record.type === 'exit_status') parts.push(`exit=${record.code}`);
  }
  return parts.length ? parts.join('; ') : null;
}

export interface AnalyzeDiscourseOptions {
  /** Scope for fact keys (e.g. the tool name or session), so `status:` of two tools never collide. */
  scope?: string;
}

export function analyzeDiscourse(source: string, options: AnalyzeDiscourseOptions = {}): DiscourseAnalysis {
  const text = String(source ?? '');
  const scope = options.scope ?? '';
  const units = segmentDiscourse(text);
  const analyses: UnitAnalysis[] = units.map((unit) => {
    const literals = unitLiterals(unit.text);
    const cues: DiscourseCue[] = CUES.filter(([, re]) => re.test(unit.text)).map(([cue]) => cue);
    if (/\?\s*$/u.test(unit.text) || /;\s*$/u.test(unit.text) && /\p{Script=Greek}/u.test(unit.text)) cues.push('open_item');
    const toolScope = unit.parent !== undefined && units[unit.parent]?.kind === 'tool_call'
      ? `${scope}\u0000${units[unit.parent]!.text.replace(/\(.*$/su, '')}`
      : scope;
    const records = recordsFor(unit, cues, toolScope);
    const rendered = renderRecords(records);
    // Per-unit literal gate: the rendering must carry every literal of the unit.
    const recordText = rendered && retainsLiterals(literals, rendered) && rendered.length < unit.text.length ? rendered : null;
    const count = literalCount(literals);
    return {
      unit,
      key: unitKey(unit.text),
      literals,
      literalCount: count,
      cues,
      records,
      recordText,
      abstained: records.length === 0 && count === 0,
    };
  });
  const pick = (predicate: (a: UnitAnalysis) => boolean): number[] => analyses.filter(predicate).map((a) => a.unit.index);
  const facts: DocumentRecord['facts'] = {};
  for (const a of analyses) {
    for (const record of a.records) {
      if (record.type === 'kv') facts[record.factKey] = { key: record.key, value: record.value, unit: a.unit.index };
    }
  }
  const heading = analyses.find((a) => a.unit.kind === 'heading');
  const firstSentence = analyses.find((a) => a.unit.kind === 'sentence' || a.unit.kind === 'list_item');
  return {
    version: DISCOURSE_RECORD_VERSION,
    units: analyses,
    document: {
      version: DISCOURSE_RECORD_VERSION,
      chars: text.length,
      unitCount: analyses.length,
      topic: (heading ?? firstSentence ?? analyses[0])?.unit.index ?? null,
      decisions: pick((a) => a.cues.includes('decision')),
      commitments: pick((a) => a.cues.includes('commitment')),
      openItems: pick((a) => a.cues.includes('open_item')),
      errors: pick((a) => a.cues.includes('error')),
      literalUnits: pick((a) => a.literalCount > 0),
      structuredUnits: pick((a) => a.records.some((r) => r.type === 'kv' || r.type === 'test_result' || r.type === 'exit_status')),
      abstainedUnits: pick((a) => a.abstained),
      facts,
    },
  };
}

/** Check that every unit span reproduces its text and that every kv value is a verbatim slice of its unit. */
export function verifyDiscourseAnalysis(source: string, analysis: DiscourseAnalysis): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const a of analysis.units) {
    if (source.slice(a.unit.start, a.unit.end) !== a.unit.text) issues.push(`unit ${a.unit.index}: span does not reproduce text`);
    for (const record of a.records) {
      if (record.type === 'kv' && !a.unit.text.includes(record.value)) issues.push(`unit ${a.unit.index}: kv value is not a source slice`);
      if ((record.type === 'error' || record.type === 'decision' || record.type === 'commitment' || record.type === 'open_item') && record.text !== a.unit.text) {
        issues.push(`unit ${a.unit.index}: ${record.type} record text is not the unit text`);
      }
    }
    if (a.recordText !== null && !retainsLiterals(a.literals, a.recordText)) issues.push(`unit ${a.unit.index}: record rendering drops a literal`);
  }
  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Cross-message compaction plan

export interface DiscourseMessage {
  id?: string | number | null;
  role: string;
  content: string;
}

export interface DiscourseCompactionOptions {
  /** Messages at the end shown verbatim (the most recent turns). Default 4. */
  keepVerbatimLast?: number;
  /**
   * A recent message longer than this is compacted too, to this budget
   * instead of `maxMessageChars`, so one huge tool dump cannot fill the
   * context. Default 8000 chars; Infinity keeps recent messages verbatim.
   */
  recentMaxChars?: number;
  /** Messages shorter than this are shown verbatim. Default 1500 chars. */
  minChars?: number;
  /** Units longer than this are clipped to `clipChars` unless their records pass the literal gate. Default 600. */
  maxUnitChars?: number;
  clipChars?: number;
  /** At most this many literal spellings are listed after a clipped unit. Default 40. */
  maxClipLiterals?: number;
  /** At most this many literal spellings of omitted units are listed per message. Default 60; 0 lists none. */
  maxOmittedLiterals?: number;
  /** Upper bound for one compacted message; lowest-priority units are omitted first. Default 6000 chars. */
  maxMessageChars?: number;
  /** Optional per-unit semantic identity (e.g. a core-issued lfp:2.1 for a sentence unit). Equal identities dedup. */
  identityOf?: (unit: DiscourseUnit, message: DiscourseMessage) => string | null;
  /** Fact-key scope per message (e.g. its role or origin). */
  scopeOf?: (message: DiscourseMessage) => string;
  /** How a compacted message points back to its source. */
  pointer?: (message: DiscourseMessage) => string;
  /** Analysis provider, e.g. a cache keyed by content; defaults to analyzeDiscourse. */
  analyze?: (content: string, options: AnalyzeDiscourseOptions) => DiscourseAnalysis;
}

export type UnitDisposition = 'kept' | 'record' | 'clipped' | 'duplicate' | 'superseded' | 'omitted';

export interface CompactedMessage {
  id: string | number | null;
  role: string;
  /** Text to show in place of the message. Verbatim when `compacted` is false. */
  content: string;
  compacted: boolean;
  sourceChars: number;
  units: number;
  dispositions: Partial<Record<UnitDisposition, number>>;
}

export interface FactHistoryEntry { key: string; value: string; messageId: string | number | null; unit: number }

export interface DiscourseCompactionPlan {
  version: typeof DISCOURSE_RECORD_VERSION;
  messages: CompactedMessage[];
  /** Per fact key: every distinct value in order, the last one current. */
  factHistory: Record<string, FactHistoryEntry[]>;
  stats: {
    messages: number;
    compactedMessages: number;
    units: number;
    unitsWithRecords: number;
    unitsWithLiterals: number;
    abstainedUnits: number;
    semanticIdentities: number;
    dispositions: Record<UnitDisposition, number>;
    sourceChars: number;
    outputChars: number;
  };
}

/**
 * Literal spellings as written in `text` (paths, hashes, URLs, identifiers,
 * then multi-digit numbers), for showing next to a clipped unit.
 */
export function literalSpellings(text: string): string[] {
  const urls = [...text.matchAll(URL)].map((m) => m[0]);
  const rest = urls.reduce((acc, url) => acc.split(url).join(' '), text);
  const paths = [...rest.matchAll(PATH)].map((m) => m[0]).filter((p) => p.length > 2 && !/^\/\d+$/u.test(p));
  const hashes = [...rest.matchAll(HASH)].map((m) => m[0]);
  const ids = [...rest.matchAll(/(?<![\p{L}\p{N}])\p{L}{1,6}-\d+(?![\p{L}\p{N}])/gu)].map((m) => m[0]);
  const numbers = [...rest.matchAll(/(?<![\w.])\d[\d,.:]*\d(?![\w])/gu)].map((m) => m[0].replace(/[.,:]$/u, ''));
  return uniq([...paths, ...urls, ...hashes, ...ids, ...numbers]);
}

/** Every literal of `a` is also a literal of `b`. */
export function literalsCoveredBy(a: UnitLiterals, b: UnitLiterals): boolean {
  const has = <T>(xs: T[], ys: T[]): boolean => xs.every((x) => ys.includes(x));
  return has(a.numbers, b.numbers) && has(a.identifiers, b.identifiers) && has(a.dates, b.dates)
    && has(a.relativeTimes, b.relativeTimes) && has(a.paths, b.paths) && has(a.hashes, b.hashes) && has(a.urls, b.urls);
}

const PRIORITY_CUES: DiscourseCue[] = ['error', 'decision', 'commitment', 'open_item'];

function priorityOf(a: UnitAnalysis, isTopic: boolean): number {
  if (isTopic) return 0;
  // Underscore-prefixed keys are internal metadata (`_verification.*`): shown last.
  if (a.unit.kind === 'kv' && /^\s*(?:[-*+•]\s+)?_/u.test(a.unit.text)) return 6;
  if (a.unit.kind === 'heading') return 1;
  if (a.cues.some((cue) => PRIORITY_CUES.includes(cue))) return 2;
  if (a.recordText !== null || a.records.some((r) => r.type !== 'error')) return 3;
  if (a.literalCount > 0) return 4;
  return 5;
}

/**
 * Plan how an ordered message list can be shown more compactly, newest
 * messages first: the last `keepVerbatimLast` messages stay verbatim; older
 * long messages become their units, where a unit is dropped as a duplicate
 * when the same unit key (or the same issued semantic identity, literals
 * covered) is shown in a newer message, a key/value unit is marked superseded
 * when a newer message states a different value for the same fact key (its
 * value stays in `factHistory`), a unit whose records pass the literal gate
 * is shown as its record, an over-long unit is clipped, and narrative units
 * without literals or cues are omitted first when the message is over budget.
 * Every compacted message names its source through `pointer`.
 */
export function planDiscourseCompaction(messages: DiscourseMessage[], options: DiscourseCompactionOptions = {}): DiscourseCompactionPlan {
  const keepLast = Math.max(0, options.keepVerbatimLast ?? 4);
  const minChars = options.minChars ?? 1500;
  const maxUnitChars = options.maxUnitChars ?? 600;
  const clipChars = Math.min(options.clipChars ?? 240, maxUnitChars);
  const maxMessageChars = options.maxMessageChars ?? 6000;
  const maxClipLiterals = options.maxClipLiterals ?? 40;
  const recentMaxChars = options.recentMaxChars ?? 8000;
  const maxOmittedLiterals = options.maxOmittedLiterals ?? 60;
  const pointer = options.pointer ?? ((m: DiscourseMessage) => (m.id != null ? `source: message ${m.id}` : 'source: original message'));
  const scopeOf = options.scopeOf ?? (() => '');
  const rows = Array.isArray(messages) ? messages : [];
  const dispositions: Record<UnitDisposition, number> = { kept: 0, record: 0, clipped: 0, duplicate: 0, superseded: 0, omitted: 0 };
  const stats: DiscourseCompactionPlan['stats'] = {
    messages: rows.length, compactedMessages: 0, units: 0, unitsWithRecords: 0, unitsWithLiterals: 0, abstainedUnits: 0,
    semanticIdentities: 0, dispositions, sourceChars: 0, outputChars: 0,
  };
  const seenKeys = new Set<string>();
  const seenIdentities = new Map<string, UnitLiterals[]>();
  const latestFact = new Map<string, string>();
  const factHistory: Record<string, FactHistoryEntry[]> = {};
  const out: CompactedMessage[] = new Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const message = rows[i]!;
    const content = String(message.content ?? '');
    stats.sourceChars += content.length;
    const analysis = (options.analyze ?? analyzeDiscourse)(content, { scope: scopeOf(message) });
    const recent = i >= rows.length - keepLast;
    const verbatim = content.length < minChars || (recent && content.length <= recentMaxChars);
    const budget = recent ? recentMaxChars : maxMessageChars;
    stats.units += analysis.units.length;
    for (const a of analysis.units) {
      if (a.records.length) stats.unitsWithRecords += 1;
      if (a.literalCount) stats.unitsWithLiterals += 1;
      if (a.abstained) stats.abstainedUnits += 1;
    }
    const identities = options.identityOf ? analysis.units.map((a) => options.identityOf!(a.unit, message)) : analysis.units.map(() => null);
    stats.semanticIdentities += identities.filter(Boolean).length;
    const factRecords = analysis.units.flatMap((a) => a.records.filter((r): r is Extract<UnitRecord, { type: 'kv' }> => r.type === 'kv').map((r) => ({ a, r })));
    for (const { a, r } of factRecords) {
      const history = (factHistory[r.factKey] ||= []);
      if (!history.some((h) => h.value === r.value)) history.unshift({ key: r.key, value: r.value, messageId: message.id ?? null, unit: a.unit.index });
    }
    if (verbatim) {
      out[i] = { id: message.id ?? null, role: message.role, content, compacted: false, sourceChars: content.length, units: analysis.units.length, dispositions: {} };
      stats.outputChars += content.length;
      for (const a of analysis.units) seenKeys.add(a.key);
      analysis.units.forEach((a, k) => { const id = identities[k]; if (id) seenIdentities.set(id, [...(seenIdentities.get(id) ?? []), a.literals]); });
      for (const { r } of factRecords) if (!latestFact.has(r.factKey)) latestFact.set(r.factKey, r.value);
      continue;
    }
    const local: Partial<Record<UnitDisposition, number>> = {};
    const count = (d: UnitDisposition): void => { local[d] = (local[d] ?? 0) + 1; dispositions[d] += 1; };
    type Piece = { index: number; text: string; priority: number; disposition: UnitDisposition };
    const pieces: Piece[] = [];
    const localKeys = new Set<string>();
    analysis.units.forEach((a, k) => {
      const identity = identities[k];
      if (seenKeys.has(a.key) || localKeys.has(a.key)) { count('duplicate'); return; }
      if (identity && (seenIdentities.get(identity) ?? []).some((lits) => literalsCoveredBy(a.literals, lits))) {
        count('duplicate'); return;
      }
      localKeys.add(a.key);
      const kv = a.records.find((r): r is Extract<UnitRecord, { type: 'kv' }> => r.type === 'kv');
      if (kv && latestFact.has(kv.factKey) && latestFact.get(kv.factKey) !== kv.value) {
        // A newer message states another value: show the old one compactly as history.
        pieces.push({ index: k, text: `${kv.key}: ${kv.value} (superseded)`, priority: 4, disposition: 'superseded' });
        return;
      }
      const priority = priorityOf(a, k === analysis.document.topic);
      if (a.recordText !== null && a.unit.text.length > maxUnitChars) {
        pieces.push({ index: k, text: a.recordText, priority, disposition: 'record' });
      } else if (a.unit.text.length > maxUnitChars) {
        // Clip, but keep every literal of the unit that the kept head does not state.
        const head = a.unit.text.slice(0, clipChars).trimEnd();
        const rest = literalSpellings(a.unit.text).filter((literal) => !head.includes(literal));
        const shownLiterals = rest.slice(0, maxClipLiterals);
        const restText = rest.length
          ? `; literals: ${shownLiterals.join(', ')}${rest.length > shownLiterals.length ? ` (+${rest.length - shownLiterals.length} more)` : ''}`
          : '';
        pieces.push({ index: k, text: `${head} …[+${a.unit.text.length - head.length} chars${restText}]`, priority, disposition: 'clipped' });
      } else {
        pieces.push({ index: k, text: a.unit.text, priority, disposition: 'kept' });
      }
    });
    // Over budget: drop lowest-priority pieces (narrative first), later units before earlier ones.
    let total = pieces.reduce((n, p) => n + p.text.length + 1, 0);
    const ranked = [...pieces].sort((x, y) => y.priority - x.priority || y.index - x.index);
    const omitted = new Set<number>();
    for (const piece of ranked) {
      if (total <= budget || piece.priority === 0) break;
      omitted.add(piece.index); total -= piece.text.length + 1;
    }
    const shown = pieces.filter((p) => !omitted.has(p.index));
    for (const p of shown) count(p.disposition);
    for (let n = 0; n < omitted.size; n += 1) count('omitted');
    const summary = Object.entries(local).filter(([d]) => d !== 'kept').map(([d, n]) => `${n} ${d}`).join(', ');
    const header = `[compacted: ${analysis.units.length} units${summary ? `; ${summary}` : ''}; ${pointer(message)}]`;
    let body = shown.map((p) => p.text).join('\n');
    if (omitted.size && maxOmittedLiterals > 0) {
      // Omitted units still name their literals, so a reader can tell what to fetch.
      const missing = uniq([...omitted].sort((x, y) => x - y).flatMap((k) => literalSpellings(analysis.units[k]!.unit.text)))
        .filter((literal) => !body.includes(literal));
      const listed = missing.slice(0, maxOmittedLiterals);
      if (listed.length) body += `\n[omitted units mention: ${listed.join(', ')}${missing.length > listed.length ? ` (+${missing.length - listed.length} more)` : ''}]`;
    }
    const compactedContent = `${header}\n${body}`.trimEnd();
    const useCompacted = compactedContent.length < content.length;
    out[i] = {
      id: message.id ?? null,
      role: message.role,
      content: useCompacted ? compactedContent : content,
      compacted: useCompacted,
      sourceChars: content.length,
      units: analysis.units.length,
      dispositions: useCompacted ? local : {},
    };
    if (useCompacted) stats.compactedMessages += 1;
    stats.outputChars += out[i]!.content.length;
    for (const p of (useCompacted ? shown : pieces)) seenKeys.add(analysis.units[p.index]!.key);
    analysis.units.forEach((a, k) => { const id = identities[k]; if (id) seenIdentities.set(id, [...(seenIdentities.get(id) ?? []), a.literals]); });
    for (const { r } of factRecords) if (!latestFact.has(r.factKey)) latestFact.set(r.factKey, r.value);
  }
  return { version: DISCOURSE_RECORD_VERSION, messages: out, factHistory, stats };
}
