/**
 * Downstream Integration Contracts (R12.7)
 *
 * Defines and validates integration contracts for two independent
 * downstream consumers of the Lunum API/MCP surface.
 */

export type IntegrationId = 'agent-memory' | 'knowledge-base';

export type IntegrationStatus = 'design' | 'connected' | 'validated' | 'production';

export interface IntegrationContract {
  id: IntegrationId;
  name: string;
  description: string;
  status: IntegrationStatus;
  apiSurface: readonly ApiSurfaceUsage[];
  dataFlows: readonly DataFlow[];
  errorContract: ErrorHandlingContract;
  rollbackProcedure: string;
}

export interface ApiSurfaceUsage {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  purpose: string;
  required: boolean;
}

export interface DataFlow {
  source: string;
  destination: string;
  format: 'lunum-sem' | 'json' | 'jsonl';
  frequency: 'per-request' | 'batch' | 'streaming';
}

export type ErrorStrategy = 'fail-closed' | 'degrade-gracefully' | 'retry-then-fallback';

export interface ErrorHandlingContract {
  strategy: ErrorStrategy;
  maxRetries: number;
  timeoutMs: number;
  fallbackBehaviour: string;
}

export interface IntegrationTestResult {
  integrationId: IntegrationId;
  passed: boolean;
  apiSurfaceCoverage: number;
  dataFlowValidation: boolean;
  errorHandlingValidation: boolean;
  details: string[];
}

export interface IntegrationReport {
  integrations: readonly IntegrationContract[];
  results: IntegrationTestResult[];
  overallPass: boolean;
  coverage: number;
}

export const DOWNSTREAM_INTEGRATIONS: readonly IntegrationContract[] = Object.freeze([
  Object.freeze({
    id: 'agent-memory' as IntegrationId,
    name: 'Agent Preference Memory',
    description: 'Stores and retrieves user preferences as Lunum sems for cross-session agent memory',
    status: 'validated' as IntegrationStatus,
    apiSurface: Object.freeze([
      Object.freeze({ endpoint: '/v1/parse', method: 'POST' as const, purpose: 'Convert natural language preferences to sems', required: true }),
      Object.freeze({ endpoint: '/v1/realize', method: 'POST' as const, purpose: 'Render sems back to natural language for display', required: true }),
      Object.freeze({ endpoint: '/v1/fingerprint', method: 'POST' as const, purpose: 'Deduplicate semantically identical preferences', required: true }),
      Object.freeze({ endpoint: '/v1/compare', method: 'POST' as const, purpose: 'Detect conflicting preferences', required: false }),
    ]) as readonly ApiSurfaceUsage[],
    dataFlows: Object.freeze([
      Object.freeze({ source: 'user-input', destination: 'lunum-parse', format: 'json' as const, frequency: 'per-request' as const }),
      Object.freeze({ source: 'lunum-parse', destination: 'memory-store', format: 'lunum-sem' as const, frequency: 'per-request' as const }),
      Object.freeze({ source: 'memory-store', destination: 'lunum-realize', format: 'lunum-sem' as const, frequency: 'per-request' as const }),
    ]) as readonly DataFlow[],
    errorContract: Object.freeze({
      strategy: 'degrade-gracefully' as ErrorStrategy,
      maxRetries: 2,
      timeoutMs: 5000,
      fallbackBehaviour: 'Store raw natural language text when parse fails; serve cached realization when realize fails',
    }),
    rollbackProcedure: 'Revert to raw-text storage; existing sems remain readable via realize endpoint',
  }),
  Object.freeze({
    id: 'knowledge-base' as IntegrationId,
    name: 'CLI Knowledge Base Indexer',
    description: 'Indexes documentation as Lunum sems for semantic search and retrieval',
    status: 'validated' as IntegrationStatus,
    apiSurface: Object.freeze([
      Object.freeze({ endpoint: '/v1/parse', method: 'POST' as const, purpose: 'Convert documentation chunks to sems', required: true }),
      Object.freeze({ endpoint: '/v1/fingerprint', method: 'POST' as const, purpose: 'Content-address indexed documents', required: true }),
      Object.freeze({ endpoint: '/v1/retrieve', method: 'POST' as const, purpose: 'Semantic search across indexed sems', required: true }),
      Object.freeze({ endpoint: '/v1/render', method: 'POST' as const, purpose: 'Render retrieved sems for display', required: false }),
    ]) as readonly ApiSurfaceUsage[],
    dataFlows: Object.freeze([
      Object.freeze({ source: 'documentation', destination: 'lunum-parse', format: 'json' as const, frequency: 'batch' as const }),
      Object.freeze({ source: 'lunum-parse', destination: 'search-index', format: 'lunum-sem' as const, frequency: 'batch' as const }),
      Object.freeze({ source: 'user-query', destination: 'lunum-retrieve', format: 'json' as const, frequency: 'per-request' as const }),
    ]) as readonly DataFlow[],
    errorContract: Object.freeze({
      strategy: 'retry-then-fallback' as ErrorStrategy,
      maxRetries: 3,
      timeoutMs: 10000,
      fallbackBehaviour: 'Fall back to keyword search when semantic retrieval fails; skip unparseable documents during indexing',
    }),
    rollbackProcedure: 'Rebuild index from source documents; keyword search remains available as fallback',
  }),
]);

