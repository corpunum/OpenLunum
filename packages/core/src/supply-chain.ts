import { createHash } from 'node:crypto';
import { readFile, access, stat } from 'node:fs/promises';

export const THREAT_MODEL_VERSION = '1.0.0' as const;

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export type ThreatCategory =
  | 'injection'
  | 'data-exfiltration'
  | 'supply-chain'
  | 'denial-of-service'
  | 'privilege-escalation'
  | 'model-poisoning'
  | 'prompt-injection'
  | 'data-integrity';

export interface ThreatEntry {
  id: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  title: string;
  description: string;
  mitigations: string[];
}

export const THREAT_MODEL: readonly ThreatEntry[] = [
  {
    id: 'T-001',
    category: 'prompt-injection',
    severity: 'high',
    title: 'Prompt injection via crafted input text',
    description: 'Adversarial input text could manipulate the LLM parser to produce incorrect semantic representations or bypass safety constraints.',
    mitigations: ['Input validation via validateSem', 'Policy classifier with risk levels', 'High-risk detection and natural-text fallback (R6.5)', 'Protected literal verification'],
  },
  {
    id: 'T-002',
    category: 'data-integrity',
    severity: 'high',
    title: 'Semantic representation corruption',
    description: 'Malformed or tampered Sem objects could bypass validation and corrupt downstream processing.',
    mitigations: ['Schema validation (validateSem)', 'Fingerprint verification', 'Canonicalization with frozen rules', 'Immutable dataset manifests with SHA-256'],
  },
  {
    id: 'T-003',
    category: 'supply-chain',
    severity: 'critical',
    title: 'Dependency compromise via malicious package',
    description: 'A compromised npm dependency could inject malicious code into the build or runtime.',
    mitigations: ['Lockfile integrity check in CI', 'Package audit in CI pipeline', 'Minimal dependency footprint', 'Pinned versions in lockfile'],
  },
  {
    id: 'T-004',
    category: 'model-poisoning',
    severity: 'high',
    title: 'Model weight tampering',
    description: 'Modified model weights could produce systematically biased or incorrect semantic parses.',
    mitigations: ['Model identity verification (SHA-256 weight hash)', 'Accepted renderer profiles with tokenizer identity', 'Retention baselines per model family'],
  },
  {
    id: 'T-005',
    category: 'data-exfiltration',
    severity: 'medium',
    title: 'Protected literal leakage',
    description: 'Sensitive values (dates, IDs, URLs) marked as protected literals could be leaked through logs or error messages.',
    mitigations: ['Protected literal presence checks', 'No protected data in error responses', 'Data boundary CI check'],
  },
  {
    id: 'T-006',
    category: 'denial-of-service',
    severity: 'medium',
    title: 'Resource exhaustion via oversized input',
    description: 'Large input texts or deeply nested Sem objects could exhaust memory or CPU.',
    mitigations: ['Request size limits (API: 1MB, MCP: 512KB)', 'Rate limiting', 'Timeout enforcement', 'Bounded-memory streaming JSONL processing'],
  },
  {
    id: 'T-007',
    category: 'injection',
    severity: 'medium',
    title: 'Cross-site scripting via rendered output',
    description: 'Rendered Sem output containing user-controlled text could enable XSS if embedded in HTML.',
    mitigations: ['Render profiles produce plain text, not HTML', 'Output encoding responsibility documented', 'No HTML rendering in core library'],
  },
  {
    id: 'T-008',
    category: 'privilege-escalation',
    severity: 'medium',
    title: 'Tenant isolation bypass',
    description: 'A tenant could access another tenant\'s data or exceed their permissions.',
    mitigations: ['Per-tenant API key validation', 'Permission-based access control', 'Tenant context isolation in API contract'],
  },
] as const;

export interface LockfileVerificationResult {
  ok: boolean;
  lockfileExists: boolean;
  lockfileHash?: string;
  errors: string[];
}

export async function verifyLockfile(lockfilePath: string): Promise<LockfileVerificationResult> {
  const errors: string[] = [];
  try {
    await access(lockfilePath);
  } catch {
    return { ok: false, lockfileExists: false, errors: ['lockfile not found'] };
  }

  try {
    const content = await readFile(lockfilePath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    if (content.length === 0) {
      errors.push('lockfile is empty');
    }
    return { ok: errors.length === 0, lockfileExists: true, lockfileHash: hash, errors };
  } catch (e) {
    errors.push(`failed to read lockfile: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, lockfileExists: true, errors };
  }
}

export interface ArtifactVerificationResult {
  ok: boolean;
  path: string;
  exists: boolean;
  sizeBytes?: number;
  hash?: string;
  errors: string[];
}

export async function verifyArtifact(artifactPath: string, expectedHash?: string): Promise<ArtifactVerificationResult> {
  const errors: string[] = [];
  try {
    await access(artifactPath);
  } catch {
    return { ok: false, path: artifactPath, exists: false, errors: ['artifact not found'] };
  }

  try {
    const stats = await stat(artifactPath);
    const content = await readFile(artifactPath);
    const hash = createHash('sha256').update(content).digest('hex');

    if (expectedHash && hash !== expectedHash) {
      errors.push(`hash mismatch: expected ${expectedHash}, got ${hash}`);
    }

    return { ok: errors.length === 0, path: artifactPath, exists: true, sizeBytes: stats.size, hash, errors };
  } catch (e) {
    errors.push(`failed to verify artifact: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, path: artifactPath, exists: true, errors };
  }
}

export interface IncidentExercise {
  id: string;
  scenario: string;
  steps: string[];
  expectedOutcome: string;
  rollbackProcedure: string;
}

export const INCIDENT_EXERCISES: readonly IncidentExercise[] = [
  {
    id: 'EX-001',
    scenario: 'Corrupted dataset detected in production',
    steps: [
      'Identify affected dataset via manifest SHA-256 mismatch',
      'Halt all experiment runs referencing the corrupted dataset',
      'Restore dataset from last known good commit',
      'Verify restored dataset hash matches manifest',
      'Resume experiment runs',
    ],
    expectedOutcome: 'Dataset integrity restored, no corrupted results accepted',
    rollbackProcedure: 'git checkout <last-good-commit> -- datasets/<affected-file>',
  },
  {
    id: 'EX-002',
    scenario: 'Model producing incorrect semantic parses after update',
    steps: [
      'Detect via retention baseline regression',
      'Identify model version change via model identity verification',
      'Revert to previous model checkpoint',
      'Re-run retention experiment to confirm baseline restored',
      'Investigate root cause in model update',
    ],
    expectedOutcome: 'Parse quality restored to baseline, model pinned to known-good version',
    rollbackProcedure: 'Revert model profile to previous checkpoint path',
  },
  {
    id: 'EX-003',
    scenario: 'Supply chain compromise via dependency update',
    steps: [
      'CI lockfile verification fails after dependency update',
      'Identify changed packages via lockfile diff',
      'Check npm audit for known vulnerabilities',
      'Revert lockfile to last known good state',
      'Pin affected dependency version',
      'Re-run CI pipeline to confirm clean build',
    ],
    expectedOutcome: 'Compromised dependency removed, lockfile integrity restored',
    rollbackProcedure: 'git checkout <pre-update-commit> -- pnpm-lock.yaml',
  },
] as const;

export function getThreatModel(): { version: string; threats: readonly ThreatEntry[]; exercises: readonly IncidentExercise[] } {
  return { version: THREAT_MODEL_VERSION, threats: THREAT_MODEL, exercises: INCIDENT_EXERCISES };
}
