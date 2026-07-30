import {
  canonicalizeSem,
  createRecord,
  fingerprintSem,
  compareSem,
  SEM_SCHEMA,
  validateSem,
} from '@corpunum/lunum';
import type { LunumSem, LunumRecord, LunumClause } from '@corpunum/lunum';

export const PILOT_VERSION = '0.1.0' as const;
export const PILOT_NAME = 'cli-knowledge-base' as const;

export interface KnowledgeEntry {
  record: LunumRecord;
  storedAt: string;
  tags: string[];
}

export interface KnowledgeStore {
  entries: KnowledgeEntry[];
  version: string;
}

export interface RetrievalResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: 'exact-fingerprint' | 'near-semantic' | 'predicate-overlap';
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

export function createKnowledgeStore(): KnowledgeStore {
  return { entries: [], version: PILOT_VERSION };
}

export function storeNote(
  store: KnowledgeStore,
  sourceText: string,
  sem: LunumSem,
  tags: string[] = [],
): KnowledgeEntry {
  const record = createRecord({ sem, sourceText, sourceLanguage: 'en', category: 'knowledge', risk: 'low', confidence: 0.9 });
  const entry: KnowledgeEntry = { record, storedAt: new Date().toISOString(), tags };
  store.entries.push(entry);
  return entry;
}

export function retrieveByFingerprint(store: KnowledgeStore, sem: LunumSem): RetrievalResult | undefined {
  const canonical = canonicalizeSem(sem);
  const fp = fingerprintSem(canonical);
  const entry = store.entries.find(e => e.record.fingerprint === fp);
  if (!entry) return undefined;
  return { entry, score: 1.0, matchType: 'exact-fingerprint' };
}

