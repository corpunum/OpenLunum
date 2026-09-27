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
  missingNumbers: number[];
  missingIdentifiers: string[];
}

// Identifier-like tokens: letters, hyphen, digits (B-11, AC-3, ENV-5, U-31).
const IDENTIFIER = /(?<![\p{L}\p{N}])\p{L}{1,6}-\d+(?![\p{L}\p{N}])/gu;
// Numbers: thousands grouping by "," or "." followed by exactly 3 digits, with
// an optional decimal part in the other separator ("15,750.00", "2.000,5").
const NUMBER = /\d+(?:,\d{3})+(?:\.\d+)?(?!\d)|\d+(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?/gu;
// 12-hour clock times; rewritten to 24-hour before numbers are read, so that
// "2:00 PM" matches a candidate time "14:00".
const CLOCK_12H = /(?<!\d)(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s?[Mm]\.?(?![\p{L}])/gu;

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
  for (const value of Object.values(term as Record<string, unknown>)) collectStrings(value as LunumTerm, out);
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
  for (const reference of sem.references ?? []) collectStrings(reference as unknown as LunumTerm, strings);
  const candidateText = strings.join(' ');
  const candidateNumbers = new Set(numbersInText(candidateText));
  const candidateIdentifiers = new Set(identifiersInText(candidateText));
  const sourceNumbers = [...new Set(numbersInText(sourceText))];
  const sourceIdentifiers = [...new Set(identifiersInText(sourceText))];
  const missingNumbers = sourceNumbers.filter((value) => !candidateNumbers.has(value));
  const missingIdentifiers = sourceIdentifiers.filter((id) => !candidateIdentifiers.has(id));
  return { retained: missingNumbers.length === 0 && missingIdentifiers.length === 0, sourceNumbers, sourceIdentifiers, missingNumbers, missingIdentifiers };
}
