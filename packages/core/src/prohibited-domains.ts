/**
 * Prohibited automatic-use domains (Phase 8 readiness: R6.4, #465).
 *
 * Defines domains where automatic (unsupervised) use is prohibited until
 * domain-specific evidence of safety/accuracy exists. Initial domains:
 *  - legal_advice
 *  - medical_diagnosis
 *  - financial_advice
 *  - destructive_action_authorization
 *
 * Provides:
 *  - A domain classifier that scans candidate content for domain signals
 *  - A hard block (`evaluateDomainGate` / `enforceDomainGate`) for prohibited
 *    domains lacking an approved opt-in
 *  - An explicit opt-in mechanism (`DomainOptInRegistry`) that requires
 *    domain-specific evidence before automatic use is permitted
 */

// ── Domain Definitions ──────────────────────────────────────────────

export type ProhibitedDomainId =
  | 'legal_advice'
  | 'medical_diagnosis'
  | 'financial_advice'
  | 'destructive_action_authorization';

export const PROHIBITED_DOMAIN_IDS: readonly ProhibitedDomainId[] = Object.freeze([
  'legal_advice',
  'medical_diagnosis',
  'financial_advice',
  'destructive_action_authorization'
]);

export interface ProhibitedDomainSpec {
  /** Stable domain identifier */
  id: ProhibitedDomainId;
  /** Human-readable name */
  name: string;
  /** Why automatic use is prohibited for this domain */
  description: string;
  /** Case-insensitive keyword/phrase signals (substring match) */
  keywords: string[];
  /** Regex signals for higher-precision matches */
  patterns: RegExp[];
  /** Evidence categories required before opt-in can be approved */
  requiredEvidenceTypes: string[];
  /** Minimum number of evidence entries required (across required types) */
  minEvidenceCount: number;
}

/**
 * Registry of prohibited automatic-use domains and their signals.
 * New domains may be appended, but the initial four (R6.4) must not be
 * removed without a superseding readiness decision.
 */
