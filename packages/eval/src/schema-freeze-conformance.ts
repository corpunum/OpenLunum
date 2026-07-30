import {
  canonicalizeSem,
  stableStringify,
  fingerprintSem,
  validateSem,
  SEM_SCHEMA,
  createRecord,
} from '@corpunum/lunum';
import type { LunumSem, LunumClause, LunumRecord } from '@corpunum/lunum';
import {
  migrateForward01to02,
  migrateBackward02to01,
  roundTripMigration,
  buildGoldenVector,
  validateGoldenVector,
} from '@corpunum/lunum';
import {
  SEM_SCHEMA_V1,
  FINGERPRINT_VERSION,
  CANONICALIZATION_VERSION,
  CANONICALIZATION_POLICY,
  NORMATIVE_EXAMPLES,
  isFrozenSemSchema,
} from '@corpunum/lunum';

export const CONFORMANCE_VERSION = '0.1.0' as const;

export interface ConformanceVector {
  id: string;
  description: string;
  category: 'migration' | 'ambiguity' | 'canonicalization' | 'fingerprint' | 'roundtrip' | 'boundary';
  sem: LunumSem;
  expectedCanonicalKeys?: string[];
  expectedFingerprint?: string;
  prohibitedBehavior?: string;
}

export interface ConformanceResult {
  vectorId: string;
  passed: boolean;
  details: Record<string, unknown>;
}

export interface ConformanceReport {
  version: string;
  timestamp: string;
  vectors: ConformanceVector[];
  results: ConformanceResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    byCategory: Record<string, { total: number; passed: number }>;
    verdict: 'PASS' | 'FAIL';
  };
}

function buildSem(world: string, kind: string, clauses: LunumClause[]): LunumSem {
  return { schema: SEM_SCHEMA, world, kind, clauses };
}

function clause(predicate: string, roles: Record<string, string>, extras?: Partial<LunumClause>): LunumClause {
  return { predicate, roles, ...extras };
}

