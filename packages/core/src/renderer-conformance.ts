import { canonicalizeSem, stableStringify } from './canonicalize.js';
import { decodeProfileSem, ProfileGenerator, type ProfileType } from './profiles.js';
import type { LunumRecord, LunumSem } from './types.js';

export interface ProfileConformanceResult {
  profile: ProfileType;
  roundTripPass: boolean;
  originalCanonical: string;
  profiledCanonical: string;
  canonicalEqual: boolean;
  warnings: string[];
  tokenReduction: number;
  preservation: number;
}

export interface ConformanceTestCaseResult {
  testCaseId: string;
  description: string;
  profileResults: ProfileConformanceResult[];
  allProfilesPass: boolean;
}

export interface ConformanceSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  results: ConformanceTestCaseResult[];
  profileSummary: Record<ProfileType, { total: number; passed: number; passRate: number }>;
}

export interface ConformanceFailure {
  testCaseId: string;
  profile: ProfileType;
  originalCanonical: string;
  profiledCanonical: string;
}

function record(id: string, description: string, sem: LunumSem, renderings: LunumRecord['renderings'] = {}): { id: string; description: string; record: LunumRecord } {
  return {
    id,
    description,
    record: {
      recordVersion: 'lunum-record/0.1-draft',
      source: { text: description, language: 'en', role: 'user', ref: null },
      sem,
      fingerprint: `lfp:0.1:sha256:${id.padEnd(16, '0')}`,
      renderings,
      policy: { eligible: true, category: sem.kind, risk: 'low', confidence: 0.9, reasons: ['conformance'] },
      meta: { fixture: id },
    },
  };
}

export function createTestRecords(): Array<{ id: string; description: string; record: LunumRecord }> {
  return [
    record('single', 'Single clause with basic roles', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'process', roles: { agent: 'system', theme: 'request' } }],
    }),
    record('conditional', 'Nested conditions and consequences', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'rule',
      clauses: [{
        predicate: 'grant', roles: { target: 'access' },
        conditions: [{ predicate: 'authenticate', roles: { agent: 'user' } }],
        consequences: [{ predicate: 'log', roles: { theme: 'access' } }],
      }],
    }),
    record('annotations', 'Annotations and provenance', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'measurement',
      clauses: [{ predicate: 'temperature', roles: { value: 25 } }],
      annotations: { confidence: 0.95, tags: ['sensor'] },
      provenance: { source: 'sensor-api', timestamp: '2026-07-20T08:00:00Z' },
    }),
    record('negation', 'Negated clause', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'receive', roles: { agent: 'user', theme: 'notification' }, negated: true }],
    }),
    record('time', 'Typed time component', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
      clauses: [{ predicate: 'start', roles: { subject: 'meeting' }, time: { type: 'datetime', value: '2026-08-01T15:00:00Z' } }],
    }),
    record('modality', 'Modality and empty roles', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'prediction',
      clauses: [{ predicate: 'restart', roles: {}, modality: 'possibility' }],
    }),
    record('roles', 'Many and array-valued roles', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event',
      clauses: [{ predicate: 'send', roles: { agent: 'alice', recipient: ['bob', 'carol'], medium: 'email', theme: 'report' } }],
    }),
    record('renderings', 'Existing non-semantic rendering', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'fact',
      clauses: [{ predicate: 'approve', roles: { theme: 'budget', period: 'Q1' } }],
    }, {
      en: { code: 'The budget was approved.', profile: 'natural/en', tokens: 5 },
    }),
    record('references', 'References and typed terms', {
      schema: 'lunum-sem/0.1-draft', world: 'tool', kind: 'instruction',
      clauses: [{ predicate: 'see', roles: { agent: { type: 'actor', id: 'reader' }, theme: 'manual' } }],
      references: [{ type: 'source', ref: 'manual', value: 'Operations Manual' }],
    }),
    record('multilingual', 'Multilingual literal content', {
      schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'χρήστης', theme: { type: 'text', value: 'σύντομες απαντήσεις', language: 'el' } } }],
    }),
  ];
}

export function runConformanceSuite(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords(),
): ConformanceSuiteResult {
  const generator = new ProfileGenerator();
  const profiles: ProfileType[] = ['safe', 'short', 'tight'];
  const results: ConformanceTestCaseResult[] = [];

  for (const { id: testCaseId, description, record: inputRecord } of records) {
    const originalCanonical = stableStringify(canonicalizeSem(inputRecord.sem));
    const profileResults: ProfileConformanceResult[] = [];

    for (const profile of profiles) {
      let profiledCanonical = '';
      let warnings: string[] = [];
      let tokenReduction = 0;
      let preservation = 0;

      try {
        const profileResult = generator.profile(inputRecord, profile);
        const rendering = profileResult.record.renderings[profile];
        if (!rendering) throw new Error(`${profile} rendering was not emitted`);
        profiledCanonical = stableStringify(decodeProfileSem(rendering.code, profile));
        warnings = profileResult.warnings ?? [];
        tokenReduction = profileResult.reduction;
        preservation = profileResult.preservation;
      } catch (error) {
        profiledCanonical = `ERROR:${error instanceof Error ? error.message : String(error)}`;
        warnings = [profiledCanonical];
      }

      const canonicalEqual = originalCanonical === profiledCanonical;
      profileResults.push({
        profile,
        roundTripPass: canonicalEqual,
        originalCanonical,
        profiledCanonical,
        canonicalEqual,
        warnings,
        tokenReduction,
        preservation,
      });
    }

    results.push({
      testCaseId,
      description,
      profileResults,
      allProfilesPass: profileResults.every((result) => result.canonicalEqual),
    });
  }

  const totalTests = results.length;
  const passedTests = results.filter((result) => result.allProfilesPass).length;
  const profileSummary: Record<ProfileType, { total: number; passed: number; passRate: number }> = {
    safe: { total: totalTests, passed: 0, passRate: 0 },
    short: { total: totalTests, passed: 0, passRate: 0 },
    tight: { total: totalTests, passed: 0, passRate: 0 },
  };

  for (const result of results) {
    for (const profileResult of result.profileResults) {
      if (profileResult.canonicalEqual) profileSummary[profileResult.profile].passed += 1;
    }
  }
  for (const profile of profiles) {
    const summary = profileSummary[profile];
    summary.passRate = summary.total > 0 ? summary.passed / summary.total : 0;
  }

  return {
    totalTests,
    passedTests,
    failedTests: totalTests - passedTests,
    passRate: totalTests > 0 ? passedTests / totalTests : 0,
    results,
    profileSummary,
  };
}

export function checkConformance(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords(),
): { conforms: boolean; summary: ConformanceSuiteResult } {
  const summary = runConformanceSuite(records);
  return { conforms: summary.passRate === 1, summary };
}

export function getConformanceFailures(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords(),
): ConformanceFailure[] {
  return runConformanceSuite(records).results.flatMap((result) =>
    result.profileResults
      .filter((profileResult) => !profileResult.canonicalEqual)
      .map((profileResult) => ({
        testCaseId: result.testCaseId,
        profile: profileResult.profile,
        originalCanonical: profileResult.originalCanonical,
        profiledCanonical: profileResult.profiledCanonical,
      })),
  );
}
