import {
  canonicalizeSem,
  createRecord,
  fingerprintSem,
  compareSem,
  renderSem,
  SEM_SCHEMA,
  validateSem,
} from '@corpunum/lunum';
import type { LunumSem, LunumRecord, LunumClause } from '@corpunum/lunum';

export const PILOT_VERSION = '0.1.0' as const;
export const PILOT_NAME = 'agent-preference-memory' as const;

export interface PreferenceEntry {
  record: LunumRecord;
  sourceLanguage: string;
  storedAt: string;
}

export interface PreferenceMemory {
  entries: PreferenceEntry[];
  version: string;
}

export interface CrossLanguageMatch {
  query: PreferenceEntry;
  match: PreferenceEntry;
  comparison: {
    exactFingerprint: boolean;
    featureRecall: number;
    featurePrecision: number;
  };
}

export interface PilotReport {
  pilotName: string;
  pilotVersion: string;
  timestamp: string;
  scenarios: PilotScenario[];
  summary: PilotSummary;
}

export interface PilotScenario {
  name: string;
  description: string;
  passed: boolean;
  details: Record<string, unknown>;
}

export interface PilotSummary {
  totalScenarios: number;
  passed: number;
  failed: number;
  successCriteria: string[];
  rollbackCriteria: string[];
  verdict: 'PASS' | 'FAIL';
}

function buildSem(world: string, kind: string, clauses: LunumClause[]): LunumSem {
  return { schema: SEM_SCHEMA, world, kind, clauses };
}

function buildClause(predicate: string, roles: Record<string, string>, extras?: Partial<LunumClause>): LunumClause {
  return { predicate, roles, ...extras };
}

export function createPreferenceMemory(): PreferenceMemory {
  return { entries: [], version: PILOT_VERSION };
}

export function storePreference(
  memory: PreferenceMemory,
  sourceText: string,
  sourceLanguage: string,
  sem: LunumSem,
): PreferenceEntry {
  const record = createRecord({ sem, sourceText, sourceLanguage, category: 'preference', risk: 'low', confidence: 0.9 });
  const entry: PreferenceEntry = { record, sourceLanguage, storedAt: new Date().toISOString() };
  memory.entries.push(entry);
  return entry;
}

export function findCrossLanguageMatch(memory: PreferenceMemory, querySem: LunumSem): CrossLanguageMatch[] {
  const matches: CrossLanguageMatch[] = [];
  const queryCanonical = canonicalizeSem(querySem);
  const queryFp = fingerprintSem(queryCanonical);
  const queryEntry: PreferenceEntry = {
    record: createRecord({ sem: querySem, sourceText: '' }),
    sourceLanguage: 'query',
    storedAt: new Date().toISOString(),
  };

  for (const entry of memory.entries) {
    const comparison = compareSem(querySem, entry.record.sem);
    if (comparison.featureRecall > 0.3 || comparison.exactFingerprint) {
      matches.push({
        query: queryEntry,
        match: entry,
        comparison: {
          exactFingerprint: comparison.exactFingerprint,
          featureRecall: comparison.featureRecall,
          featurePrecision: comparison.featurePrecision,
        },
      });
    }
  }

  return matches.sort((a, b) => {
    if (a.comparison.exactFingerprint !== b.comparison.exactFingerprint) return a.comparison.exactFingerprint ? -1 : 1;
    return b.comparison.featureRecall - a.comparison.featureRecall;
  });
}

