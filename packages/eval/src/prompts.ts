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
  const exampleOutput = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } }, negated: false }]
  });

  // 2026-07-20: the parse prompt previously showed only a `preference`
  // example. Every conditional_instruction/safety_constraint item in the
  // dataset failed across every model tested (up to 550B) because the
  // model had never seen the `conditions` array shape or the non-actor/
  // concept/object role types (metric, quantity, date, feature, project)
  // that those items require. These two examples are real gold records
  // from datasets/dev/multilingual-core-v1.jsonl (battery-en, delete-en),
  // not invented — do not drift them from the actual gold data.
  const conditionalExample = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'enable',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'feature', id: 'power_saving' } },
      negated: false,
      conditions: [{
        predicate: 'below',
        roles: { subject: { type: 'metric', id: 'battery_level' }, value: { type: 'quantity', value: 20, unit: 'percent' } },
        negated: false
      }]
    }]
  });
  const safetyExample = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'safety_constraint',
    clauses: [{
      predicate: 'delete',
      roles: { agent: { type: 'actor', id: 'assistant' }, object: { type: 'concept', id: 'files' } },
      negated: true,
      conditions: [{
        predicate: 'confirmed',
        roles: { agent: { type: 'actor', id: 'user' } },
        negated: false
      }]
    }]
  });

  return {
    system: [
      'Convert the input into Lunum-Sem JSON.',
      'Return one JSON object only; no markdown, no reasoning text before or after the JSON.',
      'Use schema lunum-sem/0.1-draft.',
      'Preserve entities, roles, negation, conditions, quantities, dates, time, modality, and uncertainty.',
      'Use language-neutral controlled identifiers in lower_snake_case.',
      'Do not invent facts. If ambiguous, record an annotation warning rather than choosing silently.',
      '',
      'Conditional inputs ("when X", "if X", "unless X", thresholds like "below 20%") MUST use',
      '"kind": "conditional_instruction" or "safety_constraint" and wrap the triggering test in a',
      '"conditions" array on the clause — never flatten a threshold or confirmation requirement into',
      'the main clause\'s roles. A negated main clause ("do not delete... unless confirmed") plus a',
      '"conditions" entry for the confirmation is the correct shape; do not drop the conditions array.',
      '',
      'Expected JSON structure:',
      '{',
      '  "schema": "lunum-sem/0.1-draft",',
      '  "world": "real",',
      '  "kind": "<clause kind>",',
      '  "clauses": [{',
      '    "predicate": "<verb>",',
      '    "roles": { "<role>": { "type": "<actor|concept|object|metric|quantity|date|feature|project>", "id": "<lower_snake_case>" }, ... },',
      '    "negated": <true|false>,',
      '    "conditions": [{ "predicate": "<comparison-or-check>", "roles": {...}, "negated": <true|false> }]',
      '  }]',
      '}',
      '',
      'Example (preference — no condition):',
      exampleOutput,
      '',
      'Example (conditional_instruction — threshold trigger, note the conditions array and metric/quantity types):',
      conditionalExample,
      '',
      'Example (safety_constraint — confirmation requirement, note negated:true on the main clause):',
      safetyExample,
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
