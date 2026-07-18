/**
 * Renderer conformance suite: property tests for profile round-trip canonicalization.
 *
 * Verifies that every profile (safe, short, tight) preserves round-trip
 * canonicalization — the canonical form of a profiled record must be equivalent
 * to the canonical form of the original record.
 *
 * This implements the WORK_QUEUE v4 release gate 4 item:
 * "Renderer conformance suite: property tests that every profile preserves
 * round-trip canonicalization."
 */

import { canonicalizeSem, stableStringify, type LunumSem, type LunumRecord } from './index.js';
import { ProfileGenerator, type ProfileType } from './profiles.js';

// ── Types ──────────────────────────────────────────────────────────

/** A conformance test result for a single profile. */
export interface ProfileConformanceResult {
  /** Profile type tested */
  profile: ProfileType;
  /** Whether round-trip canonicalization passed */
  roundTripPass: boolean;
  /** Canonical form of original record */
  originalCanonical: string;
  /** Canonical form of profiled record */
  profiledCanonical: string;
  /** Canonical forms are equivalent */
  canonicalEqual: boolean;
  /** Warnings from the profile operation */
  warnings: string[];
  /** Token reduction achieved */
  tokenReduction: number;
  /** Semantic preservation score */
  preservation: number;
}

/** A conformance test result for a single test case. */
export interface ConformanceTestCaseResult {
  /** Test case identifier */
  testCaseId: string;
  /** Description of the test case */
  description: string;
  /** Results per profile */
  profileResults: ProfileConformanceResult[];
  /** Overall conformance: all profiles pass */
  allProfilesPass: boolean;
}

/** Full conformance suite result. */
export interface ConformanceSuiteResult {
  /** Total test cases run */
  totalTests: number;
  /** Test cases where all profiles passed */
  passedTests: number;
  /** Failed test cases */
  failedTests: number;
  /** Pass rate */
  passRate: number;
  /** Results per test case */
  results: ConformanceTestCaseResult[];
  /** Summary per profile type */
  profileSummary: Record<ProfileType, { total: number; passed: number; passRate: number }>;
}

// ── Test Fixture Generator ─────────────────────────────────────────

/**
 * Create a diverse set of test records covering common structures.
 */
export function createTestRecords(): Array<{ id: string; description: string; record: LunumRecord }> {
  return [
    {
      id: 'test-single-clause',
      description: 'Single clause with basic roles',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'The system processes user requests.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-system',
          kind: 'system_fact',
          clauses: [
            { predicate: 'processes', roles: { subject: 'system', object: 'requests' } }
          ]
        },
        fingerprint: 'sha256:abc123',
        renderings: {},
        policy: { eligible: true, category: 'system_fact', risk: 'low', confidence: 0.95, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-multi-clause',
      description: 'Multiple clauses with conditions',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'If the user is authenticated, allow access to the dashboard.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-auth',
          kind: 'conditional_instruction',
          clauses: [
            {
              predicate: 'allow_access',
              roles: { subject: 'user', object: 'dashboard' },
              conditions: [
                { predicate: 'is_authenticated', roles: { subject: 'user' } }
              ]
            }
          ]
        },
        fingerprint: 'sha256:def456',
        renderings: {},
        policy: { eligible: true, category: 'conditional_instruction', risk: 'medium', confidence: 0.8, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-with-annotations',
      description: 'Record with annotations and provenance',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'Temperature reading is 25 degrees Celsius.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-sensors',
          kind: 'sensor_data',
          clauses: [
            { predicate: 'temperature', roles: { subject: 'sensor', object: '25_C' } }
          ],
          annotations: { sensor_id: 'temp-001', calibrated: true },
          provenance: { source: 'sensor-api', timestamp: Date.now() }
        },
        fingerprint: 'sha256:ghi789',
        renderings: {},
        policy: { eligible: true, category: 'sensor_data', risk: 'low', confidence: 0.9, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-negation',
      description: 'Negated clause',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'The user did not receive the notification.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-notif',
          kind: 'simple_fact',
          clauses: [
            { predicate: 'receive_notification', roles: { subject: 'user', object: 'alert' }, negated: true }
          ]
        },
        fingerprint: 'sha256:jkl012',
        renderings: {},
        policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.95, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-with-time',
      description: 'Clause with time component',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'The meeting is scheduled for tomorrow at 3pm.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-calendar',
          kind: 'simple_fact',
          clauses: [
            { predicate: 'scheduled_meeting', roles: { subject: 'meeting', object: '3pm' }, time: { type: 'datetime', value: 'tomorrow_15:00' } }
          ]
        },
        fingerprint: 'sha256:mno345',
        renderings: {},
        policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.9, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-with-modality',
      description: 'Clause with modality (certainty)',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'It is likely that the server will restart.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-server',
          kind: 'prediction',
          clauses: [
            { predicate: 'restart', roles: { subject: 'server' }, modality: 'likely' }
          ]
        },
        fingerprint: 'sha256:pqr678',
        renderings: {},
        policy: { eligible: true, category: 'prediction', risk: 'low', confidence: 0.7, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-complex-roles',
      description: 'Clause with many roles',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'User Alice sent a message to Bob via email about the project deadline.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-message',
          kind: 'tool_event',
          clauses: [
            { predicate: 'sent_message', roles: { subject: 'alice', recipient: 'bob', medium: 'email', topic: 'project_deadline' } }
          ]
        },
        fingerprint: 'sha256:stu901',
        renderings: {},
        policy: { eligible: true, category: 'tool_event', risk: 'low', confidence: 0.95, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-with-renderings',
      description: 'Record with existing renderings',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'The budget was approved for Q1.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-finance',
          kind: 'simple_fact',
          clauses: [
            { predicate: 'budget_approved', roles: { period: 'Q1' } }
          ]
        },
        fingerprint: 'sha256:vwx234',
        renderings: {
          en: { code: 'approve(budget, Q1)', profile: 'safe', tokens: 5 }
        },
        policy: { eligible: true, category: 'simple_fact', risk: 'low', confidence: 0.95, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-with-consequences',
      description: 'Clause with consequences',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'If the disk is full, delete temporary files.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-instruction',
          kind: 'conditional_instruction',
          clauses: [
            {
              predicate: 'delete_temp_files',
              roles: { object: 'temporary_files' },
              conditions: [
                { predicate: 'disk_full', roles: {} }
              ],
              consequences: [
                { predicate: 'free_space', roles: {} }
              ]
            }
          ]
        },
        fingerprint: 'sha256:yza567',
        renderings: {},
        policy: { eligible: true, category: 'conditional_instruction', risk: 'medium', confidence: 0.85, reasons: [] },
        meta: {}
      }
    },
    {
      id: 'test-empty-roles',
      description: 'Clause with minimal roles',
      record: {
        recordVersion: 'lunum-record/0.1-draft',
        source: { text: 'The system is running.', language: 'en', role: null, ref: null },
        sem: {
          schema: 'lunum-sem/0.1-draft',
          world: 'test-status',
          kind: 'system_fact',
          clauses: [
            { predicate: 'is_running', roles: { subject: 'system' } }
          ]
        },
        fingerprint: 'sha256:bcd890',
        renderings: {},
        policy: { eligible: true, category: 'system_fact', risk: 'low', confidence: 0.99, reasons: [] },
        meta: {}
      }
    }
  ];
}

