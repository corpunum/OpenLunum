/**
 * Security Self-Assessment Framework (R15.2)
 *
 * Structured framework for evaluating security posture across
 * standardized categories. Produces a scored assessment with
 * evidence requirements and gap identification.
 */

export type SecurityDomain =
  | 'access-control'
  | 'data-protection'
  | 'input-validation'
  | 'dependency-management'
  | 'secret-management'
  | 'audit-logging'
  | 'incident-response'
  | 'tenant-isolation';

export type MaturityLevel = 'none' | 'ad-hoc' | 'defined' | 'managed' | 'optimized';

export type EvidenceKind = 'code-reference' | 'test-result' | 'config-file' | 'process-doc' | 'external-audit';

export interface SecurityControl {
  id: string;
  domain: SecurityDomain;
  title: string;
  description: string;
  requiredEvidence: readonly EvidenceKind[];
  weight: number;
}

export interface ControlAssessment {
  controlId: string;
  maturity: MaturityLevel;
  evidenceProvided: readonly EvidenceKind[];
  evidenceRefs: readonly string[];
  gaps: readonly string[];
  notes: string;
}

export interface DomainAssessment {
  domain: SecurityDomain;
  controls: readonly ControlAssessment[];
  maturityScore: number;
  maxScore: number;
  percentage: number;
  overallMaturity: MaturityLevel;
}

export interface SecuritySelfAssessmentReport {
  version: string;
  assessedAt: string;
  assessor: string;
  domains: readonly DomainAssessment[];
  overallScore: number;
  maxPossibleScore: number;
  overallPercentage: number;
  overallMaturity: MaturityLevel;
  criticalGaps: readonly string[];
  recommendations: readonly string[];
}

const MATURITY_SCORES: Record<MaturityLevel, number> = {
  'none': 0,
  'ad-hoc': 1,
  'defined': 2,
  'managed': 3,
  'optimized': 4,
};