export const PROHIBITED_DOMAIN_SPECS: Readonly<Record<ProhibitedDomainId, ProhibitedDomainSpec>> = Object.freeze({
  legal_advice: {
    id: 'legal_advice',
    name: 'Legal Advice',
    description: 'Guidance on legal rights, obligations, or strategy that could substitute for qualified counsel.',
    keywords: [
      'legal advice', 'sue', 'lawsuit', 'file a lawsuit', 'breach of contract',
      'is this legal', 'legal rights', 'statute of limitations', 'power of attorney',
      'liable for', 'legally binding', 'press charges', 'file for divorce', 'custody rights'
    ],
    patterns: [
      /\bshould\s+i\s+sue\b/iu,
      /\bwhat\s+are\s+my\s+(?:legal\s+)?rights\b/iu,
      /\bcan\s+(?:i|they|he|she)\s+(?:be\s+)?sued\b/iu,
      /\bam\s+i\s+legally\s+(?:required|obligated|liable)\b/iu
    ],
    requiredEvidenceTypes: ['jurisdiction_scope', 'qualified_review', 'liability_assessment'],
    minEvidenceCount: 3
  },
  medical_diagnosis: {
    id: 'medical_diagnosis',
    name: 'Medical Diagnosis',
    description: 'Interpretation of symptoms or determination of medical condition/treatment that could substitute for a clinician.',
    keywords: [
      'diagnose', 'diagnosis', 'symptoms of', 'do i have', 'prescribe', 'prescription dosage',
      'treatment plan for', 'is this a heart attack', 'is this cancer', 'medication dosage',
      'what disease', 'what condition do i have'
    ],
    patterns: [
      /\bdo\s+i\s+have\s+(?:a\s+)?(?:cancer|covid|diabetes|infection|disease)\b/iu,
      /\bwhat(?:'s| is)\s+wrong\s+with\s+me\b/iu,
      /\bis\s+this\s+(?:a\s+)?(?:heart\s+attack|stroke|serious)\b/iu,
      /\bhow\s+much\s+\w+\s+should\s+i\s+take\b/iu
    ],
    requiredEvidenceTypes: ['clinical_validation', 'qualified_review', 'safety_disclaimer'],
    minEvidenceCount: 3
  },
  financial_advice: {
    id: 'financial_advice',
    name: 'Financial Advice',
    description: 'Investment, tax, or portfolio guidance that could substitute for a licensed financial advisor.',
    keywords: [
      'financial advice', 'should i invest', 'which stocks', 'buy stock', 'sell stock',
      'invest in', 'retirement portfolio', 'asset allocation', 'tax deduction strategy',
      'is this a good investment', 'should i buy crypto', 'day trading strategy'
    ],
    patterns: [
      /\bshould\s+i\s+invest\s+in\b/iu,
      /\bwhich\s+stocks?\s+should\s+i\s+buy\b/iu,
      /\bis\s+(?:this|it)\s+a\s+good\s+(?:investment|time\s+to\s+buy)\b/iu,
      /\bhow\s+should\s+i\s+allocate\s+my\s+(?:401k|portfolio|savings)\b/iu
    ],
    requiredEvidenceTypes: ['regulatory_scope', 'qualified_review', 'liability_assessment'],
    minEvidenceCount: 3
  },
  destructive_action_authorization: {
    id: 'destructive_action_authorization',
    name: 'Destructive Action Authorization',
    description: 'Authorization of irreversible or highly damaging actions (deletion, wipe, revocation) without human confirmation.',
    keywords: [
      'delete all', 'delete production', 'drop database', 'drop table', 'format the drive',
      'wipe the server', 'wipe all data', 'rm -rf', 'terminate all instances',
      'shutdown all servers', 'revoke all access', 'delete the repository', 'force push to main'
    ],
    patterns: [
      /\brm\s+-rf\s+\S+/iu,
      /\bdrop\s+(?:table|database)\s+\S+/iu,
      /\bdelete\s+all\s+\S+/iu,
      /\b(?:wipe|format)\s+(?:the\s+)?(?:drive|disk|server|database)\b/iu
    ],
    requiredEvidenceTypes: ['human_confirmation', 'reversibility_assessment', 'blast_radius_review'],
    minEvidenceCount: 3
  }
});

// ── Domain Classifier ───────────────────────────────────────────────

export interface DomainClassificationInput {
  /** Candidate source text to scan for domain signals */
  sourceText?: string | undefined;
  /** Content category, if already known (used as a weak signal) */
  category?: string | undefined;
  /** Free-form tags associated with the content */
  tags?: string[] | undefined;
}

export interface DomainMatch {
  domain: ProhibitedDomainId;
  matchedKeywords: string[];
  matchedPatterns: string[];
  /** Heuristic confidence in [0, 1] that content falls in this domain */
  confidence: number;
}

export interface DomainClassificationResult {
  /** All matched domains, ordered by descending confidence */
  domains: DomainMatch[];
  /** True if at least one prohibited domain matched */
  isProhibited: boolean;
  /** Highest-confidence matched domain, or null if none matched */
  primaryDomain: ProhibitedDomainId | null;
}

function computeMatchConfidence(matchedKeywords: number, matchedPatterns: number, categoryBonus: boolean): number {
  if (matchedKeywords === 0 && matchedPatterns === 0) return 0;
  // Patterns are higher precision than keywords; weight accordingly.
  let raw = 0.35 + matchedKeywords * 0.12 + matchedPatterns * 0.25;
  // When the input category explicitly names this domain, give a small boost
  // so that an explicitly categorized signal is not overridden by a weaker
  // heuristic match on an unrelated domain.
  if (categoryBonus) raw += 0.05;
  return Math.min(1, raw);
}

/**
 * Classify candidate content against the prohibited-domain registry.
 *
 * This is a heuristic keyword/pattern classifier intended as a conservative
 * pre-filter: it is tuned to over-match (favor recall) since false positives
 * only route content to the hard-block/opt-in path, while false negatives
 * would allow prohibited-domain content through unchecked.
 */
export function classifyDomain(input: DomainClassificationInput): DomainClassificationResult {
  const text = (input.sourceText ?? '').toLowerCase();
  const tags = (input.tags ?? []).map((t) => t.toLowerCase());
  const category = (input.category ?? '').toLowerCase();
  const matches: DomainMatch[] = [];

  for (const domainId of PROHIBITED_DOMAIN_IDS) {
    const spec = PROHIBITED_DOMAIN_SPECS[domainId];
    const matchedKeywords: string[] = [];
    const matchedPatterns: string[] = [];

    if (text.length > 0) {
      for (const kw of spec.keywords) {
        if (text.includes(kw.toLowerCase())) matchedKeywords.push(kw);
      }
      for (const pattern of spec.patterns) {
        if (pattern.test(text)) matchedPatterns.push(pattern.source);
      }
    }

    // Tags provide a weaker, direct signal (e.g. tag === 'legal_advice').
    const tagHit = tags.includes(domainId) || tags.includes(domainId.replace(/_/gu, '-'));
    // The category field provides a direct, explicit signal (e.g. category === 'legal_advice').
    const categoryHit = category === domainId || category === domainId.replace(/_/gu, '-');

    if (matchedKeywords.length === 0 && matchedPatterns.length === 0 && !tagHit && !categoryHit) continue;

    let confidence: number;
    // When both text matches and category tag agree, confidence is near-certain.
    if (categoryHit && (matchedKeywords.length > 0 || matchedPatterns.length > 0)) {
      confidence = 1;
    } else {
      confidence = computeMatchConfidence(matchedKeywords.length, matchedPatterns.length, categoryHit);
      if (tagHit) confidence = Math.max(confidence, 0.95);
      if (categoryHit) confidence = Math.max(confidence, 0.95);
    }

    matches.push({
      domain: domainId,
      matchedKeywords,
      matchedPatterns,
      confidence
    });
  }

  matches.sort((a, b) => b.confidence - a.confidence);

  return {
    domains: matches,
    isProhibited: matches.length > 0,
    primaryDomain: matches.length > 0 ? matches[0]!.domain : null
  };
}

// ── Evidence & Opt-In ───────────────────────────────────────────────

export interface DomainEvidence {
  /** Evidence category; should match one of the domain's requiredEvidenceTypes */
  type: string;
  /** Human-readable description of the evidence */
  description: string;
  /** Optional pointer to a document, ticket, or record substantiating the evidence */
  reference?: string | undefined;
  /** ISO 8601 timestamp of when the evidence was verified */
  verifiedAt?: string | undefined;
}

export interface DomainEvidenceValidation {
  valid: boolean;
  missingTypes: string[];
  reasons: string[];
}

/**
 * Validate a set of evidence against a domain's requirements.
 * Evidence is valid only if all required evidence types are present at
 * least once, and the total count meets the domain's minimum.
 */
export function validateDomainEvidence(
  domain: ProhibitedDomainId,
  evidence: readonly DomainEvidence[]
): DomainEvidenceValidation {
  const spec = PROHIBITED_DOMAIN_SPECS[domain];
  const reasons: string[] = [];
  const presentTypes = new Set(evidence.map((e) => e.type));
  const missingTypes = spec.requiredEvidenceTypes.filter((t) => !presentTypes.has(t));

  if (missingTypes.length > 0) {
    reasons.push(`missing_evidence_types:${missingTypes.join(',')}`);
  }
  if (evidence.length < spec.minEvidenceCount) {
    reasons.push(`insufficient_evidence_count:${evidence.length}/${spec.minEvidenceCount}`);
  }
  for (const e of evidence) {
    if (!e.description || e.description.trim().length === 0) {
      reasons.push(`empty_evidence_description:${e.type}`);
    }
  }

  return {
    valid: reasons.length === 0,
    missingTypes,
    reasons
  };
}

export interface DomainOptIn {
  domain: ProhibitedDomainId;
  evidence: DomainEvidence[];
  /** Identity of the human/process approving automatic use for this domain */
  approvedBy: string;
  /** ISO 8601 timestamp of approval */
  approvedAt: string;
  /** Free-text justification for the opt-in */
  justification: string;
}

export interface DomainOptInResult {
  ok: boolean;
  optIn: DomainOptIn | null;
  validation: DomainEvidenceValidation;
}

/**
 * Registry of explicit, evidence-backed opt-ins that permit automatic use
 * of an otherwise-prohibited domain. An opt-in is only accepted (and stored)
 * when its evidence satisfies `validateDomainEvidence`.
 */
export class DomainOptInRegistry {
  private optIns: Map<ProhibitedDomainId, DomainOptIn[]>;

  constructor() {
    this.optIns = new Map();
  }

  /**
   * Attempt to register an opt-in. Rejected (invalid-evidence) opt-ins are
   * not stored; call sites must not treat automatic use as permitted unless
   * `ok` is true.
   */
  register(optIn: DomainOptIn): DomainOptInResult {
    const validation = validateDomainEvidence(optIn.domain, optIn.evidence);
    if (!validation.valid) {
      return { ok: false, optIn: null, validation };
    }
    if (!optIn.approvedBy || optIn.approvedBy.trim().length === 0) {
      return {
        ok: false,
        optIn: null,
        validation: { valid: false, missingTypes: [], reasons: ['missing_approver'] }
      };
    }

    const existing = this.optIns.get(optIn.domain) ?? [];
    existing.push(optIn);
    this.optIns.set(optIn.domain, existing);
    return { ok: true, optIn, validation };
  }

  /** True if the domain has at least one valid, registered opt-in. */
  isOptedIn(domain: ProhibitedDomainId): boolean {
    return (this.optIns.get(domain)?.length ?? 0) > 0;
  }

  /** All registered opt-ins for a domain, most-recent last. */
  getOptIns(domain: ProhibitedDomainId): DomainOptIn[] {
    return [...(this.optIns.get(domain) ?? [])];
  }

  /** Remove all opt-ins for a domain, reinstating the hard block. */
  revoke(domain: ProhibitedDomainId): void {
    this.optIns.delete(domain);
  }

  /** Clear the entire registry. */
  clear(): void {
    this.optIns.clear();
  }
}

/** Default, process-wide opt-in registry. Prefer a dedicated instance in tests. */
export const defaultDomainOptInRegistry = new DomainOptInRegistry();

// ── Hard Block / Gate ───────────────────────────────────────────────

/** Minimum classifier confidence required to trigger the hard block. */
export const DOMAIN_BLOCK_CONFIDENCE_THRESHOLD = 0.5;

export interface DomainGateDecision {
  /** True if automatic use is permitted (no prohibited domain matched, or a valid opt-in exists) */
  allowed: boolean;
  /** True if the hard block is in effect */
  blocked: boolean;
  /** Highest-confidence prohibited domain matched, if any */
  domain: ProhibitedDomainId | null;
  /** Full classification result for observability */
  classification: DomainClassificationResult;
  /** True if the block could be lifted via a valid opt-in but none exists yet */
  requiresOptIn: boolean;
  /** Evidence types still missing for the matched domain (empty if not applicable) */
  missingEvidenceTypes: string[];
  reasons: string[];
}

/**
 * Evaluate whether content may be used automatically, applying the R6.4
 * hard block for prohibited domains unless a valid, evidence-backed opt-in
 * has been registered for the matched domain.
 */
export function evaluateDomainGate(
  input: DomainClassificationInput,
  registry: DomainOptInRegistry = defaultDomainOptInRegistry
): DomainGateDecision {
  const classification = classifyDomain(input);
  const reasons: string[] = [];

  if (!classification.isProhibited || classification.primaryDomain === null) {
    return {
      allowed: true,
      blocked: false,
      domain: null,
      classification,
      requiresOptIn: false,
      missingEvidenceTypes: [],
      reasons: []
    };
  }

  // Evaluate ALL domains above threshold, not just the primary.
  // If any matched prohibited domain above threshold lacks an opt-in, block.
  const unoptedInDomains: DomainMatch[] = [];
  for (const match of classification.domains) {
    if (match.confidence < DOMAIN_BLOCK_CONFIDENCE_THRESHOLD) {
      reasons.push(`below_block_threshold:${match.domain}:${match.confidence.toFixed(2)}`);
      continue;
    }
    if (!registry.isOptedIn(match.domain)) {
      unoptedInDomains.push(match);
    }
  }

  // If all above-threshold domains are opted-in, allow.
  if (unoptedInDomains.length === 0) {
    const optedInDomains = classification.domains
      .filter((m) => m.confidence >= DOMAIN_BLOCK_CONFIDENCE_THRESHOLD)
      .map((m) => m.domain);
    reasons.push(
      ...optedInDomains.map((d) => `opt_in_present:${d}`)
    );
    return {
      allowed: true,
      blocked: false,
      domain: classification.primaryDomain,
      classification,
      requiresOptIn: false,
      missingEvidenceTypes: [],
      reasons
    };
  }

  // Block on the first unopted-in domain above threshold.
  const blocked = unoptedInDomains[0]!;
  const domain = blocked.domain;
  const spec = PROHIBITED_DOMAIN_SPECS[domain];
  reasons.push(`prohibited_domain:${domain}`);
  if (unoptedInDomains.length > 1) {
    reasons.push(
      `additional_unopted_in:${unoptedInDomains.slice(1).map((m) => m.domain).join(',')}`
    );
  }
  return {
    allowed: false,
    blocked: true,
    domain,
    classification,
    requiresOptIn: true,
    missingEvidenceTypes: [...spec.requiredEvidenceTypes],
    reasons
  };
}

/** Error thrown by `enforceDomainGate` when content is hard-blocked. */
export class ProhibitedDomainError extends Error {
  readonly domain: ProhibitedDomainId;
  readonly decision: DomainGateDecision;

  constructor(decision: DomainGateDecision) {
    const domain = decision.domain ?? 'unknown';
    super(`Automatic use blocked: prohibited domain "${domain}" without a valid opt-in (R6.4).`);
    this.name = 'ProhibitedDomainError';
    this.domain = decision.domain ?? ('unknown' as ProhibitedDomainId);
    this.decision = decision;
  }
}

/**
 * Enforce the R6.4 hard block: throws `ProhibitedDomainError` if content
 * falls in a prohibited domain without a valid opt-in, otherwise returns the
 * (allowed) gate decision.
 */
export function enforceDomainGate(
  input: DomainClassificationInput,
  registry: DomainOptInRegistry = defaultDomainOptInRegistry
): DomainGateDecision {
  const decision = evaluateDomainGate(input, registry);
  if (decision.blocked) {
    throw new ProhibitedDomainError(decision);
  }
  return decision;
}

// ── Export to prevent tree-shaking ──────────────────────────────────

export const prohibitedDomainsExports = [
  classifyDomain,
  validateDomainEvidence,
  evaluateDomainGate,
  enforceDomainGate,
  DomainOptInRegistry,
  ProhibitedDomainError
] as const;
