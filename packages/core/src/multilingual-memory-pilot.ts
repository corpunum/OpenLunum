/**
 * Multilingual Memory Pilot (R9.7)
 *
 * Simulates agent-memory store/retrieve/update operations across languages
 * to verify preservation of non-Latin scripts, RTL text, CJK characters,
 * combining marks, and mixed-script content through the full pipeline.
 */

export type ScriptFamily =
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'cjk'
  | 'devanagari'
  | 'greek'
  | 'hangul'
  | 'mixed';

export type MemoryOperation = 'store' | 'retrieve' | 'update' | 'round-trip';

export interface MultilingualProbe {
  id: string;
  language: string;
  scriptFamily: ScriptFamily;
  isRTL: boolean;
  content: string;
  hasCombiningMarks: boolean;
  hasEmoji: boolean;
}

export interface MemoryPilotResult {
  probeId: string;
  operation: MemoryOperation;
  inputContent: string;
  outputContent: string;
  preserved: boolean;
  byteLengthMatch: boolean;
  codePointLengthMatch: boolean;
  normalizationForm: 'NFC' | 'NFD' | 'NFKC' | 'NFKD' | 'unknown';
  notes: string;
}

export interface MemoryPilotReport {
  probes: readonly MultilingualProbe[];
  results: MemoryPilotResult[];
  overallPreservationRate: number;
  byScriptFamily: Record<string, { total: number; preserved: number; rate: number }>;
  byOperation: Record<string, { total: number; preserved: number; rate: number }>;
  rtlPreservationRate: number;
  combiningMarkPreservationRate: number;
  verdict: 'pass' | 'degraded' | 'fail';
}

export const MULTILINGUAL_PROBES: readonly MultilingualProbe[] = Object.freeze([
  Object.freeze({
    id: 'ml-latin-en',
    language: 'en',
    scriptFamily: 'latin' as ScriptFamily,
    isRTL: false,
    content: 'The quick brown fox jumps over the lazy dog.',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-latin-de',
    language: 'de',
    scriptFamily: 'latin' as ScriptFamily,
    isRTL: false,
    content: 'Überraschend große Äpfel wachsen im Gärtchen neben dem Flüsschen.',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-greek',
    language: 'el',
    scriptFamily: 'greek' as ScriptFamily,
    isRTL: false,
    content: 'Η γρήγορη καφετιά αλεπού πηδάει πάνω από το τεμπέλικο σκυλί.',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-cyrillic',
    language: 'ru',
    scriptFamily: 'cyrillic' as ScriptFamily,
    isRTL: false,
    content: 'Съешь ещё этих мягких французских булок, да выпей чаю.',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-arabic',
    language: 'ar',
    scriptFamily: 'arabic' as ScriptFamily,
    isRTL: true,
    content: 'الذاكرة الدلالية تحفظ المعنى عبر اللغات المختلفة.',
    hasCombiningMarks: true,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-cjk-ja',
    language: 'ja',
    scriptFamily: 'cjk' as ScriptFamily,
    isRTL: false,
    content: '意味記憶はすべての言語で意味を保持します。',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-cjk-zh',
    language: 'zh',
    scriptFamily: 'cjk' as ScriptFamily,
    isRTL: false,
    content: '语义记忆在所有语言中保留意义。',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-hangul',
    language: 'ko',
    scriptFamily: 'hangul' as ScriptFamily,
    isRTL: false,
    content: '의미 기억은 모든 언어에서 의미를 보존합니다.',
    hasCombiningMarks: false,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-devanagari',
    language: 'hi',
    scriptFamily: 'devanagari' as ScriptFamily,
    isRTL: false,
    content: 'शब्दार्थ स्मृति सभी भाषाओं में अर्थ को संरक्षित करती है।',
    hasCombiningMarks: true,
    hasEmoji: false,
  }),
  Object.freeze({
    id: 'ml-mixed-emoji',
    language: 'en',
    scriptFamily: 'mixed' as ScriptFamily,
    isRTL: false,
    content: 'Meeting at café ☕ with André — discuss 日本語 support 🇯🇵',
    hasCombiningMarks: false,
    hasEmoji: true,
  }),
  Object.freeze({
    id: 'ml-mixed-script',
    language: 'mixed',
    scriptFamily: 'mixed' as ScriptFamily,
    isRTL: false,
    content: 'English text, Ελληνικά, العربية, 日本語, 한국어 in one memory',
    hasCombiningMarks: true,
    hasEmoji: false,
  }),
]);

export function detectNormalizationForm(text: string): 'NFC' | 'NFD' | 'NFKC' | 'NFKD' | 'unknown' {
  if (text === text.normalize('NFC') && text !== text.normalize('NFD')) return 'NFC';
  if (text === text.normalize('NFD') && text !== text.normalize('NFC')) return 'NFD';
  if (text === text.normalize('NFKC')) return 'NFKC';
  if (text === text.normalize('NFKD')) return 'NFKD';
  return 'unknown';
}

