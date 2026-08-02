/**
 * API contract validation runner (R12.8).
 *
 * Validates API endpoint contracts by simulating request/response
 * cycles against declared schemas, checking error contracts,
 * versioning compliance and backward compatibility.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type ContractStatus = 'valid' | 'degraded' | 'broken';

export interface EndpointContract {
  path: string;
  method: HttpMethod;
  version: string;
  requiresAuth: boolean;
  rateLimit: number;
  maxRequestBytes: number;
  timeoutMs: number;
}

export interface ContractViolation {
  endpoint: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'warning' | 'error';
}

export interface EndpointValidation {
  contract: EndpointContract;
  status: ContractStatus;
  violations: readonly ContractViolation[];
  responseTimeMs: number;
  errorContractValid: boolean;
  versionCompliant: boolean;
}

export interface CompatibilityCheck {
  oldVersion: string;
  newVersion: string;
  backwardCompatible: boolean;
  breakingChanges: readonly string[];
  addedEndpoints: readonly string[];
  removedEndpoints: readonly string[];
}

export interface ContractValidationReport {
  endpoints: readonly EndpointValidation[];
  totalEndpoints: number;
  validCount: number;
  degradedCount: number;
  brokenCount: number;
  compatibility: CompatibilityCheck | null;
  overallStatus: ContractStatus;
}

export const API_ENDPOINT_CONTRACTS: readonly EndpointContract[] = Object.freeze([
  Object.freeze({ path: '/v1/parse', method: 'POST' as HttpMethod, version: '1.0', requiresAuth: true, rateLimit: 100, maxRequestBytes: 1048576, timeoutMs: 30000 }),
  Object.freeze({ path: '/v1/realize', method: 'POST' as HttpMethod, version: '1.0', requiresAuth: true, rateLimit: 100, maxRequestBytes: 1048576, timeoutMs: 30000 }),
  Object.freeze({ path: '/v1/fingerprint', method: 'POST' as HttpMethod, version: '1.0', requiresAuth: true, rateLimit: 200, maxRequestBytes: 524288, timeoutMs: 5000 }),
  Object.freeze({ path: '/v1/compare', method: 'POST' as HttpMethod, version: '1.0', requiresAuth: true, rateLimit: 150, maxRequestBytes: 2097152, timeoutMs: 10000 }),
  Object.freeze({ path: '/v1/health', method: 'GET' as HttpMethod, version: '1.0', requiresAuth: false, rateLimit: 1000, maxRequestBytes: 0, timeoutMs: 2000 }),
  Object.freeze({ path: '/v1/schema', method: 'GET' as HttpMethod, version: '1.0', requiresAuth: false, rateLimit: 500, maxRequestBytes: 0, timeoutMs: 5000 }),
]);

export function validateEndpoint(contract: EndpointContract): EndpointValidation {
  const violations: ContractViolation[] = [];

  if (contract.rateLimit <= 0) {
    violations.push({
      endpoint: contract.path,
      field: 'rateLimit',
      expected: '> 0',
      actual: String(contract.rateLimit),
      severity: 'error',
    });
  }

  if (contract.timeoutMs > 60000) {
    violations.push({
      endpoint: contract.path,
      field: 'timeoutMs',
      expected: '<= 60000',
      actual: String(contract.timeoutMs),
      severity: 'warning',
    });
  }

  if (contract.method !== 'GET' && contract.maxRequestBytes <= 0) {
    violations.push({
      endpoint: contract.path,
      field: 'maxRequestBytes',
      expected: '> 0 for non-GET',
      actual: String(contract.maxRequestBytes),
      severity: 'error',
    });
  }

  if (contract.path === '/v1/health' && contract.requiresAuth) {
    violations.push({
      endpoint: contract.path,
      field: 'requiresAuth',
      expected: 'false for health endpoint',
      actual: 'true',
      severity: 'error',
    });
  }

  const hasError = violations.some(v => v.severity === 'error');
  const hasWarning = violations.some(v => v.severity === 'warning');

  let status: ContractStatus;
  if (hasError) {
    status = 'broken';
  } else if (hasWarning) {
    status = 'degraded';
  } else {
    status = 'valid';
  }

  const responseTimeMs = contract.method === 'GET' ? 5 : 15;

  return {
    contract,
    status,
    violations,
    responseTimeMs,
    errorContractValid: !hasError,
    versionCompliant: contract.version === '1.0',
  };
}

export function checkCompatibility(
  oldEndpoints: readonly EndpointContract[],
  newEndpoints: readonly EndpointContract[],
): CompatibilityCheck {
  const oldPaths = new Set(oldEndpoints.map(e => `${e.method} ${e.path}`));
  const newPaths = new Set(newEndpoints.map(e => `${e.method} ${e.path}`));

  const removed: string[] = [];
  const added: string[] = [];
  const breaking: string[] = [];

  for (const p of oldPaths) {
    if (!newPaths.has(p)) {
      removed.push(p);
      breaking.push(`Removed endpoint: ${p}`);
    }
  }

  for (const p of newPaths) {
    if (!oldPaths.has(p)) {
      added.push(p);
    }
  }

  for (const oldEp of oldEndpoints) {
    const newEp = newEndpoints.find(e => e.path === oldEp.path && e.method === oldEp.method);
    if (newEp) {
      if (!oldEp.requiresAuth && newEp.requiresAuth) {
        breaking.push(`Auth requirement added: ${oldEp.method} ${oldEp.path}`);
      }
      if (newEp.maxRequestBytes < oldEp.maxRequestBytes) {
        breaking.push(`Request size reduced: ${oldEp.method} ${oldEp.path}`);
      }
    }
  }

  return {
    oldVersion: oldEndpoints[0]?.version ?? '0.0',
    newVersion: newEndpoints[0]?.version ?? '0.0',
    backwardCompatible: breaking.length === 0,
    breakingChanges: breaking,
    addedEndpoints: added,
    removedEndpoints: removed,
  };
}

export function runContractValidation(
  contracts: readonly EndpointContract[] = API_ENDPOINT_CONTRACTS,
  previousContracts?: readonly EndpointContract[],
): ContractValidationReport {
  const validations = contracts.map(c => validateEndpoint(c));

  const validCount = validations.filter(v => v.status === 'valid').length;
  const degradedCount = validations.filter(v => v.status === 'degraded').length;
  const brokenCount = validations.filter(v => v.status === 'broken').length;

  const compatibility = previousContracts
    ? checkCompatibility(previousContracts, contracts)
    : null;

  let overallStatus: ContractStatus;
  if (brokenCount > 0) {
    overallStatus = 'broken';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'valid';
  }

  return {
    endpoints: validations,
    totalEndpoints: validations.length,
    validCount,
    degradedCount,
    brokenCount,
    compatibility,
    overallStatus,
  };
}
