// Deterministic "facts appendix" builder: transcript -> bullet facts under a hard character cap.
// No LLM, no network. Pure functions; the CLI wrapper is bin/lunum-handoff-appendix.ts.

export interface AppendixMessage { role: string; content: string }
export interface AppendixResult {
  text: string;
  stats: { source: string; messages: number; lines: number; bullets: Record<string, number>; chars: number; tokens: number; maxTokens: number; redactions: number };
}

const SECTIONS = ['Decisions', 'Open items', 'Numbers and ids', 'Paths', 'Pending'] as const;
type Section = (typeof SECTIONS)[number];
const QUOTA: Record<Section, number> = { Decisions: 0.30, 'Open items': 0.22, 'Numbers and ids': 0.20, Paths: 0.10, Pending: 0.18 };

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\b(?:api[_-]?key|token|secret|passw(?:or)?d|authorization)\s*[=:]\s*\S+/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi,
];
const LONG_OPAQUE = /\b[A-Za-z0-9_-]{32,}\b/g;

export function redact(input: string): { text: string; count: number } {
  let count = 0;
  let text = input;
  const sub = () => { count++; return '[REDACTED]'; };
  for (const re of SECRET_PATTERNS) text = text.replace(re, sub);
  text = text.replace(LONG_OPAQUE, (m) => {
    if (/^[0-9a-f-]+$/i.test(m)) return m; // uuid / git sha / hex digest
    return /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m) ? sub() : m;
  });
  return { text, count };
}

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && typeof b === 'object' && (b as { type?: string }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : '')).filter(Boolean).join('\n');
}

/** Parse Claude Code jsonl or a JSON messages array (or {messages:[...]}). */
export function parseTranscript(raw: string): AppendixMessage[] {
  const trimmed = raw.trim();
  const out: AppendixMessage[] = [];
  let rows: unknown[] | null = null;
  if (trimmed.startsWith('[')) rows = JSON.parse(trimmed) as unknown[];
  else if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
    const one = JSON.parse(trimmed) as { messages?: unknown[] };
    rows = Array.isArray(one.messages) ? one.messages : [one];
  } else {
    rows = [];
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* skip malformed line */ }
    }
    const first = rows[0] as { messages?: unknown[] } | undefined;
    if (rows.length === 1 && first && Array.isArray(first.messages)) rows = first.messages;
  }
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (o.isMeta === true || o.isSidechain === true) continue;
    const m = (o.message && typeof o.message === 'object' ? o.message : o) as Record<string, unknown>;
    if (typeof o.type === 'string' && o.type !== 'user' && o.type !== 'assistant') continue; // skip attachments, api-request-blob, etc.
    const role = String(m.role ?? o.type ?? '');
    if (role !== 'user' && role !== 'assistant') continue;
    let text = blockText(m.content)
      .replace(/<system-reminder[^>]*>[\s\S]*?<\/system-reminder>/g, '')
      .replace(/<(command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g, '');
    text = text.trim();
    if (text) out.push({ role, content: text });
  }
  return out;
}