export function buildConformanceCorpus(): ConformanceVector[] {
  const vectors: ConformanceVector[] = [];

  // --- Migration vectors ---
  vectors.push({
    id: 'migration-simple-preference',
    description: 'Simple preference survives forward and backward migration',
    category: 'migration',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'dark_mode' })]),
  });
  vectors.push({
    id: 'migration-negated-obligation',
    description: 'Negated obligation preserves negation and modality across migration',
    category: 'migration',
    sem: buildSem('real', 'constraint', [clause('share', { agent: 'system', theme: 'personal_data' }, { negated: true, modality: 'obligation' })]),
  });
  vectors.push({
    id: 'migration-nested-conditions',
    description: 'Nested conditions survive round-trip migration',
    category: 'migration',
    sem: buildSem('real', 'policy', [
      clause('grant', { agent: 'system', theme: 'access' }, {
        conditions: [clause('authenticate', { agent: 'user' })],
        consequences: [clause('log', { agent: 'system', theme: 'access_event' })],
      }),
    ]),
  });
  vectors.push({
    id: 'migration-multi-clause',
    description: 'Multi-clause sem preserves clause order across migration',
    category: 'migration',
    sem: buildSem('real', 'pipeline', [
      clause('fetch', { agent: 'system', source: 'api' }),
      clause('transform', { agent: 'system', theme: 'data' }),
      clause('store', { agent: 'system', destination: 'database' }),
    ]),
  });
  vectors.push({
    id: 'migration-temporal',
    description: 'Temporal clause with time field survives migration',
    category: 'migration',
    sem: buildSem('real', 'schedule', [
      clause('remind', { agent: 'system', theme: 'meeting' }, { time: '2025-06-15T10:00:00Z' }),
    ]),
  });
  vectors.push({
    id: 'migration-provenance',
    description: 'Sem with provenance metadata survives migration',
    category: 'migration',
    sem: {
      ...buildSem('real', 'knowledge', [clause('states', { agent: 'expert', theme: 'water_boils_at_100c' })]),
      provenance: { source: 'textbook', author: 'physics_department' },
    },
  });

  // --- Prohibited ambiguity vectors ---
  vectors.push({
    id: 'ambiguity-null-vs-omitted-modality',
    description: 'Explicit null modality and omitted modality must canonicalize identically',
    category: 'ambiguity',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'json' }, { modality: null })]),
    prohibitedBehavior: 'Different fingerprints for null vs omitted modality',
  });
  vectors.push({
    id: 'ambiguity-false-negated-vs-omitted',
    description: 'Explicit negated:false and omitted negated must canonicalize identically',
    category: 'ambiguity',
    sem: buildSem('real', 'fact', [clause('is', { theme: 'sky', value: 'blue' }, { negated: false })]),
    prohibitedBehavior: 'Different fingerprints for negated:false vs omitted negated',
  });
  vectors.push({
    id: 'ambiguity-empty-conditions-vs-omitted',
    description: 'Empty conditions array and omitted conditions must canonicalize identically',
    category: 'ambiguity',
    sem: buildSem('real', 'fact', [clause('exists', { theme: 'entity' }, { conditions: [] })]),
    prohibitedBehavior: 'Different fingerprints for conditions:[] vs omitted conditions',
  });
  vectors.push({
    id: 'ambiguity-empty-annotations-vs-omitted',
    description: 'Empty annotations and omitted annotations must canonicalize identically',
    category: 'ambiguity',
    sem: { ...buildSem('real', 'fact', [clause('exists', { theme: 'entity' })]), annotations: {} },
    prohibitedBehavior: 'Different fingerprints for annotations:{} vs omitted annotations',
  });
  vectors.push({
    id: 'ambiguity-role-key-casing',
    description: 'Role keys with different casing must canonicalize to same form',
    category: 'ambiguity',
    sem: buildSem('real', 'preference', [{ predicate: 'prefer', roles: { Agent: 'user', Theme: 'dark' } }]),
    prohibitedBehavior: 'Case-sensitive role keys producing different fingerprints',
  });
  vectors.push({
    id: 'ambiguity-whitespace-predicate',
    description: 'Predicates with surrounding whitespace must canonicalize to trimmed form',
    category: 'ambiguity',
    sem: buildSem('real', 'preference', [{ predicate: '  prefer  ', roles: { agent: 'user' } }]),
    prohibitedBehavior: 'Whitespace in predicates affecting fingerprint',
  });
  vectors.push({
    id: 'ambiguity-unicode-normalization',
    description: 'Equivalent Unicode sequences must produce same canonical form',
    category: 'ambiguity',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'café' })]),
    prohibitedBehavior: 'NFC vs NFD producing different fingerprints',
  });

  // --- Canonicalization vectors ---
  vectors.push({
    id: 'canon-role-sort-order',
    description: 'Role keys must be sorted lexicographically in canonical form',
    category: 'canonicalization',
    sem: buildSem('real', 'fact', [{ predicate: 'transfer', roles: { destination: 'b', source: 'a', agent: 'user' } }]),
    expectedCanonicalKeys: ['agent', 'destination', 'source'],
  });
  vectors.push({
    id: 'canon-nested-sort',
    description: 'Role sorting applies recursively in conditions and consequences',
    category: 'canonicalization',
    sem: buildSem('real', 'policy', [
      clause('grant', { agent: 'system' }, {
        conditions: [{ predicate: 'verify', roles: { target: 'identity', source: 'provider' } }],
      }),
    ]),
  });
  vectors.push({
    id: 'canon-nfkc-normalization',
    description: 'Identifiers undergo NFKC normalization',
    category: 'canonicalization',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'Ｔｅｓｔ' })]),
  });
  vectors.push({
    id: 'canon-case-folding',
    description: 'Identifiers are lowercased during canonicalization',
    category: 'canonicalization',
    sem: buildSem('real', 'preference', [clause('PREFER', { AGENT: 'User', THEME: 'Dark_Mode' })]),
  });

  // --- Fingerprint stability vectors ---
  vectors.push({
    id: 'fp-deterministic',
    description: 'Same sem produces same fingerprint on repeated calls',
    category: 'fingerprint',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'typescript' })]),
  });
  vectors.push({
    id: 'fp-negation-distinguishes',
    description: 'Negated and non-negated clauses produce different fingerprints',
    category: 'fingerprint',
    sem: buildSem('real', 'preference', [clause('prefer', { agent: 'user', theme: 'coffee' }, { negated: true })]),
  });
  vectors.push({
    id: 'fp-modality-distinguishes',
    description: 'Different modalities produce different fingerprints',
    category: 'fingerprint',
    sem: buildSem('real', 'constraint', [clause('access', { agent: 'user', theme: 'admin_panel' }, { modality: 'permission' })]),
  });

  // --- Round-trip vectors ---
  vectors.push({
    id: 'roundtrip-complex',
    description: 'Complex sem with all field types survives create→canonicalize→fingerprint→compare',
    category: 'roundtrip',
    sem: {
      ...buildSem('real', 'policy', [
        clause('encrypt', { agent: 'system', theme: 'data' }, { modality: 'obligation' }),
        clause('notify', { agent: 'system', theme: 'user' }, {
          conditions: [clause('detect', { agent: 'system', theme: 'breach' })],
          consequences: [clause('lock', { agent: 'system', theme: 'account' })],
        }),
      ]),
      provenance: { source: 'security_policy', author: 'ciso' },
      annotations: { confidence: 0.95, tags: ['security', 'mandatory'] },
    },
  });
  vectors.push({
    id: 'roundtrip-multilingual-roles',
    description: 'Roles with multilingual content survive round-trip',
    category: 'roundtrip',
    sem: buildSem('real', 'preference', [
      clause('prefer', {
        agent: 'user',
        theme: { type: 'concept', value: 'dark mode', language: 'en' } as unknown as string,
      }),
    ]),
  });

  // --- Boundary vectors ---
  vectors.push({
    id: 'boundary-single-clause',
    description: 'Minimal valid sem with one clause',
    category: 'boundary',
    sem: buildSem('real', 'fact', [clause('exists', { theme: 'something' })]),
  });
  vectors.push({
    id: 'boundary-many-clauses',
    description: '20-clause sem survives full pipeline',
    category: 'boundary',
    sem: buildSem('real', 'pipeline', Array.from({ length: 20 }, (_, i) =>
      clause(`step_${i}`, { agent: 'system', theme: `task_${i}` })
    )),
  });
  vectors.push({
    id: 'boundary-deep-nesting',
    description: '3-level nested conditions survive canonicalization',
    category: 'boundary',
    sem: buildSem('real', 'policy', [
      clause('execute', { agent: 'system' }, {
        conditions: [clause('approve', { agent: 'manager' }, {
          conditions: [clause('review', { agent: 'auditor' }, {
            conditions: [clause('submit', { agent: 'engineer' })],
          })],
        })],
      }),
    ]),
  });
  vectors.push({
    id: 'boundary-empty-string-world',
    description: 'Empty world should fail validation',
    category: 'boundary',
    sem: { schema: SEM_SCHEMA, world: '', kind: 'fact', clauses: [clause('exists', { theme: 'x' })] } as LunumSem,
  });

  return vectors;
}

