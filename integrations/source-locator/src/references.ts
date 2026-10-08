/**
 * Deterministic extraction of literal references that a source locator can
 * check: paths, file names, code identifiers, dotted config keys and semantic
 * versions. Pure, offline, no model. Commit hashes, numbers, dates and URLs are
 * not extracted: a file index cannot ground them.
 */
import type { Reference, ReferenceKind } from './types.js';

export const REFERENCE_EXTRACTOR_VERSION = 'lunum-refs/0.2' as const;

export const FILE_EXTENSIONS = [
  'mjs', 'cjs', 'js', 'ts', 'tsx', 'jsx', 'json', 'jsonl', 'md', 'py', 'rs', 'go', 'sh', 'yaml', 'yml', 'toml',
  'sql', 'db', 'log', 'txt', 'css', 'html', 'gguf', 'service', 'ini', 'cfg', 'conf', 'lock', 'csv', 'c', 'h',
  'cpp', 'hpp', 'java', 'kt', 'swift', 'rb', 'php', 'lua', 'xml', 'svg', 'env', 'safetensors', 'onnx', 'patch',
] as const;

const EXT = FILE_EXTENSIONS.join('|');
const URL_RE = /\bhttps?:\/\/[^\s<>()"'`]+[^\s<>()"'`.,;:!?]/gu;
// Absolute, home- or dot-relative paths; relative paths with a file extension;
// extension-less relative paths only under a conventional source directory or
// with a trailing slash. Prose slash-lists ("build/test/deploy") were the
// largest noise class in the v1 measurement (experiments/source-locator-v1).
const CODE_DIRS = 'src|lib|bin|test|tests|spec|scripts|packages|apps|crates|docs|examples|tools|config|configs|public|assets|internal|cmd|pkg|\\.github';
const PATH_RE = new RegExp(
  [
    String.raw`(?<![\w/.:~@-])(?:~|\.{1,2})?\/(?:[\w.@+-]+\/)*[\w.@+-]+\/?`,
    String.raw`(?<![\w/.~@-])[\w@.-]+(?:\/[\w.@+-]+)+\.[A-Za-z0-9]{1,12}(?![\w/])`,
    String.raw`(?<![\w/.~@-])(?:${CODE_DIRS})(?:\/[A-Za-z_][\w.-]*)+\/?(?![\w/])`,
    String.raw`(?<![\w/.~@-])[A-Za-z_][\w.-]*(?:\/[A-Za-z_][\w.-]*)*\/(?![\w/])`,
  ].join('|'),
  'gu',
);
// Elided ("pages/abc-...html", "src/…/x.ts") or diff-prefixed ("a/src/x.ts") spellings.
const ELIDED = /\.{3}|…/u;
const FILE_RE = new RegExp(String.raw`(?<![\w/.@-])[\w-]+(?:\.[\w-]+)*\.(?:${EXT})(?![\w/-])`, 'gu');
const VERSION_RE = /(?<![\w.\/-])v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?(?![\w.]*\d)/gu;
const DOTTED_RE = /(?<![\w./-])[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+(?![\w/-])/gu;
const CAMEL_RE = /(?<![\w.-])(?:[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)(?![\w-])/gu;
const SNAKE_RE = /(?<![\w.-])[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+(?![\w-])/gu;
const CALL_RE = /(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\(/gu;

const TLDS = new Set(['com', 'org', 'net', 'io', 'ai', 'dev', 'app', 'gr', 'eu', 'co', 'uk', 'de', 'gov', 'edu']);
const EXT_SET = new Set<string>(FILE_EXTENSIONS);

export interface ExtractReferencesOptions {
  /** Minimum identifier length (default 6). */
  minIdentifierLength?: number;
  /** Maximum references returned (default 200). */
  maxReferences?: number;
  /** Kinds to return (default all). */
  kinds?: readonly ReferenceKind[];
}

function mask(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

function codeLike(name: string): boolean {
  return /[a-z][A-Z]/u.test(name) || /[A-Za-z0-9]_[A-Za-z0-9]/u.test(name);
}

/**
 * References in `text`, in source order, with exact offsets. Each span is
 * claimed by the first rule that matches it (URLs, then paths, files,
 * versions, dotted keys, identifiers), so spans never overlap.
 */
export function extractReferences(text: string, options: ExtractReferencesOptions = {}): Reference[] {
  const source = String(text ?? '');
  const minId = options.minIdentifierLength ?? 6;
  const max = options.maxReferences ?? 200;
  const kinds = new Set<ReferenceKind>(options.kinds ?? ['path', 'file', 'identifier', 'config_key', 'version']);
  const found: Reference[] = [];
  let rest = source;
  const claim = (re: RegExp, accept: (m: RegExpMatchArray) => { kind: ReferenceKind; start: number; end: number } | null): void => {
    const hits: Array<{ kind: ReferenceKind; start: number; end: number; mStart: number; mEnd: number }> = [];
    for (const m of rest.matchAll(re)) {
      const start = m.index ?? 0;
      const ref = accept(m);
      if (ref) hits.push({ ...ref, mStart: start, mEnd: start + m[0].length });
    }
    for (const hit of hits) {
      rest = mask(rest, hit.mStart, hit.mEnd);
      if (kinds.has(hit.kind)) found.push({ kind: hit.kind, text: source.slice(hit.start, hit.end), start: hit.start, end: hit.end });
    }
  };

  // URLs are masked, never returned.
  claim(URL_RE, () => null);
  claim(PATH_RE, (m) => {
    let value = m[0];
    let start = m.index ?? 0;
    value = value.replace(/[.,;:]+$/u, '');
    if (value.length <= 2 || !/[A-Za-z]/u.test(value) || /^\/\d+$/u.test(value)) return null;
    if (ELIDED.test(value) || ELIDED.test(source.slice(start + value.length, start + value.length + 3))
      || /(?:\.\.\.|…)$/u.test(source.slice(Math.max(0, start - 3), start))) return null;
    // git diff headers: `a/src/x.ts` / `b/src/x.ts` name `src/x.ts`.
    if (/^[ab]\/[\w.@-]+\//u.test(value) && /(?:^|\n)(?:diff --git|---|\+\+\+) |\bdiff --git\b/u.test(source)) {
      start += 2;
      value = value.slice(2);
    }
    return { kind: 'path', start, end: start + value.length };
  });
  claim(FILE_RE, (m) => {
    const start = m.index ?? 0;
    const value = m[0];
    const stem = value.slice(0, value.lastIndexOf('.'));
    if (!/[A-Za-z]/u.test(stem) || stem.length < 2) return null;
    return { kind: 'file', start, end: start + value.length };
  });
  claim(VERSION_RE, (m) => {
    const start = m.index ?? 0;
    return { kind: 'version', start, end: start + m[0].length };
  });
  claim(DOTTED_RE, (m) => {
    const start = m.index ?? 0;
    const value = m[0];
    const segments = value.split('.');
    const last = segments[segments.length - 1] ?? '';
    if (segments.some((s) => s.length < 2)) return null;
    if (EXT_SET.has(last.toLowerCase()) || TLDS.has(last.toLowerCase())) return null;
    // A method call `a.b.c(`: the callee name is the reference.
    if (source[start + value.length] === '(') {
      if (last.length < minId) return null;
      return { kind: 'identifier', start: start + value.length - last.length, end: start + value.length };
    }
    if (segments.length < 3 && !segments.some(codeLike)) return null;
    return { kind: 'config_key', start, end: start + value.length };
  });
  claim(CALL_RE, (m) => {
    const name = m[1] ?? '';
    const start = m.index ?? 0;
    if (name.length < minId) return null;
    return { kind: 'identifier', start, end: start + name.length };
  });
  for (const re of [CAMEL_RE, SNAKE_RE]) {
    claim(re, (m) => {
      const start = m.index ?? 0;
      if (m[0].length < minId) return null;
      return { kind: 'identifier', start, end: start + m[0].length };
    });
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  return found.slice(0, max);
}

/** Distinct (kind, text) pairs, first occurrence order. */
export function distinctReferences(references: readonly Reference[]): Reference[] {
  const seen = new Set<string>();
  const out: Reference[] = [];
  for (const ref of references) {
    const key = `${ref.kind}\u0000${ref.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
