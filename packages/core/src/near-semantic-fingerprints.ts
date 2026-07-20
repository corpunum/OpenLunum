import { createHash } from 'node:crypto';
import type { LunumClause, LunumRecord, LunumSem, LunumTerm } from './types.js';

export type NearSemanticFingerprint = string;

export interface NearSemanticComparisonOptions {
  protectedLiterals?: readonly (string | number | boolean)[];
}

export interface SimilarityResult {
  fingerprint1: NearSemanticFingerprint;
  fingerprint2: NearSemanticFingerprint;
  similarity: number;
  similar: boolean;
  threshold: number;
  hardCompatible?: boolean;
  hardMismatchReasons?: string[];
  matchedWeight?: number;
  totalWeight?: number;
}

type WeightedFeatures = Map<string, { count: number; weight: number }>;
type SerializedFeature = [key: string, count: number, weight: number];

interface FingerprintPayload {
  version: 2;
  hard: {
    world: string;
    kind: string;
    clauseShapes: string[];
    literals: string[];
  };
  features: SerializedFeature[];
}

function assertThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Near-semantic threshold must be a finite number between 0 and 1');
  }
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(',')}}`;
}

function addFeature(features: WeightedFeatures, key: string, weight: number): void {
  const current = features.get(key);
  features.set(key, { count: (current?.count ?? 0) + 1, weight });
}

function clauseShape(clause: LunumClause): string {
  const conditions = (clause.conditions ?? []).map(clauseShape).sort();
  const consequences = (clause.consequences ?? []).map(clauseShape).sort();
  return stableValue({
    negated: clause.negated === true,
    modality: clause.modality ?? null,
    conditions,
    consequences
  });
}

function collectTermFeatures(features: WeightedFeatures, role: string, term: LunumTerm): void {
  if (Array.isArray(term)) {
    addFeature(features, `role-cardinality:${role}:${term.length}`, 1);
    for (const item of term) collectTermFeatures(features, role, item);
    return;
  }
  if (term !== null && typeof term === 'object') {
    addFeature(features, `role-type:${role}:${term.type}`, 2);
    if (typeof term.id === 'string') addFeature(features, `role-id:${role}:${term.id}`, 2);
    if (typeof term.ref === 'string') addFeature(features, `role-ref:${role}:${term.ref}`, 2);
    if (typeof term.language === 'string') addFeature(features, `role-language:${role}:${term.language}`, 1);
    if ('value' in term) addFeature(features, `role-value:${role}:${stableValue(term.value)}`, 2);
    return;
  }
  addFeature(features, `role-value:${role}:${stableValue(term)}`, 2);
}

function collectClauseFeatures(features: WeightedFeatures, clause: LunumClause, relation: string): void {
  addFeature(features, `relation:${relation}`, 1);
  addFeature(features, `predicate:${clause.predicate}`, 4);
  for (const role of Object.keys(clause.roles ?? {}).sort()) {
    addFeature(features, `role:${role}`, 3);
    collectTermFeatures(features, role, clause.roles[role]!);
  }
  if (clause.time !== undefined) collectTermFeatures(features, 'time', clause.time);
  for (const condition of clause.conditions ?? []) collectClauseFeatures(features, condition, 'condition');
  for (const consequence of clause.consequences ?? []) collectClauseFeatures(features, consequence, 'consequence');
}

function extractFeatures(sem: LunumSem): WeightedFeatures {
  const features: WeightedFeatures = new Map();
  for (const clause of sem.clauses) collectClauseFeatures(features, clause, 'root');
  for (const reference of sem.references ?? []) {
    addFeature(features, `reference-type:${reference.type}`, 2);
    if (typeof reference.id === 'string') addFeature(features, `reference-id:${reference.id}`, 2);
    if (typeof reference.ref === 'string') addFeature(features, `reference-ref:${reference.ref}`, 2);
    if ('value' in reference) addFeature(features, `reference-value:${stableValue(reference.value)}`, 2);
  }
  return features;
}

function collectPrimitiveValues(value: unknown, output: Set<string>): void {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrimitiveValues(item, output);
    return;
  }
  if (typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) collectPrimitiveValues(nested, output);
  }
}

function collectHardTermLiterals(term: LunumTerm, output: Set<string>): void {
  if (Array.isArray(term)) {
    for (const item of term) collectHardTermLiterals(item, output);
    return;
  }
  if (term !== null && typeof term === 'object') {
    if (typeof term.ref === 'string') output.add(`ref:${term.ref}`);
    if ('value' in term) collectPrimitiveValues(term.value, output);
    return;
  }
  output.add(String(term));
}

function collectHardClauseLiterals(clause: LunumClause, output: Set<string>): void {
  for (const term of Object.values(clause.roles ?? {})) collectHardTermLiterals(term, output);
  if (clause.time !== undefined) collectHardTermLiterals(clause.time, output);
  for (const condition of clause.conditions ?? []) collectHardClauseLiterals(condition, output);
  for (const consequence of clause.consequences ?? []) collectHardClauseLiterals(consequence, output);
}

function hardLiteralSignature(sem: LunumSem): string[] {
  const output = new Set<string>();
  for (const clause of sem.clauses) collectHardClauseLiterals(clause, output);
  for (const reference of sem.references ?? []) {
    if (typeof reference.ref === 'string') output.add(`ref:${reference.ref}`);
    if ('value' in reference) collectPrimitiveValues(reference.value, output);
  }
  return [...output].sort();
}

function serializeFeatures(features: WeightedFeatures): SerializedFeature[] {
  return [...features.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, value.count, value.weight]);
}

function deserializeFeatures(features: SerializedFeature[]): WeightedFeatures {
  return new Map(features.map(([key, count, weight]) => [key, { count, weight }]));
}

function buildPayload(sem: LunumSem): FingerprintPayload {
  return {
    version: 2,
    hard: {
      world: sem.world,
      kind: sem.kind,
      clauseShapes: sem.clauses.map(clauseShape).sort(),
      literals: hardLiteralSignature(sem)
    },
    features: serializeFeatures(extractFeatures(sem))
  };
}

function encodePayload(payload: FingerprintPayload): string {
  return Buffer.from(stableValue(payload), 'utf8').toString('base64url');
}

function decodePayload(fingerprint: NearSemanticFingerprint): FingerprintPayload | null {
  const match = fingerprint.match(/^nfp:2:sha256:([a-f0-9]{64}):([A-Za-z0-9_-]+)$/u);
  if (!match) return null;
  try {
    const serialized = Buffer.from(match[2]!, 'base64url').toString('utf8');
    const digest = createHash('sha256').update(serialized).digest('hex');
    if (digest !== match[1]) return null;
    const payload = JSON.parse(serialized) as Partial<FingerprintPayload>;
    if (payload.version !== 2 || !payload.hard || !Array.isArray(payload.features)) return null;
    if (typeof payload.hard.world !== 'string' || typeof payload.hard.kind !== 'string') return null;
    if (!Array.isArray(payload.hard.clauseShapes) || !Array.isArray(payload.hard.literals)) return null;
    return payload as FingerprintPayload;
  } catch {
    return null;
  }
}

function compareHardPayload(first: FingerprintPayload, second: FingerprintPayload): string[] {
  const reasons: string[] = [];
  if (first.hard.world !== second.hard.world) reasons.push(`world differs: ${first.hard.world} != ${second.hard.world}`);
  if (first.hard.kind !== second.hard.kind) reasons.push(`kind differs: ${first.hard.kind} != ${second.hard.kind}`);
  if (stableValue(first.hard.clauseShapes) !== stableValue(second.hard.clauseShapes)) {
    reasons.push('clause structure, negation, or modality differs');
  }
  if (stableValue(first.hard.literals) !== stableValue(second.hard.literals)) {
    reasons.push('literal or reference values differ');
  }
  return reasons;
}

function protectedLiteralMismatchReasons(first: LunumSem, second: LunumSem, options: NearSemanticComparisonOptions): string[] {
  if (!options.protectedLiterals || options.protectedLiterals.length === 0) return [];
  const reasons: string[] = [];
  const firstValues = new Set<string>();
  const secondValues = new Set<string>();
  collectPrimitiveValues(first, firstValues);
  collectPrimitiveValues(second, secondValues);
  for (const literal of options.protectedLiterals) {
    const key = String(literal);
    if (firstValues.has(key) !== secondValues.has(key)) reasons.push(`protected literal differs: ${key}`);
  }
  return reasons;
}

function weightedJaccard(first: WeightedFeatures, second: WeightedFeatures): { similarity: number; matchedWeight: number; totalWeight: number } {
  const keys = new Set([...first.keys(), ...second.keys()]);
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const left = first.get(key);
    const right = second.get(key);
    const weight = left?.weight ?? right?.weight ?? 1;
    matchedWeight += Math.min(left?.count ?? 0, right?.count ?? 0) * weight;
    totalWeight += Math.max(left?.count ?? 0, right?.count ?? 0) * weight;
  }
  return { similarity: totalWeight === 0 ? 1 : matchedWeight / totalWeight, matchedWeight, totalWeight };
}

export class NearSemanticFingerprintGenerator {
  private threshold: number;

  constructor(threshold: number = 0.8) {
    assertThreshold(threshold);
    this.threshold = threshold;
  }

  generate(sem: LunumSem): NearSemanticFingerprint {
    const payload = buildPayload(sem);
    const serialized = stableValue(payload);
    const hash = createHash('sha256').update(serialized).digest('hex');
    return `nfp:2:sha256:${hash}:${encodePayload(payload)}`;
  }

  generateFromRecord(record: LunumRecord): NearSemanticFingerprint {
    return this.generate(record.sem);
  }

  compare(fp1: NearSemanticFingerprint, fp2: NearSemanticFingerprint): SimilarityResult {
    if (fp1 === fp2) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 1,
        similar: true,
        threshold: this.threshold,
        hardCompatible: true,
        hardMismatchReasons: [],
        matchedWeight: 1,
        totalWeight: 1
      };
    }
    const first = decodePayload(fp1);
    const second = decodePayload(fp2);
    if (!first || !second) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 0,
        similar: false,
        threshold: this.threshold,
        hardCompatible: false,
        hardMismatchReasons: ['Opaque or invalid near-semantic fingerprint; compare semantic inputs with compareSem()'],
        matchedWeight: 0,
        totalWeight: 0
      };
    }
    const reasons = compareHardPayload(first, second);
    if (reasons.length > 0) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 0,
        similar: false,
        threshold: this.threshold,
        hardCompatible: false,
        hardMismatchReasons: reasons,
        matchedWeight: 0,
        totalWeight: 0
      };
    }
    const score = weightedJaccard(deserializeFeatures(first.features), deserializeFeatures(second.features));
    return {
      fingerprint1: fp1,
      fingerprint2: fp2,
      similarity: score.similarity,
      similar: score.similarity >= this.threshold,
      threshold: this.threshold,
      hardCompatible: true,
      hardMismatchReasons: [],
      matchedWeight: score.matchedWeight,
      totalWeight: score.totalWeight
    };
  }

  compareSem(first: LunumSem, second: LunumSem, options: NearSemanticComparisonOptions = {}): SimilarityResult {
    const fingerprint1 = this.generate(first);
    const fingerprint2 = this.generate(second);
    const result = this.compare(fingerprint1, fingerprint2);
    const protectedReasons = protectedLiteralMismatchReasons(first, second, options);
    if (protectedReasons.length === 0) return result;
    return {
      ...result,
      similarity: 0,
      similar: false,
      hardCompatible: false,
      hardMismatchReasons: [...(result.hardMismatchReasons ?? []), ...protectedReasons],
      matchedWeight: 0
    };
  }

  compareRecords(record1: LunumRecord, record2: LunumRecord, options: NearSemanticComparisonOptions = {}): SimilarityResult {
    return this.compareSem(record1.sem, record2.sem, options);
  }

  getThreshold(): number {
    return this.threshold;
  }

  setThreshold(threshold: number): void {
    assertThreshold(threshold);
    this.threshold = threshold;
  }
}

export const nearSemanticFingerprintExports = [NearSemanticFingerprintGenerator] as const;
