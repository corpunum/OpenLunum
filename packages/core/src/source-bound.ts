import { basicIdentifier } from './semantic-registry.js';
import type { LunumClause, LunumSem, LunumTerm } from './types.js';

/**
 * Source-bound check for the general frames (decisions/0024).
 *
 * The general frames (define, describe, assert, relate, enumerate, quantify,
 * topic) have open slots: the verb, the attribute or the relation is written as
 * the source wrote it. Nothing else would stop a candidate from naming a
 * different sentence, or from keeping a third of this one. So this check
 * binds a candidate to its source, deterministically and without a model:
 *
 *  1. Every filler text must occur in the source, as a contiguous run of its
 *     words (case, punctuation and markdown aside). A filler is a term's
 *     `value` or `id` string.
 *  2. Every word of the source that no filler covers must be a closed-class
 *     word the frame itself carries (articles, copulas, prepositions, "and"),
 *     a digit token (literal retention owns numbers), a negation when the
 *     clause is negated, or a modal when the clause has a modality. Anything
 *     else is content the candidate dropped: no identity.
 *
 * It applies when the Sem has at least one general-frame clause. Check 1 covers
 * every clause; check 2 only when every clause is a general frame (a legacy
 * frame names its verb by predicate, so the source words cannot be accounted for).
 * It is English-only by construction (the closed class is English); other
 * source languages fail closed (`language_unsupported`).
 */
export const GENERAL_FRAME_PREDICATES = Object.freeze(['define', 'describe', 'assert', 'relate', 'enumerate', 'quantify', 'topic'] as const);

const ARTICLES = ['a', 'an', 'the'];
const COPULAS = ['is', 'are', 'was', 'were', 'be', 'been', 'being', 'am'];
const AUX = ['do', 'does', 'did'];
const PREPOSITIONS = ['of', 'in', 'on', 'at', 'by', 'for', 'from', 'to', 'with', 'as'];
const FREE_WORDS: ReadonlySet<string> = new Set([...ARTICLES, ...COPULAS, ...AUX, ...PREPOSITIONS, 'and']);
const NEGATIONS: ReadonlySet<string> = new Set(['not', 'no', 'never', 'cannot', 'nor', 'without']);
const MODALS: ReadonlySet<string> = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'need', 'needs']);
/** Fillers that are only a pronoun refer to something outside the unit. */
const PRONOUNS: ReadonlySet<string> = new Set(['it', 'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'he', 'she', 'him', 'her', 'his', 'one', 'there', 'here']);
export const COPULA_WORDS: ReadonlySet<string> = new Set([...COPULAS, 'is_a', 'is_an']);

export interface SourceBoundResult {
  applies: boolean;
  bound: boolean;
  unsourced: string[];
  uncovered: string[];
  pronounFillers: string[];
}

/** Word tokens: runs of letters or digits, lowercase, NFKC. Markdown and punctuation vanish. */
export function wordTokens(text: string): string[] {
  return String(text ?? '').normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function fillerStrings(term: LunumTerm | undefined, out: string[]): void {
  if (term === null || term === undefined) return;
  if (typeof term === 'string') { out.push(term); return; }
  if (typeof term === 'number' || typeof term === 'boolean') return;
  if (Array.isArray(term)) { term.forEach((item) => fillerStrings(item, out)); return; }
  const object = term as Record<string, unknown>;
  if (typeof object.value === 'string') out.push(object.value);
  else if (Array.isArray(object.value)) fillerStrings(object.value as LunumTerm, out);
  if (typeof object.id === 'string') out.push(object.id);
  if (typeof object.unit === 'string') out.push(object.unit);
}

function walkClauses(clauses: readonly LunumClause[] | undefined, visit: (clause: LunumClause) => void): void {
  for (const clause of clauses ?? []) {
    visit(clause);
    walkClauses(clause.conditions, visit);
    walkClauses(clause.consequences, visit);
  }
}

function occurrences(haystack: readonly string[], needle: readonly string[]): number[] {
  const found: number[] = [];
  if (!needle.length) return found;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) { ok = false; break; }
    if (ok) found.push(i);
  }
  return found;
}

export function checkSourceBound(sourceText: string, sem: LunumSem, language: string | null | undefined = 'en'): SourceBoundResult {
  let general = false;
  let allGeneral = true;
  let negated = false;
  let modal = false;
  const fillers: string[] = [];
  walkClauses(sem.clauses, (clause) => {
    if ((GENERAL_FRAME_PREDICATES as readonly string[]).includes(basicIdentifier(clause.predicate))) general = true; else allGeneral = false;
    if (clause.negated === true) negated = true;
    if (clause.modality != null) modal = true;
    for (const term of Object.values(clause.roles ?? {})) fillerStrings(term, fillers);
    fillerStrings(clause.time, fillers);
  });
  if (!general) return { applies: false, bound: true, unsourced: [], uncovered: [], pronounFillers: [] };
  if (language && !/^en([-_]|$)/iu.test(language)) return { applies: true, bound: false, unsourced: [], uncovered: ['language_unsupported'], pronounFillers: [] };

  const source = wordTokens(sourceText);
  const covered = new Array<boolean>(source.length).fill(false);
  const unsourced: string[] = [];
  const pronounFillers: string[] = [];
  for (const filler of fillers) {
    const words = wordTokens(filler);
    if (!words.length) continue; // pure punctuation or empty: nothing to bind
    if (words.length === 1 && PRONOUNS.has(words[0]!)) pronounFillers.push(filler);
    const at = occurrences(source, words);
    if (!at.length) { unsourced.push(filler); continue; }
    for (const start of at) for (let k = 0; k < words.length; k += 1) covered[start + k] = true;
  }
  const uncovered: string[] = [];
  // A legacy frame names its verb by predicate, not by a source filler, so the
  // words of a Sem that mixes both kinds cannot be accounted for: only the
  // fillers are checked then.
  if (allGeneral) source.forEach((word, index) => {
    if (covered[index]) return;
    if (/\d/u.test(word)) return; // numbers: literal retention
    if (FREE_WORDS.has(word)) return;
    if (negated && NEGATIONS.has(word)) return;
    if (modal && MODALS.has(word)) return;
    uncovered.push(word);
  });
  return { applies: true, bound: !unsourced.length && !uncovered.length && !pronounFillers.length, unsourced, uncovered: [...new Set(uncovered)], pronounFillers };
}

/** True when a lexical slot is nothing but a copula (use define/describe/relate instead). */
export function isCopulaOnly(text: string): boolean {
  const words = wordTokens(text);
  return words.length > 0 && words.every((word) => COPULA_WORDS.has(word));
}