// ── Conformance Test Runner ────────────────────────────────────────

/**
 * Run round-trip canonicalization tests for all profiles.
 *
 * For each test record and each profile type:
 * 1. Apply the profile to the record
 * 2. Canonicalize the original sem
 * 3. Canonicalize the profiled record's sem
 * 4. Compare canonical forms
 *
 * Returns a comprehensive conformance suite result.
 */
export function runConformanceSuite(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords()
): ConformanceSuiteResult {
  const generator = new ProfileGenerator();
  const profiles: ProfileType[] = ['safe', 'short', 'tight'];
  const results: ConformanceTestCaseResult[] = [];

  for (const { id: testCaseId, description, record } of records) {
    const testCaseResult: ConformanceTestCaseResult = {
      testCaseId,
      description,
      profileResults: [],
      allProfilesPass: true
    };

    const originalCanonical = stableStringify(canonicalizeSem(record.sem));

    for (const profile of profiles) {
      const profileResult = generator.profile(record, profile);
      const profiledCanonical = stableStringify(canonicalizeSem(profileResult.record.sem));
      const canonicalEqual = originalCanonical === profiledCanonical;

      const conformanceResult: ProfileConformanceResult = {
        profile,
        roundTripPass: canonicalEqual,
        originalCanonical,
        profiledCanonical,
        canonicalEqual,
        warnings: profileResult.warnings ?? [],
        tokenReduction: profileResult.reduction,
        preservation: profileResult.preservation
      };

      testCaseResult.profileResults.push(conformanceResult);

      if (!canonicalEqual) {
        testCaseResult.allProfilesPass = false;
      }
    }

    results.push(testCaseResult);
  }

  // Compute summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.allProfilesPass).length;
  const failedTests = totalTests - passedTests;

  const profileSummary: Record<ProfileType, { total: number; passed: number; passRate: number }> = {
    safe: { total: totalTests, passed: 0, passRate: 0 },
    short: { total: totalTests, passed: 0, passRate: 0 },
    tight: { total: totalTests, passed: 0, passRate: 0 }
  };

  for (const result of results) {
    for (const pr of result.profileResults) {
      profileSummary[pr.profile].passed += pr.canonicalEqual ? 1 : 0;
    }
  }

  for (const profile of profiles) {
    const ps = profileSummary[profile];
    ps.passRate = ps.total > 0 ? ps.passed / ps.total : 0;
  }

  return {
    totalTests,
    passedTests,
    failedTests,
    passRate: totalTests > 0 ? passedTests / totalTests : 0,
    results,
    profileSummary
  };
}

/**
 * Quick check: do all profiles preserve round-trip canonicalization?
 */
export function checkConformance(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords()
): { conforms: boolean; summary: ConformanceSuiteResult } {
  const summary = runConformanceSuite(records);
  return {
    conforms: summary.passRate === 1,
    summary
  };
}

/**
 * Get a summary of conformance failures.
 */
export interface ConformanceFailure {
  testCaseId: string;
  profile: ProfileType;
  originalCanonical: string;
  profiledCanonical: string;
}

export function getConformanceFailures(
  records: Array<{ id: string; description: string; record: LunumRecord }> = createTestRecords()
): ConformanceFailure[] {
  const summary = runConformanceSuite(records);
  const failures: ConformanceFailure[] = [];

  for (const result of summary.results) {
    for (const pr of result.profileResults) {
      if (!pr.canonicalEqual) {
        failures.push({
          testCaseId: result.testCaseId,
          profile: pr.profile,
          originalCanonical: pr.originalCanonical,
          profiledCanonical: pr.profiledCanonical
        });
      }
    }
  }

  return failures;
}

// ── Export ─────────────────────────────────────────────────────────

export const rendererConformanceExports = [
  createTestRecords,
  runConformanceSuite,
  checkConformance,
  getConformanceFailures
] as const;
