/**
 * English-pivot translation adapter (decisions/0030).
 *
 * Lunum extracts, checks and renders English only. Another language reaches it
 * through a model translation at the edges: source → English (with meaning
 * flags) → extraction and identity → English writer → target language. This
 * module holds the deterministic parts: the translation prompts, the JSON
 * schema of the translator's answer, its parser, the guards that decide whether
 * a translation may be used (literal carry-through, negation and modality,
 * ambiguity), the dual-translator identity agreement, and the stored record.
 * It never calls a model; runners do (experiments/pivot-el-en-v1/translate.mjs).
 * It lives outside packages/core on purpose: an adapter at the edge (decisions/0001), and
 * core's dist is part of the frozen served runtime that binds the instruction package.
 */
import { datesInText, identifiersInText, numbersInText, relativeTimesInText } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export const PIVOT_PROMPT_VERSION = 'pivot-translate/0.1';

export type Aspect = 'perfective' | 'imperfective' | 'unmarked';
export type Formality = 'formal' | 'informal' | 'unmarked';
export type AddresseeNumber = 'singular' | 'plural' | 'unmarked';
export type Gender = 'masculine' | 'feminine' | 'neuter';
export type Evidentiality = 'direct' | 'reported' | 'inferred' | 'unmarked';
export type LiteralKind = 'number' | 'date' | 'time' | 'name' | 'identifier';

/** Meaning that English drops or that the translator had to decide. Self-reported by the translator; carried, not verified. */
export interface MeaningFlags {
  aspect: Aspect;
  formality: Formality;
  addresseeNumber: AddresseeNumber;
  /** Referents whose grammatical gender the English loses; `referent` is the words of the English translation. */
  gender: Array<{ referent: string; gender: Gender }>;
  evidentiality: Evidentiality;
  /** The translator supplied a subject the source left in the verb ending (pro-drop). */
  droppedSubject: boolean;
}

/** The translator's answer, in either direction. */
export interface PivotTranslation {
  translation: string;
  flags: MeaningFlags;
  /** Every number, date, time, name and identifier of the source, with the exact form used in the translation. */
  literals: Array<{ source: string; target: string; kind: LiteralKind }>;
  ambiguous: boolean;
  ambiguityNote: string | null;
}

/**
 * JSON schema of PivotTranslation. Kept to the subset that constrained-decoding
 * servers enforce (no pattern, no format), so it can be sent as response_format.
 */
export const MEANING_FLAGS_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['translation', 'flags', 'literals', 'ambiguous', 'ambiguityNote'],
  properties: {
    translation: { type: 'string', minLength: 1 },
    flags: {
      type: 'object',
      additionalProperties: false,
      required: ['aspect', 'formality', 'addresseeNumber', 'gender', 'evidentiality', 'droppedSubject'],
      properties: {
        aspect: { type: 'string', enum: ['perfective', 'imperfective', 'unmarked'] },
        formality: { type: 'string', enum: ['formal', 'informal', 'unmarked'] },
        addresseeNumber: { type: 'string', enum: ['singular', 'plural', 'unmarked'] },
        gender: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['referent', 'gender'],
            properties: { referent: { type: 'string', minLength: 1 }, gender: { type: 'string', enum: ['masculine', 'feminine', 'neuter'] } },
          },
        },
        evidentiality: { type: 'string', enum: ['direct', 'reported', 'inferred', 'unmarked'] },
        droppedSubject: { type: 'boolean' },
      },
    },
    literals: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['source', 'target', 'kind'],
        properties: {
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          kind: { type: 'string', enum: ['number', 'date', 'time', 'name', 'identifier'] },
        },
      },
    },
    ambiguous: { type: 'boolean' },
    ambiguityNote: { type: ['string', 'null'] },
  },
});

const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', el: 'Greek' };
const languageName = (code: string): string => LANGUAGE_NAMES[code.toLowerCase().split(/[-_]/u)[0] ?? ''] ?? code;