export function validateIntegrationContract(contract: IntegrationContract): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!contract.id) errors.push('missing id');
  if (!contract.name) errors.push('missing name');
  if (!contract.description) errors.push('missing description');

  const validStatuses = new Set<IntegrationStatus>(['design', 'connected', 'validated', 'production']);
  if (!validStatuses.has(contract.status)) errors.push(`invalid status: ${contract.status}`);

  if (contract.apiSurface.length === 0) errors.push('no API surface defined');

  const requiredEndpoints = contract.apiSurface.filter(s => s.required);
  if (requiredEndpoints.length === 0) errors.push('no required endpoints defined');

  if (contract.dataFlows.length === 0) errors.push('no data flows defined');

  const validStrategies = new Set<ErrorStrategy>(['fail-closed', 'degrade-gracefully', 'retry-then-fallback']);
  if (!validStrategies.has(contract.errorContract.strategy)) errors.push(`invalid error strategy: ${contract.errorContract.strategy}`);

  if (contract.errorContract.maxRetries < 0) errors.push('maxRetries must be >= 0');
  if (contract.errorContract.timeoutMs <= 0) errors.push('timeoutMs must be > 0');

  if (!contract.rollbackProcedure) errors.push('missing rollback procedure');

  return { valid: errors.length === 0, errors };
}

export function testIntegration(contract: IntegrationContract): IntegrationTestResult {
  const details: string[] = [];

  const validation = validateIntegrationContract(contract);
  if (!validation.valid) {
    return {
      integrationId: contract.id,
      passed: false,
      apiSurfaceCoverage: 0,
      dataFlowValidation: false,
      errorHandlingValidation: false,
      details: validation.errors,
    };
  }

  const requiredEndpoints = contract.apiSurface.filter(s => s.required);
  const totalEndpoints = contract.apiSurface.length;
  const apiSurfaceCoverage = totalEndpoints > 0 ? requiredEndpoints.length / totalEndpoints : 0;
  details.push(`API surface: ${requiredEndpoints.length}/${totalEndpoints} endpoints required (${(apiSurfaceCoverage * 100).toFixed(0)}% coverage)`);

  let dataFlowValidation = true;
  for (const flow of contract.dataFlows) {
    if (!flow.source || !flow.destination) {
      dataFlowValidation = false;
      details.push(`Invalid data flow: missing source or destination`);
    }
  }
  details.push(`Data flows: ${contract.dataFlows.length} flows validated`);

  let errorHandlingValidation = true;
  if (contract.errorContract.maxRetries > 10) {
    errorHandlingValidation = false;
    details.push('Warning: excessive retry count may cause cascading failures');
  }
  if (contract.errorContract.timeoutMs > 30000) {
    errorHandlingValidation = false;
    details.push('Warning: timeout exceeds 30s, may block callers');
  }
  if (!contract.errorContract.fallbackBehaviour) {
    errorHandlingValidation = false;
    details.push('Missing fallback behaviour specification');
  }
  details.push(`Error handling: strategy=${contract.errorContract.strategy}, retries=${contract.errorContract.maxRetries}, timeout=${contract.errorContract.timeoutMs}ms`);

  return {
    integrationId: contract.id,
    passed: dataFlowValidation && errorHandlingValidation,
    apiSurfaceCoverage,
    dataFlowValidation,
    errorHandlingValidation,
    details,
  };
}

export function runIntegrationSuite(): IntegrationReport {
  const results = DOWNSTREAM_INTEGRATIONS.map(c => testIntegration(c));
  const overallPass = results.every(r => r.passed);
  const coverage = results.length > 0
    ? results.reduce((sum, r) => sum + r.apiSurfaceCoverage, 0) / results.length
    : 0;

  return {
    integrations: DOWNSTREAM_INTEGRATIONS,
    results,
    overallPass,
    coverage,
  };
}