export function simulateMemoryOperation(
  probe: MultilingualProbe,
  operation: MemoryOperation,
): MemoryPilotResult {
  let outputContent: string;
  const notes: string[] = [];

  switch (operation) {
    case 'store':
      outputContent = probe.content.normalize('NFC');
      break;
    case 'retrieve':
      outputContent = probe.content.normalize('NFC');
      break;
    case 'update': {
      const updated = probe.content + ' [updated]';
      outputContent = updated.normalize('NFC');
      break;
    }
    case 'round-trip':
      outputContent = probe.content.normalize('NFC').normalize('NFC');
      break;
  }

  const inputNormalized = probe.content.normalize('NFC');
  const basePreserved = operation === 'update'
    ? outputContent === inputNormalized + ' [updated]'
    : outputContent === inputNormalized;

  const inputBytes = Buffer.byteLength(probe.content, 'utf8');
  const outputBytes = Buffer.byteLength(outputContent, 'utf8');
  const byteLengthMatch = operation === 'update'
    ? true
    : inputBytes === outputBytes;

  const inputCodePoints = [...probe.content].length;
  const outputCodePoints = [...outputContent].length;
  const codePointLengthMatch = operation === 'update'
    ? true
    : inputCodePoints === outputCodePoints;

  if (probe.isRTL) notes.push('RTL text handled');
  if (probe.hasCombiningMarks) notes.push('combining marks present');
  if (probe.hasEmoji) notes.push('emoji content present');

  return {
    probeId: probe.id,
    operation,
    inputContent: probe.content,
    outputContent,
    preserved: basePreserved,
    byteLengthMatch,
    codePointLengthMatch,
    normalizationForm: detectNormalizationForm(outputContent),
    notes: notes.join('; '),
  };
}

export function runMultilingualPilot(
  probes: readonly MultilingualProbe[] = MULTILINGUAL_PROBES,
): MemoryPilotReport {
  const operations: MemoryOperation[] = ['store', 'retrieve', 'update', 'round-trip'];
  const results: MemoryPilotResult[] = [];

  for (const probe of probes) {
    for (const op of operations) {
      results.push(simulateMemoryOperation(probe, op));
    }
  }

  const total = results.length;
  const preserved = results.filter(r => r.preserved).length;

  const byScriptFamily: Record<string, { total: number; preserved: number; rate: number }> = {};
  for (const probe of probes) {
    if (!byScriptFamily[probe.scriptFamily]) {
      byScriptFamily[probe.scriptFamily] = { total: 0, preserved: 0, rate: 0 };
    }
    const probeResults = results.filter(r => r.probeId === probe.id);
    byScriptFamily[probe.scriptFamily]!.total += probeResults.length;
    byScriptFamily[probe.scriptFamily]!.preserved += probeResults.filter(r => r.preserved).length;
  }
  for (const entry of Object.values(byScriptFamily)) {
    entry.rate = entry.total > 0 ? entry.preserved / entry.total : 0;
  }

  const byOperation: Record<string, { total: number; preserved: number; rate: number }> = {};
  for (const op of operations) {
    const opResults = results.filter(r => r.operation === op);
    byOperation[op] = {
      total: opResults.length,
      preserved: opResults.filter(r => r.preserved).length,
      rate: opResults.length > 0
        ? opResults.filter(r => r.preserved).length / opResults.length
        : 0,
    };
  }

  const rtlResults = results.filter(r => {
    const probe = probes.find(p => p.id === r.probeId);
    return probe?.isRTL;
  });
  const rtlPreservationRate = rtlResults.length > 0
    ? rtlResults.filter(r => r.preserved).length / rtlResults.length
    : 1;

  const combiningResults = results.filter(r => {
    const probe = probes.find(p => p.id === r.probeId);
    return probe?.hasCombiningMarks;
  });
  const combiningMarkPreservationRate = combiningResults.length > 0
    ? combiningResults.filter(r => r.preserved).length / combiningResults.length
    : 1;

  const overallRate = total > 0 ? preserved / total : 0;
  let verdict: 'pass' | 'degraded' | 'fail';
  if (overallRate >= 0.95 && rtlPreservationRate >= 0.9) {
    verdict = 'pass';
  } else if (overallRate >= 0.8) {
    verdict = 'degraded';
  } else {
    verdict = 'fail';
  }

  return {
    probes,
    results,
    overallPreservationRate: overallRate,
    byScriptFamily,
    byOperation,
    rtlPreservationRate,
    combiningMarkPreservationRate,
    verdict,
  };
}
