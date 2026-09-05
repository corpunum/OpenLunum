/**
 * Stable machine-readable failure classification taxonomy.
 */

export type FailureClass =
  | 'provider_network_error'
  | 'provider_http_5xx'
  | 'provider_http_429'
  | 'provider_timeout'
  | 'provider_response_malformed'
  | 'truncation'
  | 'json_parse_error'
  | 'transport_schema_violation'
  | 'protocol_noncanonical'
  | 'wrong_predicate'
  | 'wrong_role'
  | 'wrong_entity'
  | 'wrong_negation'
  | 'wrong_modality'
  | 'wrong_time'
  | 'wrong_quantity'
  | 'protected_literal_mismatch'
  | 'unexpected_abstention'
  | 'unexpected_parse'
  | 'frame_requirement_violation'
  | 'frame_noncanonical'
  | 'ungrounded_reference'
  | 'identity_mismatch'
  | 'unknown_failure';

export interface ClassifiedFailure {
  failureClass: FailureClass;
  detail: string;
}

/**
 * Classifies an error, raw text, or semantic comparison discrepancy into
 * a stable machine-readable FailureClass.
 */
export function classifyFailure(error: unknown, context?: {
  rawOutput?: string;
  missingFeatures?: string[];
  invariants?: Array<{ code: string; detail?: string }>;
  frameIssues?: Array<{ code: string; message: string }>;
  abstained?: boolean;
  expectedOutcome?: 'parse' | 'abstain';
  status?: string;
}): ClassifiedFailure {
  if (context?.expectedOutcome === 'abstain' && context?.abstained === false) {
    return {
      failureClass: 'unexpected_parse',
      detail: 'Expected model to abstain, but candidate Sem was returned'
    };
  }

  if (context?.expectedOutcome !== 'abstain' && context?.abstained === true) {
    return {
      failureClass: 'unexpected_abstention',
      detail: 'Expected model to parse, but model abstained'
    };
  }

  if (context?.frameIssues && context.frameIssues.length > 0) {
    return {
      failureClass: context.frameIssues.some((i) => i.code === 'unexpected_role' || i.code === 'unframed_predicate') ? 'frame_noncanonical' : 'frame_requirement_violation',
      detail: context.frameIssues.map((i) => i.message).join('; ')
    };
  }

  if (context?.invariants && context.invariants.length > 0) {
    for (const inv of context.invariants) {
      if (inv.code === 'negation-flip') {
        return { failureClass: 'wrong_negation', detail: inv.detail ?? 'Negation mismatch' };
      }
      if (inv.code === 'obligation-permission') {
        return { failureClass: 'wrong_modality', detail: inv.detail ?? 'Modality mismatch' };
      }
      if (inv.code === 'role-identity') {
        return { failureClass: 'wrong_role', detail: inv.detail ?? 'Role binding mismatch' };
      }
      if (inv.code === 'protected-literal') {
        return { failureClass: 'protected_literal_mismatch', detail: inv.detail ?? 'Protected literal mismatch' };
      }
    }
  }

  if (context?.missingFeatures && context.missingFeatures.length > 0) {
    for (const feat of context.missingFeatures) {
      if (feat.startsWith('predicate:') || feat.includes(':predicate:')) {
        return { failureClass: 'wrong_predicate', detail: `Missing or incorrect predicate: ${feat}` };
      }
      if (feat.startsWith('negation:') || feat.includes(':negation:')) {
        return { failureClass: 'wrong_negation', detail: `Missing or incorrect negation: ${feat}` };
      }
      if (feat.startsWith('modality:') || feat.includes(':modality:')) {
        return { failureClass: 'wrong_modality', detail: `Missing or incorrect modality: ${feat}` };
      }
      if (feat.startsWith('role:') || feat.includes(':role:')) {
        return { failureClass: 'wrong_role', detail: `Missing or incorrect role: ${feat}` };
      }
      if (feat.includes(':entity:') || feat.includes(':referent:')) {
        return { failureClass: 'wrong_entity', detail: `Missing or incorrect entity: ${feat}` };
      }
      if (feat.includes(':time:')) {
        return { failureClass: 'wrong_time', detail: `Missing or incorrect time: ${feat}` };
      }
      if (feat.includes(':quantity:') || feat.includes(':value:')) {
        return { failureClass: 'wrong_quantity', detail: `Missing or incorrect quantity: ${feat}` };
      }
      if (feat.startsWith('literal:') || feat.includes(':literal:')) {
        return { failureClass: 'wrong_quantity', detail: `Missing or incorrect literal value: ${feat}` };
      }
      if (feat.includes('ungrounded reference')) {
        return { failureClass: 'ungrounded_reference', detail: feat };
      }
    }
  }

  if (context?.status === 'identity_mismatch') {
    return { failureClass: 'identity_mismatch', detail: 'Candidate did not match the canonical semantic identity' };
  }

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (lower.includes('timeout') || lower.includes('aborted')) {
      return { failureClass: 'provider_timeout', detail: msg };
    }
    if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network')) {
      return { failureClass: 'provider_network_error', detail: msg };
    }
    if (/http\s+5\d\d/u.test(lower)) {
      return { failureClass: 'provider_http_5xx', detail: msg };
    }
    if (/http\s+429/u.test(lower)) {
      return { failureClass: 'provider_http_429', detail: msg };
    }
    if (lower.includes('finish_reason: length') || lower.includes('max tokens') || lower.includes('truncat')) {
      return { failureClass: 'truncation', detail: msg };
    }
    if (lower.includes('json object') || lower.includes('json.parse') || lower.includes('unexpected token')) {
      return { failureClass: 'json_parse_error', detail: msg };
    }
    if (lower.includes('transport schema validation failed') || lower.includes('schema validation failed')) {
      return { failureClass: 'transport_schema_violation', detail: msg };
    }
    if (lower.includes('non-canonical protocol candidate') || lower.includes('protocol')) {
      return { failureClass: 'protocol_noncanonical', detail: msg };
    }
    if (lower.includes('ungrounded reference')) {
      return { failureClass: 'ungrounded_reference', detail: msg };
    }

    return { failureClass: 'unknown_failure', detail: msg };
  }

  return { failureClass: 'unknown_failure', detail: 'Unspecified failure' };
}
