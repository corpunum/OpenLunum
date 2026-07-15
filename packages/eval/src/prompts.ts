import type { DatasetItem } from './types.js';

export function parsePrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Convert the input into Lunum-Sem JSON.',
      'Return one JSON object only; no markdown.',
      'Use schema lunum-sem/0.1-draft.',
      'Preserve entities, roles, negation, conditions, quantities, dates, time, modality, and uncertainty.',
      'Use language-neutral controlled identifiers in lower_snake_case.',
      'Do not invent facts. If ambiguous, record an annotation warning rather than choosing silently.'
    ].join(' '),
    user: JSON.stringify({ sourceLanguage: item.sourceLanguage, sourceText: item.sourceText })
  };
}

export function realizePrompt(item: DatasetItem, targetLanguage: string): { system: string; user: string } {
  return {
    system: [
      `Realize the supplied Lunum-Sem faithfully in ${targetLanguage}.`,
      'Output natural language only.',
      'Preserve names, numbers, units, dates, negation, conditions, modality, and uncertainty.',
      'Do not add facts.'
    ].join(' '),
    user: JSON.stringify({ sem: item.goldSem, protectedLiterals: item.protectedLiterals ?? [] })
  };
}
