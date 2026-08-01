/**
 * Rollback and incident handling for semantic safety defects (R6.7).
 *
 * Provides types and functions for planning rollbacks when semantic
 * safety defects are discovered, validating those plans, and
 * simulating full incident timelines.
 */

// ── Types ──────────────────────────────────────────────────────────

export type SafetyDefectType =
  | 'false-positive-match'
  | 'false-negative-mismatch'
  | 'role-swap-undetected'
  | 'negation-missed'
  | 'literal-corruption';

export interface SafetyDefect {
  readonly id: string;
  readonly type: SafetyDefectType;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly affectedVersions: string[];
  readonly discoveredAt: string;
}

export interface RollbackStep {
  readonly order: number;
  readonly action: string;
  readonly automated: boolean;
  readonly verification: string;
}

export interface RollbackPlan {
  readonly defect: SafetyDefect;
  readonly rollbackToVersion: string;
  readonly steps: RollbackStep[];
  readonly verificationChecks: string[];
  readonly estimatedDowntimeMinutes: number;
}

export interface PlanValidation {
  readonly valid: boolean;
  readonly issues: string[];
}

export type IncidentPhaseName =
  | 'detection'
  | 'assessment'
  | 'containment'
  | 'rollback'
  | 'verification'
  | 'postmortem';

export interface IncidentPhase {
  readonly name: IncidentPhaseName;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly actions: string[];
}

export interface IncidentTimeline {
  readonly defectId: string;
  readonly phases: IncidentPhase[];
  readonly totalDurationMinutes: number;
  readonly lessonsLearned: string[];
}

// ── Constants ──────────────────────────────────────────────────────

export const SAFETY_DEFECT_SCENARIOS: readonly SafetyDefect[] = [
  {
    id: 'SD-001',
    type: 'false-positive-match',
    description: 'Semantic matcher incorrectly flags safe content as harmful, causing unnecessary rejections.',
    severity: 'high',
    affectedVersions: ['1.2.0', '1.2.1'],
    discoveredAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'SD-002',
    type: 'false-negative-mismatch',
    description: 'Matcher fails to detect harmful content that should be flagged, allowing unsafe output.',
    severity: 'critical',
    affectedVersions: ['1.3.0'],
    discoveredAt: '2026-06-20T14:30:00Z',
  },
  {
    id: 'SD-003',
    type: 'role-swap-undetected',
    description: 'Role swap between user and assistant goes undetected, permitting privilege escalation.',
    severity: 'critical',
    affectedVersions: ['1.1.0', '1.2.0', '1.3.0'],
    discoveredAt: '2026-07-01T09:15:00Z',
  },
  {
    id: 'SD-004',
    type: 'negation-missed',
    description: 'Negation in safety constraints is missed, inverting the intended policy.',
    severity: 'high',
    affectedVersions: ['1.2.0'],
    discoveredAt: '2026-07-05T16:45:00Z',
  },
  {
    id: 'SD-005',
    type: 'literal-corruption',
    description: 'Protected literal tokens are corrupted during compaction, breaking safety markers.',
    severity: 'medium',
    affectedVersions: ['1.3.0', '1.3.1'],
    discoveredAt: '2026-07-10T11:00:00Z',
  },
] as const;

// ── Functions ──────────────────────────────────────────────────────

/**
 * Generate a rollback plan for a given safety defect.
 *
 * Produces a five-step plan: freeze deployments, notify stakeholders,
 * rollback to the safe version, verify no affected records remain, and
 * schedule a post-mortem.
 */