const SHARED_RULES = [
  'Rules, all mandatory:',
  '1. Translate the meaning, sentence for sentence. Do not summarise, explain, add or omit anything.',
  '2. Keep every number, date, time, name and identifier exactly. Write numbers the source wrote as digits as the same digits, and numbers written as words as words. Names keep their usual spelling in the target language.',
  '3. Never change negation: a negated statement stays negated, an affirmative one stays affirmative.',
  '4. Never change modality: necessity (must, have to), possibility or permission (may, can, might), future or conditional (will, would) stay exactly as strong as in the source. Do not add a modal the source does not have.',
  '5. Keep the mood: a question stays a question, a command stays a command.',
  '6. If the source has two readings that the translation must choose between, choose the likelier one and set "ambiguous": true with a one-line "ambiguityNote"; otherwise "ambiguous": false and "ambiguityNote": null.',
  '7. List every number, date, time, name and identifier of the source in "literals" as {"source": exact source span, "target": the exact form you used in the translation, "kind"}. An empty list if there are none.',
];

const FLAG_RULES = [
  'In "flags", record meaning that English cannot show. Use "unmarked" when the source does not mark it:',
  '- "aspect": "perfective" for a completed single event (Greek aorist, e.g. «έφαγα»), "imperfective" for ongoing or habitual (e.g. «έτρωγα», «τρώω»).',
  '- "formality": "formal" if the addressee is addressed politely (Greek plural of politeness, «εσείς» to one person), "informal" for «εσύ»; "unmarked" if there is no addressee.',
  '- "addresseeNumber": "singular" or "plural" for the addressee, "unmarked" if there is none or it cannot be told.',
  '- "gender": one entry per person or thing whose grammatical gender the English loses ("friend" for «φίλη» is feminine); "referent" is the words of your English translation. An empty list if none.',
  '- "evidentiality": "reported" if the speaker passes on hearsay (e.g. «λέει πως», «λένε»), "inferred" if the speaker concludes it, "direct" if stated as known, otherwise "unmarked".',
  '- "droppedSubject": true if the source has no subject word and you supplied an English subject pronoun from the verb ending (Greek pro-drop: «Θα καλέσω» → "I will call").',
];

/** Prompt for the inbound hop: source language → English. Reply is one JSON object matching MEANING_FLAGS_JSON_SCHEMA. */
export function buildPivotPrompt(sourceText: string, sourceLanguage: string): string {
  return [
    `You translate ${languageName(sourceLanguage)} into English for a meaning-checking system (${PIVOT_PROMPT_VERSION}). A wrong translation is worse than none.`,
    '',
    ...SHARED_RULES,
    '',
    ...FLAG_RULES,
    '',
    'Reply with one JSON object and nothing else:',
    '{"translation": "...", "flags": {"aspect": "...", "formality": "...", "addresseeNumber": "...", "gender": [], "evidentiality": "...", "droppedSubject": false}, "literals": [], "ambiguous": false, "ambiguityNote": null}',
    '',
    `${languageName(sourceLanguage)} source: ${JSON.stringify(sourceText)}`,
  ].join('\n');
}

