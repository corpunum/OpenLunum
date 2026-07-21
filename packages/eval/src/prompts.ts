import type { DatasetItem } from './types.js';
import { vocabularyBlock } from './predicate-vocabulary.js';

export function renderPrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Render the supplied Lunum-Sem into Lunum-Code.',
      'Use schema lunum-sem/0.1-draft for input.',
      'Preserve entities, roles, negation, conditions, quantities, dates, time, modality, and uncertainty.'
    ].join(' '),
    user: JSON.stringify({ sem: item.goldSem })
  };
}

export function contextPrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Compile the natural language source into a Lunum-eligible context window.',
      'Evaluate eligibility and risk using the Lunum policy.'
    ].join(' '),
    user: JSON.stringify({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, sem: item.goldSem })
  };
}

export function retrievalPrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Retrieve the best matching Lunum-Sem for the given query.',
      'Score matches by semantic proximity.'
    ].join(' '),
    user: JSON.stringify({ query: item.sourceText, candidates: (item.goldSem ? [item.goldSem] : []) })
  };
}

export function integrationPrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Integrate the supplied Lunum-Sem with existing context.',
      'Resolve conflicts and preserve provenance.'
    ].join(' '),
    user: JSON.stringify({ sem: item.goldSem, context: item.sourceText })
  };
}

export function conformancePrompt(item: DatasetItem): { system: string; user: string } {
  return {
    system: [
      'Check if the supplied Lunum-Sem conforms to the lunum-sem/0.1-draft schema.',
      'Report all validation errors.'
    ].join(' '),
    user: JSON.stringify({ sem: item.goldSem })
  };
}

export function infrastructurePrompt(): { system: string; user: string } {
  return {
    system: [
      'Run infrastructure checks: schema validity, type synchronization, and component availability.',
      'Report pass/fail for each check.'
    ].join(' '),
    user: '{}' 
  };
}

export function parsePrompt(item: DatasetItem): { system: string; user: string } {
  const examplePreference = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'dark_mode' } }, negated: false }]
  });

  const exampleConditional = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'activate',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'concept', id: 'cooling_system' } },
      negated: false,
      conditions: [{ predicate: 'exceeds', roles: { subject: { type: 'metric', id: 'cpu_usage' }, value: { type: 'quantity', value: 90, unit: 'percent' } }, negated: false }]
    }]
  });

  const exampleSafety = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'safety_constraint',
    clauses: [{
      predicate: 'transmit',
      roles: { agent: { type: 'actor', id: 'assistant' }, object: { type: 'concept', id: 'credentials' } },
      negated: true,
      conditions: [{ predicate: 'approved', roles: { agent: { type: 'actor', id: 'administrator' } }, negated: false }]
    }]
  });

  const exampleProjectState = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'project_state',
    clauses: [{
      predicate: 'scheduled',
      roles: { subject: { type: 'concept', id: 'quarterly_review' }, time: { type: 'date', value: '2027-04-15' } },
      negated: false
    }]
  });

  return {
    system: [
      'Convert the input into Lunum-Sem JSON.',
      'Return one JSON object only; no markdown.',
      'Use schema lunum-sem/0.1-draft.',
      'Preserve entities, roles, negation, conditions, quantities, dates, time, modality, and uncertainty.',
      'Use language-neutral controlled identifiers in lower_snake_case.',
      'Do not invent facts. If ambiguous, record an annotation warning rather than choosing silently.',
      '',
      'Expected JSON structure:',
      '{',
      '  "schema": "lunum-sem/0.1-draft",',
      '  "world": "real",',
      '  "kind": "<preference|conditional_instruction|safety_constraint|project_state>",',
      '  "clauses": [{',
      '    "predicate": "<verb>",',
      '    "roles": { "<role>": { "type": "<actor|concept|object|metric|feature|project|quantity|date>", "id": "<lower_snake_case>" }, ... },',
      '    "negated": <true|false>,',
      '    "conditions": [...]',
      '  }]',
      '}',
      '',
      'Synthetic Examples for tested kinds:',
      `Preference: ${examplePreference}`,
      `Conditional Instruction: ${exampleConditional}`,
      `Safety Constraint: ${exampleSafety}`,
      `Project State: ${exampleProjectState}`,
      '',
      vocabularyBlock()
    ].join('\n'),
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