export function createRollbackPlan(
  defect: SafetyDefect,
  safeVersion: string,
): RollbackPlan {
  const steps: RollbackStep[] = [
    {
      order: 1,
      action: 'Freeze all deployments to prevent further exposure',
      automated: true,
      verification: 'Confirm deployment pipeline is paused and no releases are in-flight',
    },
    {
      order: 2,
      action: 'Notify stakeholders of the safety defect and rollback plan',
      automated: false,
      verification: 'Confirm notification sent to all stakeholders and acknowledged',
    },
    {
      order: 3,
      action: `Rollback to safe version ${safeVersion}`,
      automated: true,
      verification: `Confirm running version matches ${safeVersion} across all environments`,
    },
    {
      order: 4,
      action: 'Verify no affected records remain in production',
      automated: true,
      verification: 'Run audit query confirming zero records processed by affected versions',
    },
    {
      order: 5,
      action: 'Schedule and conduct post-mortem review',
      automated: false,
      verification: 'Post-mortem document published with root cause and preventive actions',
    },
  ];

  const downtimeMap: Record<SafetyDefect['severity'], number> = {
    critical: 30,
    high: 20,
    medium: 10,
    low: 5,
  };

  return {
    defect,
    rollbackToVersion: safeVersion,
    steps,
    verificationChecks: [
      'All services running safe version',
      'No affected records in production data',
      'Safety test suite passes on rolled-back version',
      'Stakeholders confirmed notification receipt',
    ],
    estimatedDowntimeMinutes: downtimeMap[defect.severity],
  };
}

/**
 * Validate that a rollback plan is complete and actionable.
 */
export function validateRollbackPlan(plan: RollbackPlan): PlanValidation {
  const issues: string[] = [];

  if (!plan.defect) {
    issues.push('Plan is missing defect information');
  }

  if (!plan.rollbackToVersion) {
    issues.push('Plan is missing rollback target version');
  }

  if (plan.steps.length < 3) {
    issues.push(`Plan has ${plan.steps.length} steps but requires at least 3`);
  }

  for (const step of plan.steps) {
    if (!step.verification) {
      issues.push(`Step ${step.order} ("${step.action}") is missing verification`);
    }
  }

  if (plan.verificationChecks.length === 0) {
    issues.push('Plan has no verification checks');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Simulate a full safety incident timeline for a given defect.
 *
 * Returns a timeline with all six incident phases, each populated with
 * relevant actions, plus lessons learned drawn from the defect type.
 */
export function simulateSafetyIncident(defect: SafetyDefect): IncidentTimeline {
  const baseTime = new Date(defect.discoveredAt).getTime();
  const minutesToMs = (m: number): number => m * 60_000;

  function makePhase(
    name: IncidentPhaseName,
    offsetMinutes: number,
    durationMinutes: number,
    actions: string[],
  ): IncidentPhase {
    const start = new Date(baseTime + minutesToMs(offsetMinutes));
    const end = new Date(baseTime + minutesToMs(offsetMinutes + durationMinutes));
    return {
      name,
      startedAt: start.toISOString(),
      completedAt: end.toISOString(),
      actions,
    };
  }

  const phases: IncidentPhase[] = [
    makePhase('detection', 0, 15, [
      `Safety defect ${defect.id} detected via automated monitoring`,
      `Defect type: ${defect.type}`,
      'Alert raised to on-call engineer',
    ]),
    makePhase('assessment', 15, 20, [
      `Severity assessed as ${defect.severity}`,
      `Affected versions identified: ${defect.affectedVersions.join(', ')}`,
      'Impact scope determined',
    ]),
    makePhase('containment', 35, 10, [
      'Deployment pipeline frozen',
      'Affected endpoints flagged for monitoring',
      'Traffic routing updated to reduce exposure',
    ]),
    makePhase('rollback', 45, 25, [
      'Rollback plan reviewed and approved',
      'Safe version deployed to staging for verification',
      'Safe version deployed to production',
    ]),
    makePhase('verification', 70, 30, [
      'All services confirmed running safe version',
      'Safety test suite executed and passed',
      'Audit confirms no residual affected records',
    ]),
    makePhase('postmortem', 100, 60, [
      'Root cause analysis completed',
      'Timeline of events documented',
      'Preventive measures identified and assigned',
    ]),
  ];

  const totalDurationMinutes = 160;

  const lessonsLearned: string[] = [
    `Defect type "${defect.type}" requires additional regression tests`,
    'Automated detection should be extended to cover this class of defect',
    'Rollback procedures should be rehearsed quarterly',
    `Affected versions (${defect.affectedVersions.join(', ')}) highlight gap in pre-release safety checks`,
  ];

  return {
    defectId: defect.id,
    phases,
    totalDurationMinutes,
    lessonsLearned,
  };
}