/** Prompt for the outbound hop: English → target language, using the flags stored with the record. */
export function buildRenderPrompt(englishText: string, flags: MeaningFlags, targetLanguage: string): string {
  return [
    `You translate English into ${languageName(targetLanguage)} for a meaning-checking system (${PIVOT_PROMPT_VERSION}). A wrong translation is worse than none.`,
    '',
    ...SHARED_RULES,
    '',
    `The English was produced from a ${languageName(targetLanguage)} record and has lost some meaning. Restore it from these flags; they override any default:`,
    JSON.stringify(flags),
    '- aspect perfective → perfective verb forms (aorist); imperfective → imperfective forms.',
    '- formality formal → polite plural address; informal → singular familiar address.',
    '- addresseeNumber, gender: use these for the addressee and the listed referents.',
    '- evidentiality reported or inferred → keep that marking.',
    '- droppedSubject true → do not write a subject pronoun the verb ending already carries.',
    '',
    'Reply with one JSON object and nothing else; in "flags", repeat the flags you applied:',
    '{"translation": "...", "flags": {...}, "literals": [], "ambiguous": false, "ambiguityNote": null}',
    '',
    `English source: ${JSON.stringify(englishText)}`,
  ].join('\n');
}

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  aspect: ['perfective', 'imperfective', 'unmarked'],
  formality: ['formal', 'informal', 'unmarked'],
  addresseeNumber: ['singular', 'plural', 'unmarked'],
  evidentiality: ['direct', 'reported', 'inferred', 'unmarked'],
};
const GENDERS = ['masculine', 'feminine', 'neuter'];
const KINDS = ['number', 'date', 'time', 'name', 'identifier'];
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Parse and validate a translator reply (the first {...} block of the text). Never repairs a field. */
export function parsePivotTranslation(text: string): { ok: true; value: PivotTranslation } | { ok: false; errors: string[] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, errors: ['no_json_object'] };
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return { ok: false, errors: ['invalid_json'] }; }
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['not_an_object'] };
  if (typeof raw.translation !== 'string' || raw.translation.trim() === '') errors.push('translation');
  const flags = raw.flags;
  if (!isRecord(flags)) errors.push('flags');
  else {
    for (const [key, values] of Object.entries(ENUMS)) if (typeof flags[key] !== 'string' || !values.includes(flags[key] as string)) errors.push(`flags.${key}`);
    if (typeof flags.droppedSubject !== 'boolean') errors.push('flags.droppedSubject');
    if (!Array.isArray(flags.gender) || !flags.gender.every((g) => isRecord(g) && typeof g.referent === 'string' && g.referent !== '' && GENDERS.includes(g.gender as string))) errors.push('flags.gender');
  }
  if (!Array.isArray(raw.literals) || !raw.literals.every((l) => isRecord(l) && typeof l.source === 'string' && l.source !== '' && typeof l.target === 'string' && l.target !== '' && KINDS.includes(l.kind as string))) errors.push('literals');
  if (typeof raw.ambiguous !== 'boolean') errors.push('ambiguous');
  if (!(raw.ambiguityNote === null || typeof raw.ambiguityNote === 'string')) errors.push('ambiguityNote');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: raw as unknown as PivotTranslation };
}

// ---- Guards ---------------------------------------------------------------

