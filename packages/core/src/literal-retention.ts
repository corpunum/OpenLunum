/**
 * Source literal retention (decisions/0016).
 *
 * A candidate that silently drops a number or identifier stated in its source
 * ("approve invoices under 5,000 euros" -> theme: invoices) must not receive
 * an exact identity: the identity would claim a broader meaning than the
 * source. This check is language-neutral: it compares digit-bearing tokens,
 * not words. Number words ("seven") are not checked. Full dates, including
 * EN/EL month-name dates (decisions/0019), are compared as exact ISO dates.
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
// Month-name full dates (decisions/0019): "14 January 2027", "14th of Jan. 2027",
// "January 14, 2027", "14 Ιανουαρίου 2027", "14 Γενάρη 2027". Day and four-digit
// year are both required; a partial date ("15 March", "31 Δεκεμβρίου") is not a
// date span and its numbers stay subject to the numeric floor.
const DAY_MONTH_YEAR = /(?<![\p{L}\p{M}\p{N}_/.,:\-])(\d{1,2})(?:(?:st|nd|rd|th)(?:\s+of)?|η|ης)?\s+(\p{L}[\p{L}\p{M}]*)(\.?),?\s+(\d{4})(?![\p{L}\p{M}\p{N}_/\-]|[.,]\d)/gu;
const MONTH_DAY_YEAR = /(?<![\p{L}\p{M}\p{N}_/.\-])(\p{L}[\p{L}\p{M}]*)(\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?![\p{L}\p{M}\p{N}_/\-]|[.,]\d)/gu;
// Keys are lower-case, accent/diaeresis-free and with final sigma folded.
// Greek: genitive (date usage), nominative, colloquial genitive/nominative
// (Γενάρη, Μάη ...) and common abbreviations. English: full names and
// abbreviations. Abbreviations may carry a period; full names may not.
const MONTH_NAMES: ReadonlyArray<readonly [number, readonly string[], readonly string[]]> = [
  [1, ['january', 'ιανουαριου', 'ιανουαριοσ', 'γεναρη', 'γεναρησ'], ['jan', 'ιαν']],
  [2, ['february', 'φεβρουαριου', 'φεβρουαριοσ', 'φλεβαρη', 'φλεβαρησ'], ['feb', 'φεβ']],
  [3, ['march', 'μαρτιου', 'μαρτιοσ', 'μαρτη', 'μαρτησ'], ['mar', 'μαρ']],
  [4, ['april', 'απριλιου', 'απριλιοσ', 'απριλη', 'απριλησ'], ['apr', 'απρ']],
  [5, ['may', 'μαιου', 'μαιοσ', 'μαη', 'μαησ'], ['μαι']],
  [6, ['june', 'ιουνιου', 'ιουνιοσ', 'ιουνη', 'ιουνησ'], ['jun', 'ιουν']],
  [7, ['july', 'ιουλιου', 'ιουλιοσ', 'ιουλη', 'ιουλησ'], ['jul', 'ιουλ']],
  [8, ['august', 'αυγουστου', 'αυγουστοσ'], ['aug', 'αυγ']],
  [9, ['september', 'σεπτεμβριου', 'σεπτεμβριοσ', 'σεπτεμβρη', 'σεπτεμβρησ'], ['sep', 'sept', 'σεπ', 'σεπτ']],
  [10, ['october', 'οκτωβριου', 'οκτωβριοσ', 'οκτωβρη', 'οκτωβρησ'], ['oct', 'οκτ']],
  [11, ['november', 'νοεμβριου', 'νοεμβριοσ', 'νοεμβρη', 'νοεμβρησ'], ['nov', 'νοε']],
  [12, ['december', 'δεκεμβριου', 'δεκεμβριοσ', 'δεκεμβρη', 'δεκεμβρησ'], ['dec', 'δεκ']],
];
const MONTH_BY_NAME = new Map<string, { month: number; abbreviation: boolean; latin: boolean }>();
for (const [month, names, abbreviations] of MONTH_NAMES) {
  for (const name of names) MONTH_BY_NAME.set(name, { month, abbreviation: false, latin: /^[a-z]+$/u.test(name) });
  for (const name of abbreviations) MONTH_BY_NAME.set(name, { month, abbreviation: true, latin: /^[a-z]+$/u.test(name) });
}

function monthNumber(word: string, period: string, latinOnly = false): number | null {
  const key = word.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/gu, 'σ');
  const entry = MONTH_BY_NAME.get(key);
  if (!entry || (latinOnly && !entry.latin)) return null;
  // A period belongs only to an abbreviation ("Jan."); "January." is a sentence end handled by the year.
  if (period && !entry.abbreviation) return null;
  // English "may" is also a modal verb: only the capitalised month counts.
  if (key === 'may' && word !== 'May' && word !== 'MAY') return null;
  return entry.month;
}

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
  const found: Array<{ index: number; date: string }> = [];
  const take = (index: number, date: string | null, token: string): string => {
    if (date === null) return token;
    found.push({ index, date });
    // Keep offsets stable so that dates are reported in source order.
    return ' '.repeat(token.length);
  };
  let rest = text.replace(FULL_DATE, (token, index: number) => take(index, canonicalDate(token), token));
  rest = rest.replace(DAY_MONTH_YEAR, (token, day: string, word: string, period: string, year: string, index: number) => {
    const month = monthNumber(word, period);
    return take(index, month === null ? null : validIsoDate(Number(year), month, Number(day)), token);
  });
  rest = rest.replace(MONTH_DAY_YEAR, (token, word: string, period: string, day: string, year: string, index: number) => {
    // Month-first order is an English convention; Greek dates are day-first.
    const month = monthNumber(word, period, true);
    return take(index, month === null ? null : validIsoDate(Number(year), month, Number(day)), token);
  });
  found.sort((a, b) => a.index - b.index);
  return { text: rest, dates: found.map(row => row.date) };
}

/**
 * Strict ISO, calendar-valid dotted day>12, and EN/EL month-name dates with an
 * explicit day and four-digit year; never inferred locale or year.
 */
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
  // Dates are read per semantic string: separate fields ("14", "January 2027")
  // cannot be joined into a month-name date that no single field carries.
  const candidateDateParts = strings.map(separateDates);
  const candidateNumbers = new Set(numbersInText(candidateDateParts.map(part => part.text).join(' ')));
  const candidateDates = new Set(candidateDateParts.flatMap(part => part.dates));
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
