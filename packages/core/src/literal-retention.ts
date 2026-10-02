/**
 * Source literal retention (decisions/0016).
 *
 * A candidate that silently drops a number or identifier stated in its source
 * ("approve invoices under 5,000 euros" -> theme: invoices) must not receive
 * an exact identity: the identity would claim a broader meaning than the
 * source. This check is language-neutral: it compares digit-bearing tokens,
 * not words. Number words ("seven") are not checked.
 */
import type { LunumSem, LunumTerm, LunumClause } from './types.js';

export interface LiteralRetentionResult {
  retained: boolean;
  sourceNumbers: number[];
  sourceIdentifiers: string[];
  /** Unambiguous full calendar dates, compared separately from quantity numbers. */
  sourceDates: string[];
  missingNumbers: number[];
  missingIdentifiers: string[];
  missingDates: string[];
}

// Identifier-like tokens: letters, hyphen, digits (B-11, AC-3, ENV-5, U-31).
const IDENTIFIER = /(?<![\p{L}\p{N}])\p{L}{1,6}-\d+(?![\p{L}\p{N}])/gu;
// Numbers: thousands grouping by "," or "." followed by exactly 3 digits, with
// an optional decimal part in the other separator ("15,750.00", "2.000,5").
const NUMBER = /\d+(?:,\d{3})+(?:\.\d+)?(?!\d)|\d+(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?/gu;
// 12-hour clock times; rewritten to 24-hour before numbers are read, so that
// "2:00 PM" matches a candidate time "14:00".
const CLOCK_12H = /(?<!\d)(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s?[Mm]\.?(?![\p{L}])/gu;
// Only complete date-like tokens. A final sentence period is permitted, but
// identifiers, paths and longer dotted numeric strings are not date spans.
const FULL_DATE = /(?<![\p{L}\p{M}\p{N}_/.\-])(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})(?![\p{L}\p{M}\p{N}_/\-]|[.,]\d)/gu;
// Instance-bearing fields of lfp:2.1. A controlled type symbol and evidence
// cannot satisfy a source literal. This does not validate or reinterpret a term.
const SEMANTIC_LITERAL_FIELDS = ['id', 'ref', 'value', 'unit', 'min', 'max', 'format'] as const;

function validIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]!) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function canonicalDate(token: string): string | null {
  if (token.includes('-')) {
    const [year, month, day] = token.split('-').map(Number) as [number, number, number];
    return validIsoDate(year, month, day);
  }
  const [day, month, year] = token.split('.').map(Number) as [number, number, number];
  // No locale guessing: e.g. 05.11.2026 could be May 11 or November 5.
  return day > 12 ? validIsoDate(year, month, day) : null;
}

function separateDates(text: string): { text: string; dates: string[] } {
  const dates: string[] = [];
  const rest = text.replace(FULL_DATE, token => {
    const date = canonicalDate(token);
    if (date === null) return token;
    dates.push(date);
    return ' ';
  });
  return { text: rest, dates };
}

/** Strict ISO or calendar-valid dotted day>12 dates; never inferred locale. */
export function datesInText(text: string): string[] {
  return separateDates(text).dates;
}

function toNumber(raw: string): number {
  if (/^\d+(?:,\d{3})+(?:\.\d+)?$/u.test(raw)) return Number(raw.replace(/,/gu, ''));
  if (/^\d+(?:\.\d{3})+(?:,\d+)?$/u.test(raw)) return Number(raw.replace(/\./gu, '').replace(',', '.'));
  return Number(raw.replace(',', '.'));
}

function to24Hour(text: string): string {
  return text.replace(CLOCK_12H, (_match, hour: string, minute: string | undefined, half: string) => {
    const h = Number(hour) % 12 + (half.toLowerCase() === 'p' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${minute ?? '00'}`;
  });
}

export function numbersInText(text: string): number[] {
  const withoutIds = to24Hour(text).replace(IDENTIFIER, ' ');
  return [...withoutIds.matchAll(NUMBER)].map((match) => toNumber(match[0])).filter((value) => Number.isFinite(value));
}

export function identifiersInText(text: string): string[] {
  return [...text.matchAll(IDENTIFIER)].map((match) => match[0].toLocaleLowerCase('und'));
}

function collectStrings(term: LunumTerm | undefined, out: string[]): void {
  if (term === null || term === undefined) return;
  if (typeof term === 'string') { out.push(term); return; }
  if (typeof term === 'number' || typeof term === 'boolean') { out.push(String(term)); return; }
  if (Array.isArray(term)) { term.forEach((item) => collectStrings(item, out)); return; }
  for (const key of SEMANTIC_LITERAL_FIELDS) {
    collectStrings((term as Record<string, unknown>)[key] as LunumTerm, out);
  }
}

function clauseStrings(clauses: readonly LunumClause[] | undefined, out: string[]): void {
  for (const clause of clauses ?? []) {
    for (const term of Object.values(clause.roles ?? {})) collectStrings(term, out);
    collectStrings(clause.time, out);
    clauseStrings(clause.conditions, out);
    clauseStrings(clause.consequences, out);
  }
}

export function checkLiteralRetention(sourceText: string, sem: LunumSem): LiteralRetentionResult {
  const strings: string[] = [];
  clauseStrings(sem.clauses, strings);
  for (const reference of sem.references ?? []) {
    if (reference.referenceKind === 'surface-evidence') continue;
    // Reference identity is its referent, not a source token or quoted value.
    const referent = typeof reference.ref === 'string' && reference.ref.trim() ? reference.ref : reference.id;
    collectStrings(referent, strings);
  }
  const candidateText = strings.join(' ');
  const sourceDateParts = separateDates(sourceText);
  const candidateDateParts = separateDates(candidateText);
  const candidateNumbers = new Set(numbersInText(candidateDateParts.text));
  const candidateDates = new Set(candidateDateParts.dates);
  const candidateIdentifiers = new Set(identifiersInText(candidateText));
  const sourceNumbers = [...new Set(numbersInText(sourceDateParts.text))];
  const sourceDates = [...new Set(sourceDateParts.dates)];
  const sourceIdentifiers = [...new Set(identifiersInText(sourceText))];
  const missingNumbers = sourceNumbers.filter((value) => !candidateNumbers.has(value));
  const missingIdentifiers = sourceIdentifiers.filter((id) => !candidateIdentifiers.has(id));
  const missingDates = sourceDates.filter((date) => !candidateDates.has(date));
  return { retained: missingNumbers.length === 0 && missingIdentifiers.length === 0 && missingDates.length === 0,
    sourceNumbers, sourceIdentifiers, sourceDates, missingNumbers, missingIdentifiers, missingDates };
}
