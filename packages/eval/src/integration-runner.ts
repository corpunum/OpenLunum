import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson } from './io.js';
import type { ExperimentManifest, ItemResult } from './types.js';

export interface IntegrationManifest extends ExperimentManifest {
  task: 'integration';
  integrationConfig?: {
    selectedIntegration: string;
    fixtureId: string;
  };
}

export interface IntegrationItemResult extends ItemResult {
  selectedIntegration: string;
  integrationVersion: string;
  entrypointType: 'in-process' | 'executable';
  fixtureId: string;
  resultStatus: 'success' | 'failed' | 'error';
  artifacts: Record<string, unknown>;
  schemaValid: boolean;
  requiredArtifactsPresent: boolean;
  environmentRequirements: Record<string, unknown>;
}

// Adapter result type: includes both the output data and the artifacts the adapter actually produced
export interface AdapterResult {
  status: 'success' | 'failed';
  data?: Record<string, unknown>;
  message: string;
  /** Artifacts the adapter actually produced (file names or keys) */
  producedArtifacts?: string[];
}

// Static repository-owned integration registry
// Selection is by static integration ID, not manifest-provided registry
const INTEGRATION_REGISTRY: Record<string, {
  version: string;
  entrypoint: 'in-process' | 'executable';
  allowedEnvironment: Record<string, unknown>;
  schema: Record<string, unknown>;
  /** Required artifact names the adapter must produce */
  requiredArtifacts: string[];
  /** Adapter function that returns its actual produced artifacts */
  adapter: (fixture: Record<string, unknown>) => Promise<AdapterResult>;
}> = {};

// Register test integrations from fixtures
function registerTestIntegrations(): void {
  // test-registry adapter: produces output.json and log.txt
  INTEGRATION_REGISTRY['test-registry'] = {
    version: '1.0.0',
    entrypoint: 'in-process',
    allowedEnvironment: {},
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' },
        data: { type: 'object' }
      },
      required: ['status', 'message']
    },
    requiredArtifacts: ['output.json', 'log.txt'],
    adapter: async (fixture) => {
      // Validate fixture has required fields
      if (!fixture.fixtureId) {
        return { status: 'failed', message: 'Fixture missing fixtureId' };
      }
      // Simulate in-process integration
      return {
        status: 'success',
        data: { processed: true, input: fixture.input ?? null },
        message: `Integration ${fixture.fixtureId} completed`,
        producedArtifacts: ['output.json', 'log.txt']
      };
    }
  };

  // no-output adapter: produces NO artifacts (for testing missing artifact detection)
  INTEGRATION_REGISTRY['test-no-output'] = {
    version: '1.0.0',
    entrypoint: 'in-process',
    allowedEnvironment: {},
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['status', 'message']
    },
    requiredArtifacts: ['output.json', 'log.txt'],
    adapter: async (_fixture) => {
      // Simulates an adapter that runs but produces no artifact files
      return {
        status: 'success',
        message: 'Integration completed with no output files',
        producedArtifacts: []
      };
    }
  };

  // test-bad-output adapter: returns output with WRONG TYPE for status (number instead of string)
  // Used to test schema type mismatch detection
  INTEGRATION_REGISTRY['test-bad-output'] = {
    version: '1.0.0',
    entrypoint: 'in-process',
    allowedEnvironment: {},
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['status', 'message']
    },
    requiredArtifacts: ['output.json'],
    adapter: async (_fixture) => {
      // Returns output with message explicitly undefined
      // Runner builds { status, message: undefined, ... } and validation rejects undefined values
      const msg = undefined as unknown as string;
      return { status: 'success', message: msg, data: { hasData: true } };
    }
  };

  // test-throws adapter: throws an exception during execution
  // Used to test error handling for thrown errors (not just returned failures)
  INTEGRATION_REGISTRY['test-throws'] = {
    version: '1.0.0',
    entrypoint: 'in-process',
    allowedEnvironment: {},
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['status', 'message']
    },
    requiredArtifacts: ['output.json'],
    adapter: async (_fixture) => {
      throw new Error('Simulated adapter crash');
    }
  };
}

/**
 * Deep JSON Schema validator against a simplified subset of JSON Schema.
 * Supports: type, properties, required, enum, additionalProperties, nested objects, arrays.
 * Used for validating integration adapter output against the registry's declared schema.
 */
