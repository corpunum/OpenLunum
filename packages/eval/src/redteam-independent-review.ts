/**
 * Independent Red-Team Review Framework (R6.6)
 *
 * Structured framework for conducting and recording independent red-team
 * reviews of safety-critical preservation, retaining every discovered
 * false positive and false negative.
 */

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export type FindingStatus = 'open' | 'confirmed' | 'mitigated' | 'accepted-risk' | 'false-positive';

export type AttackCategory =
  | 'negation-bypass'
  | 'modality-confusion'
  | 'role-swap'
  | 'literal-mutation'
  | 'condition-inversion'
  | 'domain-boundary'
  | 'encoding-attack'
  | 'schema-abuse';

export interface RedTeamFinding {
  id: string;
  category: AttackCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  description: string;
  reproductionSteps: string;
  input: string;
  expectedBehaviour: string;
  actualBehaviour: string;
  isFalsePositive: boolean;
  isFalseNegative: boolean;
  mitigationApplied: string;
  discoveredAt: string;
  reviewerId: string;
}

export interface RedTeamReviewSession {
  sessionId: string;
  reviewerId: string;
  reviewerIndependent: boolean;
  startedAt: string;
  completedAt: string;
  scopeDescription: string;
  categoriesTested: readonly AttackCategory[];
  findings: RedTeamFinding[];
  falsePositiveCount: number;
  falseNegativeCount: number;
  coverageNotes: string;
}

export interface RedTeamReviewReport {
  sessions: RedTeamReviewSession[];
  totalFindings: number;
  bySeverity: Record<FindingSeverity, number>;
  byCategory: Record<string, number>;
  falsePositiveRate: number;
  falseNegativeRate: number;
  allCriticalMitigated: boolean;
  overallAssessment: string;
}

export const ALL_ATTACK_CATEGORIES: readonly AttackCategory[] = Object.freeze([
  'negation-bypass',
  'modality-confusion',
  'role-swap',
  'literal-mutation',
  'condition-inversion',
  'domain-boundary',
  'encoding-attack',
  'schema-abuse',
]);

export function validateFinding(finding: RedTeamFinding): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!finding.id) errors.push('missing finding id');
  if (!finding.title) errors.push('missing title');
  if (!finding.description) errors.push('missing description');
  if (!finding.reproductionSteps) errors.push('missing reproduction steps');
  if (!finding.input) errors.push('missing input');
  if (!finding.reviewerId) errors.push('missing reviewer id');

  const validSeverities = new Set<FindingSeverity>(['critical', 'high', 'medium', 'low', 'informational']);
  if (!validSeverities.has(finding.severity)) errors.push(`invalid severity: ${finding.severity}`);

  const validStatuses = new Set<FindingStatus>(['open', 'confirmed', 'mitigated', 'accepted-risk', 'false-positive']);
  if (!validStatuses.has(finding.status)) errors.push(`invalid status: ${finding.status}`);

  if (!ALL_ATTACK_CATEGORIES.includes(finding.category)) errors.push(`invalid category: ${finding.category}`);

  if (finding.severity === 'critical' && finding.status === 'accepted-risk') {
    errors.push('critical findings cannot be accepted as risk without mitigation');
  }

  return { valid: errors.length === 0, errors };
}

export function validateSession(session: RedTeamReviewSession): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!session.sessionId) errors.push('missing session id');
  if (!session.reviewerId) errors.push('missing reviewer id');
  if (!session.reviewerIndependent) errors.push('reviewer must be independent');
  if (!session.scopeDescription) errors.push('missing scope description');
  if (session.categoriesTested.length === 0) errors.push('no categories tested');

  for (const finding of session.findings) {
    const fv = validateFinding(finding);
    if (!fv.valid) {
      errors.push(...fv.errors.map(e => `finding ${finding.id}: ${e}`));
    }
  }

  const fps = session.findings.filter(f => f.isFalsePositive).length;
  if (fps !== session.falsePositiveCount) {
    errors.push(`falsePositiveCount mismatch: declared ${session.falsePositiveCount}, actual ${fps}`);
  }

  const fns = session.findings.filter(f => f.isFalseNegative).length;
  if (fns !== session.falseNegativeCount) {
    errors.push(`falseNegativeCount mismatch: declared ${session.falseNegativeCount}, actual ${fns}`);
  }

  return { valid: errors.length === 0, errors };
}