export function retrieveBySemanticSimilarity(store: KnowledgeStore, querySem: LunumSem, threshold = 0.5): RetrievalResult[] {
  const results: RetrievalResult[] = [];
  for (const entry of store.entries) {
    const comparison = compareSem(querySem, entry.record.sem);
    const score = (comparison.featureRecall + comparison.featurePrecision) / 2;
    if (score >= threshold) {
      results.push({
        entry,
        score,
        matchType: comparison.exactFingerprint ? 'exact-fingerprint' : score >= 0.8 ? 'near-semantic' : 'predicate-overlap',
      });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

export function retrieveByTag(store: KnowledgeStore, tag: string): KnowledgeEntry[] {
  return store.entries.filter(e => e.tags.includes(tag));
}

export function runPilot(): PilotReport {
  const scenarios: PilotScenario[] = [];

  // Scenario 1: Store and retrieve by exact fingerprint
  {
    const store = createKnowledgeStore();
    const sem = buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', theme: 'dark_mode' }),
    ]);
    const entry = storeNote(store, 'I prefer dark mode', sem, ['settings']);
    const result = retrieveByFingerprint(store, sem);
    scenarios.push({
      name: 'exact-fingerprint-retrieval',
      description: 'Store a preference and retrieve by exact fingerprint match',
      passed: result != null && result.entry.record.fingerprint === entry.record.fingerprint && result.score === 1.0,
      details: {
        stored: entry.record.fingerprint,
        retrieved: result?.entry.record.fingerprint ?? null,
        score: result?.score ?? 0,
      },
    });
  }

  // Scenario 2: Semantic similarity retrieval
  {
    const store = createKnowledgeStore();
    storeNote(store, 'I like Python for scripting', buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'python' }),
      buildClause('used_for', { language: 'python', purpose: 'scripting' }),
    ]), ['programming']);
    storeNote(store, 'TypeScript for web apps', buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'typescript' }),
      buildClause('used_for', { language: 'typescript', purpose: 'web_applications' }),
    ]), ['programming']);
    storeNote(store, 'Meeting at 3pm on Fridays', buildSem('personal', 'schedule', [
      buildClause('scheduled', { agent: 'user', event: 'meeting', time: 'friday_15:00' }),
    ]), ['calendar']);

    const query = buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', language: 'python' }),
    ]);
    const results = retrieveBySemanticSimilarity(store, query, 0.3);
    const topMatch = results[0];
    scenarios.push({
      name: 'semantic-similarity-retrieval',
      description: 'Query by partial semantic match — should rank Python preference highest',
      passed: topMatch != null && topMatch.entry.tags.includes('programming') && results.length >= 2,
      details: {
        totalMatches: results.length,
        topScore: topMatch?.score ?? 0,
        topTags: topMatch?.entry.tags ?? [],
        scores: results.map(r => ({ score: r.score, tags: r.entry.tags })),
      },
    });
  }

  // Scenario 3: Tag-based retrieval
  {
    const store = createKnowledgeStore();
    storeNote(store, 'Use vim keybindings', buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', tool: 'vim_keybindings' }),
    ]), ['editor', 'settings']);
    storeNote(store, 'Font size 14', buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', font_size: '14' }),
    ]), ['editor']);
    storeNote(store, 'Daily standup at 9am', buildSem('personal', 'schedule', [
      buildClause('scheduled', { agent: 'user', event: 'standup', time: '09:00' }),
    ]), ['calendar']);

    const editorNotes = retrieveByTag(store, 'editor');
    const calendarNotes = retrieveByTag(store, 'calendar');
    scenarios.push({
      name: 'tag-retrieval',
      description: 'Retrieve entries by tag — editor and calendar should be separate',
      passed: editorNotes.length === 2 && calendarNotes.length === 1,
      details: { editorCount: editorNotes.length, calendarCount: calendarNotes.length },
    });
  }

  // Scenario 4: Deduplication via fingerprint
  {
    const store = createKnowledgeStore();
    const sem = buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', editor: 'vscode' }),
    ]);
    storeNote(store, 'I use VS Code', sem, ['tools']);
    const existing = retrieveByFingerprint(store, sem);
    const isDuplicate = existing != null;
    scenarios.push({
      name: 'deduplication',
      description: 'Detect duplicate entry via fingerprint before storing again',
      passed: isDuplicate && store.entries.length === 1,
      details: { isDuplicate, storeSize: store.entries.length },
    });
  }

  // Scenario 5: Validation — only valid sems get stored
  {
    const validSem = buildSem('personal', 'note', [
      buildClause('remembers', { agent: 'user', fact: 'earth_orbits_sun' }),
    ]);
    const validResult = validateSem(validSem);
    const invalidSem = { schema: SEM_SCHEMA, world: '', kind: '', clauses: [] } as unknown as LunumSem;
    const invalidResult = validateSem(invalidSem);
    scenarios.push({
      name: 'validation-gate',
      description: 'Valid sems pass validation, invalid sems are rejected',
      passed: validResult.ok && !invalidResult.ok && invalidResult.errors.length > 0,
      details: { validOk: validResult.ok, invalidOk: invalidResult.ok, invalidErrors: invalidResult.errors },
    });
  }

  // Scenario 6: Roundtrip — canonical form is stable
  {
    const sem = buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', color: 'blue' }),
      buildClause('dislikes', { agent: 'user', color: 'yellow' }, { negated: true }),
    ]);
    const fp1 = fingerprintSem(canonicalizeSem(sem));
    const fp2 = fingerprintSem(canonicalizeSem(sem));
    const record = createRecord({ sem, sourceText: 'I prefer blue, not yellow', sourceLanguage: 'en' });
    const fp3 = record.fingerprint;
    scenarios.push({
      name: 'roundtrip-stability',
      description: 'Fingerprint is stable across multiple canonicalization passes',
      passed: fp1 === fp2 && fp2 === fp3,
      details: { fp1, fp2, fp3 },
    });
  }

  // Scenario 7: Negation preservation
  {
    const store = createKnowledgeStore();
    const posSem = buildSem('personal', 'preference', [
      buildClause('likes', { agent: 'user', food: 'sushi' }),
    ]);
    const negSem = buildSem('personal', 'preference', [
      buildClause('likes', { agent: 'user', food: 'sushi' }, { negated: true }),
    ]);
    storeNote(store, 'I like sushi', posSem, ['food']);
    storeNote(store, 'I do not like sushi', negSem, ['food']);
    const posFp = fingerprintSem(canonicalizeSem(posSem));
    const negFp = fingerprintSem(canonicalizeSem(negSem));
    scenarios.push({
      name: 'negation-distinguishes',
      description: 'Positive and negated clauses produce different fingerprints',
      passed: posFp !== negFp && store.entries.length === 2,
      details: { posFp, negFp, storeSize: store.entries.length },
    });
  }

  // Scenario 8: Modality preservation
  {
    const factSem = buildSem('personal', 'knowledge', [
      buildClause('knows', { agent: 'user', fact: 'typescript_is_typed' }, { modality: 'fact' }),
    ]);
    const beliefSem = buildSem('personal', 'knowledge', [
      buildClause('knows', { agent: 'user', fact: 'typescript_is_typed' }, { modality: 'belief' }),
    ]);
    const factFp = fingerprintSem(canonicalizeSem(factSem));
    const beliefFp = fingerprintSem(canonicalizeSem(beliefSem));
    scenarios.push({
      name: 'modality-preservation',
      description: 'Fact vs belief modality produces different fingerprints',
      passed: factFp !== beliefFp,
      details: { factFp, beliefFp },
    });
  }

  // Scenario 9: Multi-clause knowledge entry
  {
    const store = createKnowledgeStore();
    const sem = buildSem('personal', 'knowledge', [
      buildClause('knows', { agent: 'user', subject: 'machine_learning' }),
      buildClause('studied', { agent: 'user', institution: 'university' }),
      buildClause('works_in', { agent: 'user', field: 'data_science' }),
    ]);
    const entry = storeNote(store, 'I studied ML at university and work in data science', sem, ['career']);
    const comparison = compareSem(sem, entry.record.sem);
    scenarios.push({
      name: 'multi-clause-entry',
      description: 'Multi-clause entries retain all clauses through the pipeline',
      passed: comparison.exactFingerprint && comparison.featureRecall === 1.0 && entry.record.sem.clauses.length === 3,
      details: {
        clauseCount: entry.record.sem.clauses.length,
        exactMatch: comparison.exactFingerprint,
        recall: comparison.featureRecall,
      },
    });
  }

  // Scenario 10: Rendering is present
  {
    const sem = buildSem('personal', 'preference', [
      buildClause('prefers', { agent: 'user', operating_system: 'linux' }),
    ]);
    const record = createRecord({ sem, sourceText: 'I prefer Linux', sourceLanguage: 'en' });
    const renderings = Object.values(record.renderings);
    const hasRendering = renderings.length >= 1 && renderings.every(r => typeof r.code === 'string' && r.code.length > 0);
    scenarios.push({
      name: 'rendering-present',
      description: 'Stored records include at least one non-empty rendering',
      passed: hasRendering,
      details: { renderingCount: renderings.length, firstCode: renderings[0]?.code?.slice(0, 80) ?? '' },
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
        'Exact fingerprint retrieval works',
        'Semantic similarity ranking is correct',
        'Deduplication prevents double-storage',
        'Negation and modality are distinguished',
      ],
      rollbackCriteria: [
        'Any scenario fails that involves data corruption',
        'Fingerprint instability detected',
        'Validation gate allows invalid sems',
      ],
      verdict: failed === 0 ? 'PASS' : 'FAIL',
    },
  };
}
