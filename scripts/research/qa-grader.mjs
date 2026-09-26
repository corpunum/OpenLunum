// Strict answer grading for the consumer memory QA benchmark (grader v2).
// v1 used substring matching and accepted "14 times (7 retries ...)" for "7"
// (reports/independent-evaluation/2026-09-26, audit rows 12-16). v2:
//  - numeric questions: the set of numbers in the answer must equal the gold number;
//  - other questions: accepted tokens must match on word boundaries;
//  - "unknown" and negated answers are wrong unless the gold answer is a negation.
export const GRADER_VERSION = 'qa-grader/2';

const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45 };
const NEGATIONS = ['not', 'cannot', "can't", 'never', 'unknown', 'none', 'no one', 'nobody'];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const hasToken = (text, token) => new RegExp(`(^|[^\\p{L}\\p{N}-])${escape(token)}(?=$|[^\\p{L}\\p{N}-])`, 'u').test(text);
const isNumeric = (token) => /^\d+(\.\d+)?$/u.test(token) || token in NUMBER_WORDS;
const toNumber = (token) => (token in NUMBER_WORDS ? NUMBER_WORDS[token] : Number(token));

export function extractAnswer(text) {
  try { return JSON.parse(String(text).match(/\{[\s\S]*\}/u)[0]).answer; } catch { return text; }
}

export function numbersIn(text) {
  const found = new Set();
  // Dates and identifiers are not quantities: drop YYYY-MM-DD and X-12 style tokens first.
  const cleaned = text.replace(/\b\d{4}-\d{2}-\d{2}\b/gu, ' ').replace(/\b\p{L}+-\d+\b/gu, ' ');
  for (const match of cleaned.matchAll(/\d+(?:\.\d+)?/gu)) found.add(Number(match[0]));
  for (const [word, value] of Object.entries(NUMBER_WORDS)) if (hasToken(cleaned, word)) found.add(value);
  return found;
}

export function grade(question, rawText) {
  const answer = extractAnswer(rawText);
  const text = String(answer ?? '').toLowerCase().normalize('NFKC').trim();
  const goldIsNegation = question.accept.some((token) => ['no', 'none', 'not'].includes(token));
  if (!goldIsNegation && /^(unknown|none|not (stated|specified|known))\b/u.test(text)) return { answer, correct: false, reason: 'unknown' };
  // A negation only disqualifies when it governs an accepted token ("cannot access"),
  // not when it hedges something else ("access (the resource is not specified)").
  const negatedToken = (token) => new RegExp(`(^|[^\\p{L}])(${NEGATIONS.map(escape).join('|')})(\\s+\\p{L}+){0,2}\\s+${escape(token)}(?=$|[^\\p{L}\\p{N}-])`, 'u').test(text);
  if (!goldIsNegation && question.accept.some(negatedToken)) return { answer, correct: false, reason: 'negated' };
  if (question.reject.some((token) => hasToken(text, token))) return { answer, correct: false, reason: 'rejected-token' };
  if (question.accept.every(isNumeric)) {
    const gold = new Set(question.accept.map(toNumber));
    const found = numbersIn(text);
    const correct = found.size > 0 && [...found].every((value) => gold.has(value));
    return { answer, correct, reason: correct ? 'numeric-match' : `numbers ${[...found].join(',') || 'none'}` };
  }
  const correct = question.accept.some((token) => hasToken(text, token));
  return { answer, correct, reason: correct ? 'token-match' : 'no-accepted-token' };
}