export function generateReport(sessions: RedTeamReviewSession[]): RedTeamReviewReport {
  const allFindings = sessions.flatMap(s => s.findings);
  const total = allFindings.length;

  const bySeverity: Record<FindingSeverity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, informational: 0,
  };
  const byCategory: Record<string, number> = {};

  for (const f of allFindings) {
    bySeverity[f.severity]++;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  const fps = allFindings.filter(f => f.isFalsePositive).length;
  const fns = allFindings.filter(f => f.isFalseNegative).length;
  const criticals = allFindings.filter(f => f.severity === 'critical');
  const allCriticalMitigated = criticals.every(f => f.status === 'mitigated');

  const categoriesCovered = new Set(sessions.flatMap(s => [...s.categoriesTested]));
  const uncovered = ALL_ATTACK_CATEGORIES.filter(c => !categoriesCovered.has(c));

  let assessment = '';
  if (criticals.length > 0 && !allCriticalMitigated) {
    assessment = 'BLOCKED: unmitigated critical findings exist';
  } else if (uncovered.length > 0) {
    assessment = `PARTIAL: ${uncovered.length} attack categories not yet tested (${uncovered.join(', ')})`;
  } else if (total === 0) {
    assessment = 'INCOMPLETE: no findings recorded — review may not have been thorough';
  } else {
    assessment = `PASS: ${total} findings across ${categoriesCovered.size} categories, all critical mitigated`;
  }

  return {
    sessions,
    totalFindings: total,
    bySeverity,
    byCategory,
    falsePositiveRate: total > 0 ? fps / total : 0,
    falseNegativeRate: total > 0 ? fns / total : 0,
    allCriticalMitigated,
    overallAssessment: assessment,
  };
}

export const SAMPLE_REVIEW_SESSION: RedTeamReviewSession = Object.freeze({
  sessionId: 'rt-session-001',
  reviewerId: 'independent-reviewer-alpha',
  reviewerIndependent: true,
  startedAt: '2026-08-01T00:00:00Z',
  completedAt: '2026-08-01T04:00:00Z',
  scopeDescription: 'Full safety-critical preservation review covering all 8 attack categories against hard gates, protected literals, prohibited domains and safety review policy',
  categoriesTested: Object.freeze([...ALL_ATTACK_CATEGORIES]) as readonly AttackCategory[],
  findings: Object.freeze([
    Object.freeze({
      id: 'RT-001',
      category: 'negation-bypass' as AttackCategory,
      severity: 'medium' as FindingSeverity,
      status: 'mitigated' as FindingStatus,
      title: 'Double negation not caught by hard gate',
      description: 'Sentence "I do not not want X" parses as positive intent but hard gate treats it as negation',
      reproductionSteps: 'Parse "I do not not want to delete the file" and compare with "I want to delete the file"',
      input: 'I do not not want to delete the file',
      expectedBehaviour: 'Hard gate should detect double negation and treat as positive',
      actualBehaviour: 'Hard gate fires negation-flip invariant incorrectly',
      isFalsePositive: true,
      isFalseNegative: false,
      mitigationApplied: 'Documented as known false positive; double negation is rare in production inputs',
      discoveredAt: '2026-08-01T01:30:00Z',
      reviewerId: 'independent-reviewer-alpha',
    }),
    Object.freeze({
      id: 'RT-002',
      category: 'literal-mutation' as AttackCategory,
      severity: 'low' as FindingSeverity,
      status: 'confirmed' as FindingStatus,
      title: 'URL with query params truncated in protected literal detection',
      description: 'URLs containing query parameters with & are split at the ampersand during literal detection',
      reproductionSteps: 'Include URL "https://example.com/path?a=1&b=2" in a sem and check literal preservation',
      input: 'Visit https://example.com/path?a=1&b=2 for details',
      expectedBehaviour: 'Full URL preserved as protected literal',
      actualBehaviour: 'URL truncated at first &',
      isFalsePositive: false,
      isFalseNegative: true,
      mitigationApplied: '',
      discoveredAt: '2026-08-01T02:15:00Z',
      reviewerId: 'independent-reviewer-alpha',
    }),
    Object.freeze({
      id: 'RT-003',
      category: 'domain-boundary' as AttackCategory,
      severity: 'informational' as FindingSeverity,
      status: 'confirmed' as FindingStatus,
      title: 'Educational medical content correctly blocked by prohibited domains',
      description: 'Non-actionable educational medical text ("The heart pumps blood") is blocked by prohibited-domain gate',
      reproductionSteps: 'Run enforceDomainGate on "The human heart has four chambers"',
      input: 'The human heart has four chambers',
      expectedBehaviour: 'Could be allowed since it is educational, not prescriptive',
      actualBehaviour: 'Blocked by medical domain gate — this is the intended conservative behaviour',
      isFalsePositive: true,
      isFalseNegative: false,
      mitigationApplied: 'Working as designed — conservative blocking is the documented policy for medical domain',
      discoveredAt: '2026-08-01T03:00:00Z',
      reviewerId: 'independent-reviewer-alpha',
    }),
  ]) as RedTeamFinding[],
  falsePositiveCount: 2,
  falseNegativeCount: 1,
  coverageNotes: 'All 8 attack categories tested. 3 findings retained including 2 false positives and 1 false negative.',
});
