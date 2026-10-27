/**
 * Guarded lossy codec: the deterministic verifier (experiments/guarded-codec-v1).
 *
 * A compressor (any: a token pruner, a summariser, discourse compaction) returns,
 * for every unit of the source, either a KEPT view (possibly shortened) or OMITTED
 * with a pointer. This module does not compress; it checks that a compression kept
 * what must never be dropped, and that every omission can be undone exactly:
 *
 * - kept units keep every literal spelling of their source unit (paths, hashes,
 *   URLs, identifiers, multi-digit numbers: core `literalSpellings`) and every
 *   number as a value, digits or number words ("three" = "3"), counted;
 * - kept units keep the same negation and modality markers (necessity, possibility,
 *   future) as their source unit, by the closed EN/EL lists of the pivot adapter;
 *   a language without lists fails closed;
 * - omitted units carry a pointer whose expansion is the exact source unit
 *   (SHA-256 of the source text).
 *
 * Anything the verifier cannot check is a violation, never a pass.
 */
import { createHash } from 'node:crypto';
import { literalSpellings, numbersInText } from '@corpunum/lunum';
import { pivotMarkers } from './pivot-adapter.js';

export const GUARDED_CODEC_VERSION = 'lunum-guarded-codec/0.1' as const;

export interface CodecUnit {
  id: string;
  /** Exact source text of the unit. */
  source: string;
  /** Shortened or verbatim text shown to the model; null when the unit is omitted. */
  view: string | null;
  /** For omitted units: the pointer the engine expands, and the SHA-256 of the source it promises. */
  pointer?: { ref: string; sha256: string } | null;
}

export type CodecViolation =
  | { unit: string; kind: 'literal_dropped'; missing: string[] }
  | { unit: string; kind: 'marker_changed'; marker: 'negation' | 'necessity' | 'possibility' | 'future'; source: boolean; view: boolean }
  | { unit: string; kind: 'language_unsupported'; language: string }
  | { unit: string; kind: 'omitted_without_pointer' }
  | { unit: string; kind: 'pointer_mismatch' };

export interface CodecVerification {
  version: typeof GUARDED_CODEC_VERSION;
  ok: boolean;
  units: number;
  kept: number;
  omitted: number;
  sourceChars: number;
  viewChars: number;
  violations: CodecViolation[];
}

export const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const counts = (xs: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

/** Check one compression of `language` text against its source units. */
export function verifyCompaction(units: readonly CodecUnit[], language: string): CodecVerification {
  const violations: CodecViolation[] = [];
  let kept = 0, omitted = 0, sourceChars = 0, viewChars = 0;
  for (const unit of units) {
    sourceChars += unit.source.length;
    if (unit.view === null) {
      omitted += 1;
      if (!unit.pointer) violations.push({ unit: unit.id, kind: 'omitted_without_pointer' });
      else if (unit.pointer.sha256 !== sha256Text(unit.source)) violations.push({ unit: unit.id, kind: 'pointer_mismatch' });
      continue;
    }
    kept += 1;
    viewChars += unit.view.length;
    const missing: string[] = [];
    const have = counts(literalSpellings(unit.view));
    for (const [literal, n] of counts(literalSpellings(unit.source))) if ((have.get(literal) ?? 0) < n) missing.push(literal);
    const values = (text: string) => numbersInText(text).map(String); // digits and EN/EL number words, as values
    const haveValues = counts(values(unit.view));
    for (const [value, n] of counts(values(unit.source))) if ((haveValues.get(value) ?? 0) < n && !missing.includes(value)) missing.push(value);
    if (missing.length) violations.push({ unit: unit.id, kind: 'literal_dropped', missing });
    const before = pivotMarkers(unit.source, language);
    const after = pivotMarkers(unit.view, language);
    if (!before || !after) { violations.push({ unit: unit.id, kind: 'language_unsupported', language }); continue; }
    for (const marker of ['negation', 'necessity', 'possibility', 'future'] as const) {
      if (before[marker] !== after[marker]) violations.push({ unit: unit.id, kind: 'marker_changed', marker, source: before[marker], view: after[marker] });
    }
  }
  return { version: GUARDED_CODEC_VERSION, ok: violations.length === 0, units: units.length, kept, omitted, sourceChars, viewChars, violations };
}

/** Expand a verified compression back to the exact source, given the engine's store of pointed units. */
export function expandCompaction(units: readonly CodecUnit[], store: (ref: string) => string | undefined): string[] {
  return units.map((unit) => {
    if (unit.view !== null) return unit.source;
    const text = unit.pointer ? store(unit.pointer.ref) : undefined;
    if (text === undefined || sha256Text(text) !== unit.pointer?.sha256) throw new Error(`unexpandable_unit:${unit.id}`);
    return text;
  });
}