const PENDING = /\b(cancel(?:l?ed|l?ing)?|scheduled?|reminder|deadline|due (?:on|by|at)|paused|resume[sd]? (?:on|at)|until \d|will (?:run|fire|start|resume)|cron|postponed|deferred|on hold|waiting (?:for|on)|blocked (?:on|by))\b/i;
const DECISION = /\b(decided|decision|agreed|approved|chose|chosen|going with|we(?:'ll| will) (?:use|go|ship|keep|drop|use)|switch(?:ed|ing)? to|settled on|confirmed|owner (?:said|wants|asked|confirmed|approved)|rule:|policy:|root cause|fixed by|resolved|approved|rejected|dropped|keep|owner (?:rule|order))\b/i;
const OPEN = /\b(todo|to-do|open (?:question|item|issue)|still (?:need|to|open|missing)|need(?:s)? to|next step|follow[- ]?up|remaining|not yet|unresolved|please (?:do|check|send|confirm|make|add|run|fix|write|review)|can you|could you|should we|action item|must be done)\b/i;
const ID_RE = /\b(?:[a-z][a-z0-9]{1,}-\d{1,6}|\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?|\d{1,2}:\d{2}(?::\d{2})?\s?(?:Z|UTC|EET|EEST)?|#\d{1,6}|v\d+\.\d+(?:\.\d+)?|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d[\d,.]*\s?(?:%|ms|s|min|mins|h|hours?|k|M|MB|GB|KB|tokens?|chars?|files?|tests?|msgs?|messages?|workers?|sessions?|commits?|lines?|bytes))\b/gi;
const HASH_RE = /\b[0-9a-f]{7,40}\b/g;
const PATH_RE = /(?<![\w:/.-])(?:~|\.{1,2})?(?:\/[\w.@+=-]+){2,}\/?/g;
const HAS_PATH = /(?<![\w:/.-])(?:~|\.{1,2})?(?:\/[\w.@+=-]+){2,}/;

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

function hasHash(s: string): boolean {
  for (const m of s.match(HASH_RE) ?? []) if (/\d/.test(m) && /[a-f]/.test(m)) return true;
  return false;
}

function cleanLine(l: string): string {
  return l.replace(/^[\s>*#\-+•]+(\[[ xX]\]\s*)?/, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
}
function clip(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 3).trimEnd() + '...'; }
function key(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90); }

interface Cand { section: Section; text: string; score: number; order: number }

export function buildAppendix(messages: AppendixMessage[], opts: { source: string; maxTokens?: number; now?: Date }): AppendixResult {
  const maxTokens = opts.maxTokens ?? 3500;
  const maxChars = maxTokens * 4; // enforced on UTF-8 bytes (never smaller than chars)
  let redactions = 0;
  const cands: Cand[] = [];
  const pathCount = new Map<string, { n: number; last: number }>();
  const seen = new Set<string>();
  let lineCount = 0;
  let order = 0;

  messages.forEach((msg, mi) => {
    const red = redact(msg.content);
    redactions += red.count;
    const recency = messages.length > 1 ? mi / (messages.length - 1) : 1;
    let fence = false;
    for (const rawLine of red.text.split('\n')) {
      if (/^\s*```/.test(rawLine)) { fence = !fence; continue; }
      if (fence) continue;
      const line = cleanLine(rawLine);
      if (line.length < 12) continue;
      const alnum = (line.match(/[A-Za-z0-9]/g) ?? []).length;
      if (alnum / line.length < 0.55) continue;
      lineCount++;
      for (const p of line.match(PATH_RE) ?? []) {
        const pp = p.replace(/[.,;:)]+$/, '');
        if (pp.length < 6 || pp.length > 160 || /^\/(?:tmp|proc|dev|usr|var|etc)\b/.test(pp) || /\/\d+\.\d+/.test(pp)) continue;
        const e = pathCount.get(pp) ?? { n: 0, last: 0 };
        e.n++; e.last = mi; pathCount.set(pp, e);
      }
      for (const sentence of line.length > 260 ? line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/) : [line]) {
        const s = sentence.trim();
        if (s.length < 12) continue;
        const idHits = (s.match(ID_RE) ?? []).length + (hasHash(s) ? 1 : 0);
        let section: Section | null = null;
        let w = 0;
        if (PENDING.test(s)) { section = 'Pending'; w = 3; }
        else if (DECISION.test(s)) { section = 'Decisions'; w = 3; }
        else if (OPEN.test(s) || (msg.role === 'user' && s.endsWith('?'))) { section = 'Open items'; w = 2.5; }
        else if (idHits >= 1) { section = 'Numbers and ids'; w = 1; }
        if (!section) continue;
        const k = key(s);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        const score = w + (section === 'Decisions' && idHits === 0 && !HAS_PATH.test(s) ? -1.5 : 0) + Math.min(idHits, 4) * 0.6 + recency * 2 + (msg.role === 'user' ? 1 : 0) - s.length / 400;
        cands.push({ section, text: clip(s, 220), score, order: order++ });
      }
    }
  });

  const allPaths = [...pathCount.keys()];
  for (const [p, e] of pathCount) {
    if (allPaths.some((q) => q !== p && q.endsWith(p))) continue; // suffix of a longer path
    cands.push({ section: 'Paths', text: e.n > 1 ? `${p} (x${e.n})` : p, score: Math.min(e.n, 5) * 0.8 + (e.last / Math.max(messages.length, 1)) * 2, order: order++ });
  }

  const render = (picked: Cand[], tokens: number): string => {
    const head = [`source: ${opts.source} (${messages.length} messages)`, `generated: ${(opts.now ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')}`, `tokens: ~${tokens} (cap ${maxTokens})`];
    const body: string[] = [];
    for (const s of SECTIONS) {
      const items = picked.filter((c) => c.section === s).sort((a, b) => a.order - b.order);
      if (!items.length) continue;
      body.push('', `## ${s}`, ...items.map((c) => `- ${c.text}`));
    }
    return head.concat(body).join('\n') + '\n';
  };

  // Budget: reserve the header (generous token digits) plus section titles, then fill per quota, then spill.
  const reserve = bytes(render([], 99999)) + SECTIONS.reduce((n, s) => n + s.length + 5, 0);
  const budget = Math.max(0, maxChars - reserve);
  const picked: Cand[] = [];
  const bySection = new Map<Section, Cand[]>();
  for (const s of SECTIONS) bySection.set(s, cands.filter((c) => c.section === s).sort((a, b) => b.score - a.score));
  const used: Record<string, number> = {};
  let total = 0;
  const cost = (c: Cand) => bytes(c.text) + 3;
  const leftovers: Cand[] = [];
  for (const s of SECTIONS) {
    const cap = budget * QUOTA[s];
    used[s] = 0;
    for (const c of bySection.get(s)!) {
      if (used[s] + cost(c) <= cap && total + cost(c) <= budget) { picked.push(c); used[s] += cost(c); total += cost(c); }
      else leftovers.push(c);
    }
  }
  for (const c of leftovers.sort((a, b) => b.score - a.score)) {
    if (total + cost(c) <= budget) { picked.push(c); total += cost(c); }
  }

  let text = render(picked, 0);
  text = render(picked, Math.ceil(bytes(text) / 4));
  while (bytes(text) > maxChars && picked.length) { // hard cap, defensive
    picked.sort((a, b) => a.score - b.score).shift();
    text = render(picked, Math.ceil(bytes(text) / 4));
  }
  while (bytes(text) > maxChars) text = text.slice(0, -1);
  const bullets: Record<string, number> = {};
  for (const s of SECTIONS) bullets[s] = picked.filter((c) => c.section === s).length;
  return { text, stats: { source: opts.source, messages: messages.length, lines: lineCount, bullets, chars: bytes(text), tokens: Math.ceil(bytes(text) / 4), maxTokens, redactions } };
}