export function validateAgainstSchema(data: Record<string, unknown>, schema: Record<string, unknown>): boolean {
  const schemaType = schema.type as string | undefined;

  // Validate top-level type
  if (schemaType === 'object' && typeof data !== 'object' || data === null) {
    return false;
  }
  if (schemaType === 'string' && typeof data !== 'string') {
    return false;
  }
  if (schemaType === 'number' && typeof data !== 'number') {
    return false;
  }
  if (schemaType === 'boolean' && typeof data !== 'boolean') {
    return false;
  }

  // Enum validation
  if (Array.isArray(schema.enum)) {
    const strData = typeof data === 'object' ? JSON.stringify(data) : data;
    const enumMatch = schema.enum.some((e: unknown) => {
      const strE = typeof e === 'object' ? JSON.stringify(e) : e;
      return strData === strE;
    });
    if (!enumMatch) return false;
  }

  // Object-level validation
  if (schemaType === 'object' && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];

    // Check required fields
    for (const field of required) {
      if (!(field in data)) return false;
    }

    // Validate each property against its sub-schema
    if (properties) {
      for (const [key, value] of Object.entries(data)) {
        if (key in properties && properties[key]) {
          if (!validateAgainstSchema(value as Record<string, unknown>, properties[key] as Record<string, unknown>)) {
            return false;
          }
        } else if (key in properties) {
          // properties[key] exists but is undefined, treat as valid (no constraint)
        } else {
          // Extra field not in properties
          const additional = schema.additionalProperties;
          if (additional === false) return false;
          // If additionalProperties is a schema object, validate against it
          if (typeof additional === 'object' && additional !== null && !Array.isArray(additional)) {
            if (!validateAgainstSchema(value as Record<string, unknown>, additional as Record<string, unknown>)) {
              return false;
            }
          }
        }
      }
    }
  }

  // Array validation
  if (schemaType === 'array' && Array.isArray(data)) {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items) {
      for (const item of data) {
        if (!validateAgainstSchema(item as Record<string, unknown>, items as Record<string, unknown>)) {
          return false;
        }
      }
    }
  }

  return true;
}

export async function runIntegrationExperiment(
  manifest: IntegrationManifest,
  root: string,
  outputDir: string
): Promise<IntegrationItemResult[]> {
  // Register integrations from fixtures
  registerTestIntegrations();

  if (!manifest.integrationConfig) {
    throw new Error('Missing integrationConfig in manifest');
  }

  const { selectedIntegration, fixtureId } = manifest.integrationConfig;

  // Check integration is in static allowlist
  const registry = INTEGRATION_REGISTRY[selectedIntegration];
  if (!registry) {
    return [{
      id: fixtureId,
      status: 'error',
      rawOutput: `Unknown integration ID: ${selectedIntegration}`,
      selectedIntegration: selectedIntegration,
      integrationVersion: '',
      entrypointType: 'in-process',
      fixtureId,
      resultStatus: 'error',
      artifacts: {},
      schemaValid: false,
      requiredArtifactsPresent: false,
      environmentRequirements: {},
      error: `Unknown integration ID: ${selectedIntegration}`,
      latencyMs: 0
    }];
  }

  // Load fixture
  const fixturePath = path.join(root, 'packages', 'eval', 'test-fixtures', 'integration', 'fixtures', `${fixtureId}.json`);
  let fixture: Record<string, unknown>;
  try {
    fixture = await readJson(fixturePath);
  } catch {
    return [{
      id: fixtureId,
      status: 'error',
      rawOutput: `Fixture not found: ${fixturePath}`,
      selectedIntegration: selectedIntegration,
      integrationVersion: registry.version,
      entrypointType: registry.entrypoint,
      fixtureId,
      resultStatus: 'error',
      artifacts: {},
      schemaValid: false,
      requiredArtifactsPresent: false,
      environmentRequirements: registry.allowedEnvironment,
      error: `Fixture not found: ${fixtureId}`,
      latencyMs: 0
    }];
  }

  // Execute adapter
  let adapterResult: Awaited<ReturnType<typeof registry['adapter']>>;
  let error: string | undefined;
  try {
    adapterResult = await registry.adapter(fixture as Record<string, unknown>);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
    adapterResult = { status: 'failed', message: error };
  }

  // Build artifacts from what the adapter actually produced
  const artifacts: Record<string, unknown> = {};
  const producedArtifacts = adapterResult.producedArtifacts ?? [];
  for (const artifactName of producedArtifacts) {
    if (artifactName === 'output.json') {
      artifacts[artifactName] = { ...adapterResult };
    } else if (artifactName === 'log.txt') {
      artifacts[artifactName] = { level: 'info', message: adapterResult.message };
    } else {
      // Generic artifact
      artifacts[artifactName] = { content: adapterResult.message };
    }
  }

  // Validate result against schema
  const schemaValid = validateAgainstSchema(
    { status: adapterResult.status, message: adapterResult.message, ...(adapterResult.data ?? {}) },
    registry.schema
  );

  // Check required artifacts present — compare adapter's declared output vs required
  const requiredArtifactsPresent = registry.requiredArtifacts.every(a => producedArtifacts.includes(a));

  const passed = adapterResult.status === 'success' && schemaValid && requiredArtifactsPresent;

  const result: IntegrationItemResult = {
    id: fixtureId,
    status: passed ? 'passed' : 'failed',
    rawOutput: JSON.stringify(adapterResult, null, 2),
    selectedIntegration: selectedIntegration,
    integrationVersion: registry.version,
    entrypointType: registry.entrypoint,
    fixtureId,
    resultStatus: adapterResult.status,
    artifacts,
    schemaValid,
    requiredArtifactsPresent,
    environmentRequirements: registry.allowedEnvironment,
    exact: passed,
    latencyMs: 0,
    error
  };

  // Write results
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const resultsPath = path.join(outputDir, 'integration-results.json');
    await writeJson(resultsPath, [result]);
  }

  return [result];
}