export const SECURITY_CONTROLS: readonly SecurityControl[] = Object.freeze([
  Object.freeze({
    id: 'AC-1',
    domain: 'access-control' as SecurityDomain,
    title: 'API authentication',
    description: 'All API endpoints require authentication tokens',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 3,
  }),
  Object.freeze({
    id: 'AC-2',
    domain: 'access-control' as SecurityDomain,
    title: 'Role-based authorization',
    description: 'Endpoints enforce role-based access with least privilege',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'DP-1',
    domain: 'data-protection' as SecurityDomain,
    title: 'Data classification',
    description: 'All data stores have documented sensitivity classifications',
    requiredEvidence: Object.freeze(['process-doc', 'config-file']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'DP-2',
    domain: 'data-protection' as SecurityDomain,
    title: 'Encryption at rest',
    description: 'Sensitive data is encrypted at rest using industry-standard algorithms',
    requiredEvidence: Object.freeze(['code-reference', 'config-file']) as readonly EvidenceKind[],
    weight: 3,
  }),
  Object.freeze({
    id: 'IV-1',
    domain: 'input-validation' as SecurityDomain,
    title: 'Schema validation',
    description: 'All external inputs validated against defined schemas',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 3,
  }),
  Object.freeze({
    id: 'IV-2',
    domain: 'input-validation' as SecurityDomain,
    title: 'Injection prevention',
    description: 'Inputs sanitized to prevent injection attacks',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 3,
  }),
  Object.freeze({
    id: 'DM-1',
    domain: 'dependency-management' as SecurityDomain,
    title: 'Dependency auditing',
    description: 'Dependencies scanned for known vulnerabilities on every build',
    requiredEvidence: Object.freeze(['config-file', 'test-result']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'DM-2',
    domain: 'dependency-management' as SecurityDomain,
    title: 'Lockfile integrity',
    description: 'Lockfile integrity verified and tampering detected',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'SM-1',
    domain: 'secret-management' as SecurityDomain,
    title: 'Secret scanning',
    description: 'Automated scanning prevents secrets from entering the repository',
    requiredEvidence: Object.freeze(['config-file', 'test-result']) as readonly EvidenceKind[],
    weight: 3,
  }),
  Object.freeze({
    id: 'SM-2',
    domain: 'secret-management' as SecurityDomain,
    title: 'Secret rotation',
    description: 'Documented process for rotating secrets on compromise or schedule',
    requiredEvidence: Object.freeze(['process-doc']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'AL-1',
    domain: 'audit-logging' as SecurityDomain,
    title: 'Security event logging',
    description: 'Authentication failures, authorization denials, and anomalies are logged',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'IR-1',
    domain: 'incident-response' as SecurityDomain,
    title: 'Incident runbooks',
    description: 'Documented runbooks for common security incident types',
    requiredEvidence: Object.freeze(['process-doc']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'IR-2',
    domain: 'incident-response' as SecurityDomain,
    title: 'Evidence quarantine',
    description: 'Ability to quarantine and preserve evidence during incidents',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 2,
  }),
  Object.freeze({
    id: 'TI-1',
    domain: 'tenant-isolation' as SecurityDomain,
    title: 'Namespace isolation',
    description: 'Multi-tenant data separated by namespace with cross-tenant access prevented',
    requiredEvidence: Object.freeze(['code-reference', 'test-result']) as readonly EvidenceKind[],
    weight: 3,
  }),
]);

export function assessControl(
  control: SecurityControl,
  maturity: MaturityLevel,
  evidenceProvided: readonly EvidenceKind[],
  evidenceRefs: readonly string[],
  notes: string = '',
): ControlAssessment {
  const gaps: string[] = [];

  for (const req of control.requiredEvidence) {
    if (!evidenceProvided.includes(req)) {
      gaps.push(`missing ${req} evidence for ${control.id}`);
    }
  }

  if (maturity === 'none') {
    gaps.push(`${control.id}: not implemented`);
  }

  return {
    controlId: control.id,
    maturity,
    evidenceProvided,
    evidenceRefs,
    gaps,
    notes,
  };
}

export function assessDomain(
  domain: SecurityDomain,
  assessments: readonly ControlAssessment[],
): DomainAssessment {
  const domainControls = SECURITY_CONTROLS.filter(c => c.domain === domain);
  const maxScore = domainControls.reduce((sum, c) => sum + c.weight * 4, 0);

  let totalScore = 0;
  for (const assessment of assessments) {
    const control = domainControls.find(c => c.id === assessment.controlId);
    if (control) {
      totalScore += control.weight * MATURITY_SCORES[assessment.maturity];
    }
  }

  const percentage = maxScore > 0 ? totalScore / maxScore : 0;

  let overallMaturity: MaturityLevel;
  if (percentage >= 0.9) overallMaturity = 'optimized';
  else if (percentage >= 0.7) overallMaturity = 'managed';
  else if (percentage >= 0.5) overallMaturity = 'defined';
  else if (percentage > 0) overallMaturity = 'ad-hoc';
  else overallMaturity = 'none';

  return {
    domain,
    controls: assessments,
    maturityScore: totalScore,
    maxScore,
    percentage,
    overallMaturity,
  };
}

export function generateAssessmentReport(
  domainAssessments: readonly DomainAssessment[],
  assessor: string,
): SecuritySelfAssessmentReport {
  const overallScore = domainAssessments.reduce((sum, d) => sum + d.maturityScore, 0);
  const maxPossibleScore = domainAssessments.reduce((sum, d) => sum + d.maxScore, 0);
  const overallPercentage = maxPossibleScore > 0 ? overallScore / maxPossibleScore : 0;

  let overallMaturity: MaturityLevel;
  if (overallPercentage >= 0.9) overallMaturity = 'optimized';
  else if (overallPercentage >= 0.7) overallMaturity = 'managed';
  else if (overallPercentage >= 0.5) overallMaturity = 'defined';
  else if (overallPercentage > 0) overallMaturity = 'ad-hoc';
  else overallMaturity = 'none';

  const criticalGaps: string[] = [];
  const recommendations: string[] = [];

  for (const da of domainAssessments) {
    for (const ca of da.controls) {
      if (ca.maturity === 'none') {
        criticalGaps.push(`${ca.controlId}: not implemented`);
      }
      if (ca.gaps.length > 0) {
        recommendations.push(...ca.gaps);
      }
    }
  }

  if (overallPercentage < 0.5) {
    recommendations.push('Overall security posture below minimum threshold — prioritize critical gaps');
  }

  return {
    version: '1.0.0',
    assessedAt: new Date().toISOString(),
    assessor,
    domains: domainAssessments,
    overallScore,
    maxPossibleScore,
    overallPercentage,
    overallMaturity,
    criticalGaps,
    recommendations,
  };
}

export function runSampleAssessment(): SecuritySelfAssessmentReport {
  const allDomains = new Set(SECURITY_CONTROLS.map(c => c.domain));
  const domainAssessments: DomainAssessment[] = [];

  for (const domain of allDomains) {
    const controls = SECURITY_CONTROLS.filter(c => c.domain === domain);
    const assessments = controls.map(c =>
      assessControl(c, 'managed', [...c.requiredEvidence], [`ref:${c.id}`]),
    );
    domainAssessments.push(assessDomain(domain, assessments));
  }

  return generateAssessmentReport(domainAssessments, 'automated-self-assessment');
}