/** Lower case, accents off, final sigma folded: the folding core uses for EN/EL words. */
export function foldPivotText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/gu, 'σ').replace(/[’‘`´]/gu, "'");
}
const wordsOf = (text: string): string[] => foldPivotText(text).match(/[\p{L}\p{N}']+/gu) ?? [];
const containsPhrase = (haystack: string, needle: string): boolean => {
  const h = ` ${wordsOf(haystack).join(' ')} `;
  const n = wordsOf(needle).join(' ');
  return n !== '' && h.includes(` ${n} `);
};

export interface PivotMarkers { negation: boolean; necessity: boolean; possibility: boolean; future: boolean }

const EN_NEGATION = /\b(not|no|never|nobody|nothing|none|neither|nor|nowhere|cannot|no one)\b|n't\b/u;
const EN_NECESSITY = /\b(must|mustn't|ought|should|shouldn't|should've|have to|has to|had to|having to|need to|needs to|needed to|got to)\b/u;
const EN_POSSIBILITY = /\b(can|can't|cannot|could|couldn't|could've|may|might|mightn't|might've|able|unable|maybe|perhaps|possibly)\b/u;
const EN_FUTURE = /\b(will|won't|would|wouldn't|would've|shall|going to|gonna)\b|'ll\b|'d\b/u;
// Greek, folded. Only clitic negators: «κανείς», «ποτέ», «τίποτα» are also "anyone", "ever", "anything" in questions.
const EL_NEGATION = new Set(['δεν', 'δε', 'μην', 'μη', 'οχι', 'ουτε']);
const EL_NECESSITY = new Set(['πρεπει', 'επρεπε']);
const EL_POSSIBILITY_PREFIX = ['μπορ', 'μπορεσ'];
const EL_POSSIBILITY = new Set(['ισωσ', 'πιθανον', 'πιθανωσ', 'ενδεχεται', 'δυνατον']);
const EL_FUTURE = new Set(['θα']);

/** Negation and modality markers of a text, by closed word lists; null for a language without lists (fail closed). */
export function pivotMarkers(text: string, language: string): PivotMarkers | null {
  const lang = language.toLowerCase().split(/[-_]/u)[0];
  if (lang === 'en') {
    const t = ` ${wordsOf(text).join(' ')} `;
    return { negation: EN_NEGATION.test(t), necessity: EN_NECESSITY.test(t), possibility: EN_POSSIBILITY.test(t), future: EN_FUTURE.test(t) };
  }
  if (lang === 'el') {
    const w = wordsOf(text);
    return {
      negation: w.some((x) => EL_NEGATION.has(x)),
      necessity: w.some((x) => EL_NECESSITY.has(x)),
      possibility: w.some((x) => EL_POSSIBILITY.has(x) || EL_POSSIBILITY_PREFIX.some((p) => x.startsWith(p))),
      future: w.some((x) => EL_FUTURE.has(x)),
    };
  }
  return null;
}

const countOf = <T>(xs: readonly T[]): Map<T, number> => { const m = new Map<T, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
const missingFrom = <T>(source: readonly T[], target: readonly T[]): T[] => {
  const have = countOf(target); const out: T[] = [];
  for (const [x, n] of countOf(source)) if ((have.get(x) ?? 0) < n) out.push(x);
  return out;
};

/** Capitalised words that are not sentence-initial and not the English "I": names the translator must declare. */
function midSentenceCapitalised(text: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}][\p{L}\p{M}'’-]*/gu;
  let previousEnd = -1;
  for (const m of text.matchAll(re)) {
    const word = m[0];
    const before = text.slice(previousEnd < 0 ? 0 : previousEnd, m.index).trim();
    const initial = previousEnd < 0 || /[.!?;:«"“]$/u.test(before);
    previousEnd = m.index + word.length;
    const first = word[0]!;
    if (initial || first === first.toLocaleLowerCase('und')) continue;
    if (/^I('|’|$)/u.test(word)) continue;
    out.push(word);
  }
  return out;
}

export type PivotGuardFailure =
  | 'unsupported_language' | 'ambiguous'
  | 'number_not_carried' | 'date_not_carried' | 'relative_time_not_carried' | 'identifier_not_carried'
  | 'latin_word_not_carried' | 'undeclared_name' | 'declared_literal_not_in_translation'
  | 'negation_changed' | 'necessity_changed' | 'possibility_changed' | 'future_dropped';

export interface PivotGuardResult {
  pass: boolean;
  failures: PivotGuardFailure[];
  details: string[];
  sourceMarkers: PivotMarkers | null;
  targetMarkers: PivotMarkers | null;
}

/**
 * Deterministic checks across one translation hop. Every failure abstains.
 * Literals use core's EN/EL literal-retention readers, so "τρία" and "three" or
 * «αύριο» and "tomorrow" compare equal.
 */
export function checkPivotGuards(sourceText: string, sourceLanguage: string, translation: PivotTranslation, targetLanguage: string): PivotGuardResult {
  const failures = new Set<PivotGuardFailure>(); const details: string[] = [];
  const target = translation.translation;
  const sourceMarkers = pivotMarkers(sourceText, sourceLanguage);
  const targetMarkers = pivotMarkers(target, targetLanguage);
  if (!sourceMarkers || !targetMarkers) failures.add('unsupported_language');
  if (translation.ambiguous) { failures.add('ambiguous'); details.push(`ambiguous: ${translation.ambiguityNote ?? ''}`); }

  const lost = <T>(code: PivotGuardFailure, a: readonly T[], b: readonly T[]): void => {
    const m = missingFrom(a, b); if (m.length) { failures.add(code); details.push(`${code}: ${m.join(', ')}`); }
  };
  lost('number_not_carried', numbersInText(sourceText), numbersInText(target));
  lost('date_not_carried', datesInText(sourceText), datesInText(target));
  lost('relative_time_not_carried', relativeTimesInText(sourceText), relativeTimesInText(target));
  lost('identifier_not_carried', identifiersInText(sourceText), identifiersInText(target));

  const srcLang = sourceLanguage.toLowerCase().split(/[-_]/u)[0];
  if (srcLang !== 'en') {
    // Latin-script words in a non-English source (names, brands, code) must survive verbatim.
    const latin = (sourceText.match(/[A-Za-z][A-Za-z0-9_.-]*/gu) ?? []).filter((w) => !containsPhrase(target, w));
    if (latin.length) { failures.add('latin_word_not_carried'); details.push(`latin_word_not_carried: ${latin.join(', ')}`); }
  }
  // Names: every mid-sentence capitalised source word must be inside a declared literal, and every declared literal must be in the translation.
  const declaredSources = translation.literals.map((l) => l.source);
  const undeclared = midSentenceCapitalised(sourceText).filter((w) => !declaredSources.some((s) => containsPhrase(s, w)) && !(srcLang !== 'en' && /^[A-Za-z]/u.test(w) && containsPhrase(target, w)));
  if (undeclared.length) { failures.add('undeclared_name'); details.push(`undeclared_name: ${undeclared.join(', ')}`); }
  const absent = translation.literals.filter((l) => !containsPhrase(target, l.target));
  if (absent.length) { failures.add('declared_literal_not_in_translation'); details.push(`declared_literal_not_in_translation: ${absent.map((l) => l.target).join(', ')}`); }

  if (sourceMarkers && targetMarkers) {
    if (sourceMarkers.negation !== targetMarkers.negation) failures.add('negation_changed');
    if (sourceMarkers.necessity !== targetMarkers.necessity) failures.add('necessity_changed');
    if (sourceMarkers.possibility !== targetMarkers.possibility) failures.add('possibility_changed');
    if (sourceMarkers.future && !targetMarkers.future) failures.add('future_dropped');
  }
  return { pass: failures.size === 0, failures: [...failures], details, sourceMarkers, targetMarkers };
}

// ---- Dual-translator agreement and the stored record ---------------------

export interface PivotLeg {
  translator: string;
  translation: PivotTranslation;
  guards: PivotGuardResult;
  /** lfp identity of the English translation's record, or null (abstain, refusal, or sentence copy). */
  identity: string | null;
}

export type PivotAgreement =
  | { accepted: true; identity: string }
  | { accepted: false; reason: 'too_few_translators' | 'guard_failed' | 'no_identity' | 'identities_differ' | 'same_family' };

/**
 * An identity is accepted only if at least two translators from different
 * families each pass the guards and land on the same identity (decisions/0030).
 */
export function agreePivotIdentity(legs: readonly PivotLeg[], familyOf: (translator: string) => string): PivotAgreement {
  if (legs.length < 2) return { accepted: false, reason: 'too_few_translators' };
  if (new Set(legs.map((l) => familyOf(l.translator))).size < 2) return { accepted: false, reason: 'same_family' };
  if (legs.some((l) => !l.guards.pass)) return { accepted: false, reason: 'guard_failed' };
  if (legs.some((l) => l.identity === null)) return { accepted: false, reason: 'no_identity' };
  const ids = new Set(legs.map((l) => l.identity));
  if (ids.size !== 1) return { accepted: false, reason: 'identities_differ' };
  return { accepted: true, identity: legs[0]!.identity! };
}

/** What is stored: the language-neutral record and the meaning flags; source and translations only as provenance. */
export interface PivotRecord {
  schema: 'lunum-pivot-record/0.1';
  identity: string;
  sem: LunumSem;
  meaningFlags: MeaningFlags;
  provenance: {
    promptVersion: string;
    sourceLanguage: string;
    sourceSha256: string;
    sourceText?: string;
    translations: Array<{ translator: string; translationSha256: string; translation?: string }>;
  };
}
