import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const MODEL_FAMILY_EVAL_VERSION = '0.1.0' as const;

export type ModelFamilyId = 'qwen' | 'gemma' | 'llama';

export const REQUIRED_FAMILIES: readonly ModelFamilyId[] = ['qwen', 'gemma', 'llama'] as const;

export interface ModelFamilyProfile {
  profileId: string;
  family: ModelFamilyId;
  displayName: string;
  architecture: string;
  quantization: string;
  parameterCount: string;
  profilePath: string;
  profileSha256: string;
}

export interface ParseSample {
  itemId: string;
  sourceText: string;
  sourceLanguage: string;
  rawOutput: string;
  parsedSuccessfully: boolean;
  hasValidSchema: boolean;
  latencyMs: number;
}

export interface ModelFamilyResult {
  schema: 'openlunum-model-family-eval/0.1';
  version: typeof MODEL_FAMILY_EVAL_VERSION;
  runId: string;
  runTimestamp: string;
  model: ModelFamilyProfile;
  dataset: {
    path: string;
    sha256: string;
    itemCount: number;
  };
  samples: ParseSample[];
  summary: {
    totalItems: number;
    parsedCount: number;
    validSchemaCount: number;
    parseRate: number;
    validSchemaRate: number;
    meanLatencyMs: number;
    medianLatencyMs: number;
  };
}

export interface ModelFamilyBundle {
  schema: 'openlunum-model-family-bundle/0.1';
  version: typeof MODEL_FAMILY_EVAL_VERSION;
  families: ModelFamilyId[];
  results: ModelFamilyResult[];
  coverage: {
    familiesTested: number;
    familiesRequired: number;
    quantizationsPerFamily: Record<ModelFamilyId, number>;
    allFamiliesCovered: boolean;
    multipleQuantizations: boolean;
  };
}

export function validateModelFamilyResult(result: ModelFamilyResult): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (result.schema !== 'openlunum-model-family-eval/0.1') {
    errors.push(`invalid schema: ${result.schema}`);
  }
  if (!result.runId) errors.push('missing runId');
  if (!result.runTimestamp) errors.push('missing runTimestamp');
  if (!result.model.profileId) errors.push('missing model.profileId');
  if (!REQUIRED_FAMILIES.includes(result.model.family)) {
    errors.push(`unknown family: ${result.model.family}`);
  }
  if (!result.model.profileSha256 || !/^[a-f0-9]{64}$/u.test(result.model.profileSha256)) {
    errors.push('invalid or missing profileSha256');
  }
  if (!result.dataset.sha256 || !/^[a-f0-9]{64}$/u.test(result.dataset.sha256)) {
    errors.push('invalid or missing dataset sha256');
  }
  if (result.samples.length === 0) {
    errors.push('no samples');
  }
  if (result.summary.totalItems !== result.samples.length) {
    errors.push(`summary.totalItems (${result.summary.totalItems}) !== samples.length (${result.samples.length})`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateModelFamilyBundle(bundle: ModelFamilyBundle): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (bundle.schema !== 'openlunum-model-family-bundle/0.1') {
    errors.push(`invalid bundle schema: ${bundle.schema}`);
  }

  const testedFamilies = new Set(bundle.results.map(r => r.model.family));
  for (const required of REQUIRED_FAMILIES) {
    if (!testedFamilies.has(required)) {
      errors.push(`missing required family: ${required}`);
    }
  }

  if (!bundle.coverage.allFamiliesCovered) {
    errors.push('not all required families covered');
  }

  for (const result of bundle.results) {
    const rv = validateModelFamilyResult(result);
    if (!rv.ok) {
      errors.push(...rv.errors.map(e => `${result.model.profileId}: ${e}`));
    }
  }

  return { ok: errors.length === 0, errors };
}

export function buildBundle(results: ModelFamilyResult[]): ModelFamilyBundle {
  const familySet = new Set(results.map(r => r.model.family));
  const quantsPerFamily = new Map<string, Set<string>>();
  for (const r of results) {
    let s = quantsPerFamily.get(r.model.family);
    if (!s) {
      s = new Set();
      quantsPerFamily.set(r.model.family, s);
    }
    s.add(r.model.quantization);
  }

  const quantizationsPerFamily = {} as Record<ModelFamilyId, number>;
  for (const fam of REQUIRED_FAMILIES) {
    quantizationsPerFamily[fam] = quantsPerFamily.get(fam)?.size ?? 0;
  }

  const hasMultiple = Object.values(quantizationsPerFamily).some(n => n >= 2);

  return {
    schema: 'openlunum-model-family-bundle/0.1',
    version: MODEL_FAMILY_EVAL_VERSION,
    families: [...familySet].sort() as ModelFamilyId[],
    results,
    coverage: {
      familiesTested: familySet.size,
      familiesRequired: REQUIRED_FAMILIES.length,
      quantizationsPerFamily,
      allFamiliesCovered: REQUIRED_FAMILIES.every(f => familySet.has(f)),
      multipleQuantizations: hasMultiple,
    },
  };
}

export async function hashProfileFile(profilePath: string): Promise<string> {
  const content = await readFile(profilePath);
  return createHash('sha256').update(content).digest('hex');
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid] ?? 0;
  const b = sorted[mid - 1] ?? 0;
  return sorted.length % 2 ? a : (b + a) / 2;
}

export function summarizeSamples(samples: ParseSample[]): ModelFamilyResult['summary'] {
  const parsedCount = samples.filter(s => s.parsedSuccessfully).length;
  const validSchemaCount = samples.filter(s => s.hasValidSchema).length;
  const latencies = samples.map(s => s.latencyMs);
  const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return {
    totalItems: samples.length,
    parsedCount,
    validSchemaCount,
    parseRate: samples.length > 0 ? parsedCount / samples.length : 0,
    validSchemaRate: samples.length > 0 ? validSchemaCount / samples.length : 0,
    meanLatencyMs: Math.round(mean * 100) / 100,
    medianLatencyMs: computeMedian(latencies),
  };
}