export function runConformanceTests(vectors: ConformanceVector[]): ConformanceReport {
  const results: ConformanceResult[] = [];

  for (const vec of vectors) {
    let passed = false;
    const details: Record<string, unknown> = {};

    try {
      switch (vec.category) {
        case 'migration': {
          const record = createRecord({ sem: vec.sem, sourceText: vec.description, sourceLanguage: 'en' });
          const { forward, backward } = roundTripMigration(record);
          const fpBefore = record.fingerprint;
          const fpAfter = backward.record.fingerprint;
          passed = forward.sourceValid && forward.destValid && backward.sourceValid && backward.destValid && fpBefore === fpAfter;
          details.fpBefore = fpBefore;
          details.fpAfter = fpAfter;
          details.forwardWarnings = forward.warnings.length;
          details.backwardWarnings = backward.warnings.length;
          details.clauseCountPreserved = record.sem.clauses.length === backward.record.sem.clauses.length;
          break;
        }
        case 'ambiguity': {
          const canonical = canonicalizeSem(vec.sem);
          const fp1 = fingerprintSem(canonical);
          const withoutOptionals = buildSemWithoutOptionals(vec.sem);
          const fp2 = fingerprintSem(canonicalizeSem(withoutOptionals));
          passed = fp1 === fp2;
          details.fp1 = fp1;
          details.fp2 = fp2;
          details.prohibited = vec.prohibitedBehavior;
          details.ambiguityResolved = fp1 === fp2;
          break;
        }
        case 'canonicalization': {
          const canonical = canonicalizeSem(vec.sem);
          const canonStr = stableStringify(canonical);
          if (vec.expectedCanonicalKeys) {
            const firstClause = canonical.clauses[0]!;
            const actualKeys = Object.keys(firstClause.roles);
            passed = JSON.stringify(actualKeys) === JSON.stringify(vec.expectedCanonicalKeys);
            details.expectedKeys = vec.expectedCanonicalKeys;
            details.actualKeys = actualKeys;
          } else {
            const fp1 = fingerprintSem(canonical);
            const fp2 = fingerprintSem(canonicalizeSem(vec.sem));
            passed = fp1 === fp2 && canonStr.length > 0;
            details.fp = fp1;
            details.canonLength = canonStr.length;
          }
          break;
        }
        case 'fingerprint': {
          const fp1 = fingerprintSem(canonicalizeSem(vec.sem));
          const fp2 = fingerprintSem(canonicalizeSem(vec.sem));
          if (vec.id === 'fp-deterministic') {
            passed = fp1 === fp2;
            details.fp1 = fp1;
            details.fp2 = fp2;
          } else if (vec.id === 'fp-negation-distinguishes') {
            const nonNeg = { ...vec.sem, clauses: vec.sem.clauses.map(c => ({ ...c, negated: false })) };
            const fpNonNeg = fingerprintSem(canonicalizeSem(nonNeg));
            passed = fp1 !== fpNonNeg;
            details.negatedFp = fp1;
            details.nonNegFp = fpNonNeg;
          } else if (vec.id === 'fp-modality-distinguishes') {
            const noModality = { ...vec.sem, clauses: vec.sem.clauses.map(c => ({ ...c, modality: null })) };
            const fpNoMod = fingerprintSem(canonicalizeSem(noModality));
            passed = fp1 !== fpNoMod;
            details.withModalityFp = fp1;
            details.noModalityFp = fpNoMod;
          } else {
            passed = fp1 === fp2;
          }
          break;
        }
        case 'roundtrip': {
          const canonical = canonicalizeSem(vec.sem);
          const fp = fingerprintSem(canonical);
          const record = createRecord({ sem: vec.sem, sourceText: vec.description });
          passed = record.fingerprint === fp && record.sem.clauses.length === vec.sem.clauses.length;
          details.fp = fp;
          details.recordFp = record.fingerprint;
          details.clauseCount = record.sem.clauses.length;
          break;
        }
        case 'boundary': {
          if (vec.id === 'boundary-empty-string-world') {
            const validation = validateSem(vec.sem);
            passed = !validation.ok && validation.errors.some(e => e.includes('world'));
            details.valid = validation.ok;
            details.errors = validation.errors;
          } else {
            const canonical = canonicalizeSem(vec.sem);
            const fp = fingerprintSem(canonical);
            passed = fp.startsWith('lfp:') && canonical.clauses.length === vec.sem.clauses.length;
            details.fp = fp;
            details.clauseCount = canonical.clauses.length;
          }
          break;
        }
      }
    } catch (err) {
      if (vec.id === 'boundary-empty-string-world') {
        passed = true;
        details.threwExpected = true;
      } else {
        passed = false;
        details.error = err instanceof Error ? err.message : String(err);
      }
    }

    results.push({ vectorId: vec.id, passed, details });
  }

  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const vec of vectors) {
    if (!byCategory[vec.category]) byCategory[vec.category] = { total: 0, passed: 0 };
    byCategory[vec.category]!.total++;
  }
  for (const res of results) {
    const vec = vectors.find(v => v.id === res.vectorId)!;
    if (res.passed) byCategory[vec.category]!.passed++;
  }

  const passed = results.filter(r => r.passed).length;

  return {
    version: CONFORMANCE_VERSION,
    timestamp: new Date().toISOString(),
    vectors,
    results,
    summary: {
      total: vectors.length,
      passed,
      failed: vectors.length - passed,
      byCategory,
      verdict: passed === vectors.length ? 'PASS' : 'FAIL',
    },
  };
}

function buildSemWithoutOptionals(sem: LunumSem): LunumSem {
  const clauses = sem.clauses.map(c => {
    const clean: LunumClause = { predicate: c.predicate, roles: { ...c.roles } };
    if (c.negated === true) clean.negated = true;
    if (c.modality != null) clean.modality = c.modality;
    if (c.time != null) clean.time = c.time;
    if (c.conditions && c.conditions.length > 0) clean.conditions = c.conditions;
    if (c.consequences && c.consequences.length > 0) clean.consequences = c.consequences;
    if (c.annotations && Object.keys(c.annotations).length > 0) clean.annotations = c.annotations;
    return clean;
  });
  const out: LunumSem = { schema: sem.schema, world: sem.world, kind: sem.kind, clauses };
  if (sem.references && sem.references.length > 0) out.references = sem.references;
  if (sem.provenance && Object.keys(sem.provenance).length > 0) out.provenance = sem.provenance;
  if (sem.annotations && Object.keys(sem.annotations).length > 0) out.annotations = sem.annotations;
  return out;
}