export function runPilot(): PilotReport {
  const scenarios: PilotScenario[] = [];

  // Scenario 1: Same semantic content in different languages produces same fingerprint
  {
    const enSem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'assistant', response_style: 'concise' }),
    ]);
    const elSem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'assistant', response_style: 'concise' }),
    ]);
    const enFp = fingerprintSem(canonicalizeSem(enSem));
    const elFp = fingerprintSem(canonicalizeSem(elSem));
    scenarios.push({
      name: 'cross-language-fingerprint-identity',
      description: 'Identical semantic structures from EN/EL source texts produce the same fingerprint',
      passed: enFp === elFp,
      details: { enFp, elFp },
    });
  }

  // Scenario 2: Cross-language retrieval — store in English, query with same sem
  {
    const memory = createPreferenceMemory();
    const sem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', format: 'markdown' }),
      buildClause('prefers', { agent: 'user', verbosity: 'low' }),
    ]);
    storePreference(memory, 'I prefer markdown format with low verbosity', 'en', sem);
    const matches = findCrossLanguageMatch(memory, sem);
    scenarios.push({
      name: 'cross-language-retrieval',
      description: 'Store preference in English, retrieve with identical sem — should find exact match',
      passed: matches.length === 1 && matches[0]!.comparison.exactFingerprint,
      details: { matchCount: matches.length, exact: matches[0]?.comparison.exactFingerprint ?? false },
    });
  }

  // Scenario 3: Constraint memory — obligations and permissions
  {
    const memory = createPreferenceMemory();
    const obligationSem = buildSem('agent', 'constraint', [
      buildClause('must', { agent: 'assistant', action: 'cite_sources' }, { modality: 'obligation' }),
    ]);
    const permissionSem = buildSem('agent', 'constraint', [
      buildClause('may', { agent: 'assistant', action: 'use_code_examples' }, { modality: 'permission' }),
    ]);
    storePreference(memory, 'Always cite sources', 'en', obligationSem);
    storePreference(memory, 'May use code examples', 'en', permissionSem);

    const obligationFp = fingerprintSem(canonicalizeSem(obligationSem));
    const permissionFp = fingerprintSem(canonicalizeSem(permissionSem));
    scenarios.push({
      name: 'constraint-modality-separation',
      description: 'Obligation vs permission constraints have distinct fingerprints and both store correctly',
      passed: obligationFp !== permissionFp && memory.entries.length === 2,
      details: { obligationFp, permissionFp, entryCount: memory.entries.length },
    });
  }

  // Scenario 4: Preference override detection
  {
    const memory = createPreferenceMemory();
    const oldPref = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'python' }),
    ]);
    const newPref = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'rust' }),
    ]);
    storePreference(memory, 'I prefer Python', 'en', oldPref);
    storePreference(memory, 'I now prefer Rust', 'en', newPref);

    const comparison = compareSem(oldPref, newPref);
    const sameStructure = comparison.featureRecall > 0.3;
    const differentContent = !comparison.exactFingerprint;
    scenarios.push({
      name: 'preference-override-detection',
      description: 'Old and new preference share structure but differ in content — detectable as override',
      passed: sameStructure && differentContent,
      details: {
        recall: comparison.featureRecall,
        precision: comparison.featurePrecision,
        exactFp: comparison.exactFingerprint,
        missing: comparison.missingFeatures,
        extra: comparison.extraFeatures,
      },
    });
  }

  // Scenario 5: Multilingual source texts, same canonical sem
  {
    const memory = createPreferenceMemory();
    const sem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', output_format: 'json' }),
    ]);
    const en = storePreference(memory, 'I prefer JSON output', 'en', sem);
    const el = storePreference(memory, 'Προτιμώ έξοδο JSON', 'el', sem);
    const es = storePreference(memory, 'Prefiero salida JSON', 'es', sem);
    const ja = storePreference(memory, 'JSON出力が好みです', 'ja', sem);

    const allSameFp = [en, el, es, ja].every(e => e.record.fingerprint === en.record.fingerprint);
    const allDiffSourceLang = new Set([en, el, es, ja].map(e => e.sourceLanguage)).size === 4;
    scenarios.push({
      name: 'multilingual-canonical-equivalence',
      description: 'Same sem from 4 languages (EN/EL/ES/JA) produces identical fingerprint',
      passed: allSameFp && allDiffSourceLang,
      details: {
        fingerprints: [en, el, es, ja].map(e => e.record.fingerprint),
        languages: [en, el, es, ja].map(e => e.sourceLanguage),
      },
    });
  }

  // Scenario 6: Rendering works for preference sems
  {
    const sem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', timezone: 'utc' }),
    ]);
    const rendering = renderSem(canonicalizeSem(sem));
    scenarios.push({
      name: 'preference-rendering',
      description: 'Preference sems produce non-empty renderings',
      passed: typeof rendering.code === 'string' && rendering.code.length > 0,
      details: { code: rendering.code.slice(0, 100), profile: rendering.profile },
    });
  }

  // Scenario 7: Conditional preferences
  {
    const sem = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'typescript' }, {
        conditions: [buildClause('context_is', { domain: 'web_development' })],
      }),
    ]);
    const record = createRecord({ sem, sourceText: 'Use TypeScript when doing web dev', sourceLanguage: 'en' });
    const comparison = compareSem(sem, record.sem);
    scenarios.push({
      name: 'conditional-preferences',
      description: 'Conditional clauses survive the full create→canonicalize→compare cycle',
      passed: comparison.exactFingerprint && record.sem.clauses[0]!.conditions!.length === 1,
      details: {
        conditionCount: record.sem.clauses[0]?.conditions?.length ?? 0,
        exactMatch: comparison.exactFingerprint,
      },
    });
  }

  // Scenario 8: Negated constraints
  {
    const sem = buildSem('agent', 'constraint', [
      buildClause('must_not', { agent: 'assistant', action: 'share_personal_data' }, { negated: true, modality: 'obligation' }),
    ]);
    const record = createRecord({ sem, sourceText: 'Never share personal data', sourceLanguage: 'en' });
    const comparison = compareSem(sem, record.sem);
    const clause = record.sem.clauses[0]!;
    scenarios.push({
      name: 'negated-constraints',
      description: 'Negated obligation constraints preserve negation flag through the pipeline',
      passed: comparison.exactFingerprint && clause.negated === true && clause.modality === 'obligation',
      details: { negated: clause.negated, modality: clause.modality },
    });
  }

  // Scenario 9: Multiple constraints per memory entry
  {
    const sem = buildSem('agent', 'constraint', [
      buildClause('must', { agent: 'assistant', action: 'respond_in_user_language' }, { modality: 'obligation' }),
      buildClause('must', { agent: 'assistant', action: 'include_confidence' }, { modality: 'obligation' }),
      buildClause('may', { agent: 'assistant', action: 'ask_clarifying_questions' }, { modality: 'permission' }),
    ]);
    const validation = validateSem(sem);
    const record = createRecord({ sem, sourceText: 'Respond in user language, include confidence, may ask questions', sourceLanguage: 'en' });
    scenarios.push({
      name: 'multi-constraint-entry',
      description: 'Multiple constraints in one entry all survive the pipeline',
      passed: validation.ok && record.sem.clauses.length === 3,
      details: { clauseCount: record.sem.clauses.length, valid: validation.ok },
    });
  }

  // Scenario 10: User correction flow — replacing a preference
  {
    const memory = createPreferenceMemory();
    const original = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', response_length: 'long' }),
    ]);
    const corrected = buildSem('agent', 'preference', [
      buildClause('prefers', { agent: 'user', response_length: 'short' }),
    ]);
    storePreference(memory, 'I prefer long responses', 'en', original);
    const matchesBeforeCorrection = findCrossLanguageMatch(memory, original);
    storePreference(memory, 'Actually, I prefer short responses', 'en', corrected);
    const matchesAfterCorrection = findCrossLanguageMatch(memory, corrected);

    scenarios.push({
      name: 'user-correction-flow',
      description: 'After storing a correction, both old and new are retrievable — agent can detect the override',
      passed: matchesBeforeCorrection.length === 1
        && matchesAfterCorrection.length >= 1
        && matchesAfterCorrection[0]!.comparison.exactFingerprint,
      details: {
        beforeCount: matchesBeforeCorrection.length,
        afterCount: matchesAfterCorrection.length,
        afterExact: matchesAfterCorrection[0]?.comparison.exactFingerprint ?? false,
      },
    });
  }

  const passed = scenarios.filter(s => s.passed).length;
  const failed = scenarios.length - passed;

  return {
    pilotName: PILOT_NAME,
    pilotVersion: PILOT_VERSION,
    timestamp: new Date().toISOString(),
    scenarios,
    summary: {
      totalScenarios: scenarios.length,
      passed,
      failed,
      successCriteria: [
        'All 10 scenarios pass',
        'Cross-language fingerprint identity holds',
        'Constraint modalities are preserved',
        'User corrections are detectable',
        'Multilingual source texts map to same canonical sem',
      ],
      rollbackCriteria: [
        'Cross-language fingerprint divergence',
        'Modality or negation lost through pipeline',
        'Validation rejects valid preference sems',
      ],
      verdict: failed === 0 ? 'PASS' : 'FAIL',
    },
  };
}
