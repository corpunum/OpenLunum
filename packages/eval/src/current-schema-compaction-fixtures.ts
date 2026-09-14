import type { LunumSem, Risk } from '@corpunum/lunum';

/**
 * Fixed inputs for a deterministic renderer/context benchmark.
 *
 * These are deliberately not downstream questions: this benchmark measures
 * representation and policy selection, while task quality needs a live model
 * run with its own held-out prompts and raw outputs.
 */
export interface CurrentSchemaCompactionFixture {
  id: string;
  sourceText: string;
  sem: LunumSem;
  category: string;
  risk: Risk;
  confidence: number;
}

export const CURRENT_SCHEMA_COMPACTION_FIXTURES: readonly CurrentSchemaCompactionFixture[] = Object.freeze([
  Object.freeze({
    id: 'rate-limit-fact',
    sourceText: 'Authenticated API clients may send at most 1,000 requests per minute.',
    category: 'system_fact',
    risk: 'low',
    confidence: 0.99,
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'limit',
        roles: {
          theme: 'API requests',
          scope: 'authenticated clients',
          rate: { type: 'quantity', value: 1000, unit: 'requests per minute' },
        },
        modality: 'may',
      }],
    },
  }),
  Object.freeze({
    id: 'language-preference',
    sourceText: 'I prefer technical updates in Greek when a Greek translation is available.',
    category: 'preference',
    risk: 'low',
    confidence: 0.99,
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{
        predicate: 'prefer',
        roles: { experiencer: 'user', theme: 'technical updates in Greek' },
        conditions: [{ predicate: 'available', roles: { theme: 'Greek translation' } }],
      }],
    },
  }),
  Object.freeze({
    id: 'safety-constraint-fallback',
    sourceText: 'Do not disclose customer email addresses without written consent.',
    category: 'safety_constraint',
    risk: 'high',
    confidence: 0.99,
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'safety_constraint',
      clauses: [{
        predicate: 'disclose',
        roles: { agent: 'operator', theme: 'customer email addresses' },
        negated: true,
        conditions: [{ predicate: 'consent', roles: { form: 'written' }, negated: true }],
      }],
    },
  }),
  Object.freeze({
    id: 'executable-text-fallback',
    sourceText: 'Run git checkout -- config.yaml only after the approved rollback decision.',
    category: 'system_fact',
    risk: 'low',
    confidence: 0.99,
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'simple_fact',
      clauses: [{
        predicate: 'run',
        roles: { agent: 'operator', theme: 'git checkout -- config.yaml' },
        conditions: [{ predicate: 'approve', roles: { theme: 'rollback decision' } }],
      }],
    },
  }),
]);
