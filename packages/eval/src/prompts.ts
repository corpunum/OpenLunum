import type { DatasetItem } from './types.js';
import { protocolVocabularyBlock } from '@corpunum/lunum';

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
      predicate: 'enable',
      roles: { agent: { type: 'actor', id: 'system' }, theme: { type: 'feature', id: 'power_saving' } },
      negated: false,
      conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery_level' }, value: { type: 'quantity', value: 20, unit: 'percent' } }, negated: false }]
    }]
  });

  const exampleSafety = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'safety_constraint',
    clauses: [{
      predicate: 'delete',
      roles: { agent: { type: 'actor', id: 'assistant' }, object: { type: 'concept', id: 'files' } },
      negated: true,
      conditions: [{ predicate: 'confirmed', roles: { agent: { type: 'actor', id: 'user' } }, negated: false }]
    }]
  });

  const exampleProjectState = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'project_state',
    clauses: [{
      predicate: 'deadline',
      roles: { subject: { type: 'project', id: 'project' }, time: { type: 'date', value: '2027-04-15' } },
      negated: false
    }]
  });

  // Deliberately distinct from the four core dataset scenarios (dark_mode
  // preference, battery/power_saving conditional, file deletion safety,
  // project deadline) so this permissive-modality pattern cannot bleed
  // into a core item whose gold has no modality field. See #341.
  const examplePermission = JSON.stringify({
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'conditional_instruction',
    clauses: [{
      predicate: 'share',
      modality: 'permission',
      roles: {
        agent: { type: 'actor', id: 'assistant' },
        theme: { type: 'concept', id: 'report' },
        object: { type: 'actor', id: 'team' }
      },
      negated: false,
      conditions: [{ predicate: 'confirmed', roles: { agent: { type: 'actor', id: 'user' } }, negated: false }]
    }]
  });

  return {
    system: [
      'Convert the input into Lunum-Sem JSON.',
      'Return one JSON object only; no markdown.',
      'For a representable statement, return a Lunum-Sem object using schema lunum-sem/0.1-draft.',
      'If the source is too ambiguous, underspecified, or unsupported to represent without inventing facts, fail closed with exactly {"status":"abstain","reason":"brief explanation"}.',
      'Preserve entities, roles, negation, conditions, quantities, dates, time, modality, and uncertainty.',
      'Use language-neutral controlled identifiers in lower_snake_case.',
      'Do not invent facts. Record an annotation warning for a representable uncertainty; use the abstain result when a safe semantic candidate cannot be formed.',
      '',
      'Expected JSON structure:',
      '{',
      '  "schema": "lunum-sem/0.1-draft",',
      '  "world": "real",',
      '  "kind": "<semantic category appropriate to the source; use a concise lower_snake_case label>",',
      '  "clauses": [{',
      '    "predicate": "<verb>",',
      '    "modality": "<optional; see Modality values below — omit for plain non-modal statements>",',
      '    "roles": { "<role>": { "type": "<actor|concept|object|metric|feature|project|quantity|date>", "id": "<lower_snake_case>" }, ... },',
      '    "negated": <true|false>,',
      '    "conditions": [...]',
      '  }]',
      '}',
      '',
      'Synthetic grammar examples (examples are not answers for the evaluated item):',
      `Preference: ${examplePreference}`,
      `Conditional Instruction: ${exampleConditional}`,
      `Safety Constraint: ${exampleSafety}`,
      `Project State: ${exampleProjectState}`,
      `Permission: ${examplePermission}`,
      '',
      protocolVocabularyBlock()
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
