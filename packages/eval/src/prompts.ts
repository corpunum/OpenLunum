import type { DatasetItem, ExperimentItem } from './types.js';

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

export function renderPrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Render the Lunum-Sem record to Lunum-Code. Output JSON with code, profile, and tokens fields.',
    user: JSON.stringify({ sem: item.goldSem, profile: 'generic-en-pivot/0.1' })
  };
}

export function contextPrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Evaluate context compilation. Compare natural vs Lunum vs mixed context quality.',
    user: JSON.stringify({ sem: item.goldSem, task: item.task ?? 'answer_question', contextTypes: ['natural', 'lunum', 'mixed'] })
  };
}

export function retrievalPrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Evaluate retrieval quality. Score precision, recall, and false equivalence.',
    user: JSON.stringify({ sem: item.goldSem, query: item.sourceText, expectedFp: item.expectedFingerprint })
  };
}

export function integrationPrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Test integration hooks. Verify encode/validate/render/compile operations.',
    user: JSON.stringify({ operation: item.operation ?? 'encode', input: item.input })
  };
}

export function conformancePrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Validate conformance. Check schema validity, canonicalization, and fingerprint stability.',
    user: JSON.stringify({ test: item.test ?? 'canonicalization', input: item.input })
  };
}

export function infrastructurePrompt(item: ExperimentItem): { system: string; user: string } {
  return {
    system: 'Run infrastructure checks. Verify build, types, and schema sync.',
    user: JSON.stringify({ check: item.check ?? 'build', config: item.config })
  };
}
