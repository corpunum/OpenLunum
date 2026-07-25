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
type Primitive = null | string | number | boolean;

interface HardSignature {
  schema: string;
  world: string;
  kind: string;
  clauseShapes: string[];
  literals: string[];
}

interface ParsedFingerprint {
  hardDigest: string;
  featureTokens: Set<string>;
}

function assertThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Near-semantic threshold must be a finite number between 0 and 1');
  }
}

function stableValue(value: unknown): string {
  if (value === undefined) return '"$undefined"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? JSON.stringify(String(value));
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(',')}}`;
}

function primitiveToken(value: Primitive): string {
  if (value === null) return 'null:null';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'number') return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  return `boolean:${value}`;
}

function digest(value: string, length = 64): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function addFeature(features: WeightedFeatures, key: string, weight: number): void {
  const current = features.get(key);
  features.set(key, { count: (current?.count ?? 0) + 1, weight });
}

function clauseShape(clause: LunumClause): string {
  return stableValue({
    negated: clause.negated === true,
    modality: clause.modality ?? null,
    conditions: (clause.conditions ?? []).map(clauseShape).sort(),
    consequences: (clause.consequences ?? []).map(clauseShape).sort()
  });
}

// `clauseContext` binds role-filler features to the clause they belong to, so the same
// role/id pair filling two different clauses (e.g. a role-swap mutation across a root
// clause and its condition) is not collapsed into an identical feature multiset. The
// context is the clause's `predicate` (e.g. "delete", "confirmed"); the key format is
// `role-<kind>:<predicate>:<role>:<...>`. Plain clauses without a predicate (defensive
// fallback) use the literal string "-" as context so the key shape stays stable.
function collectTermFeatures(features: WeightedFeatures, clauseContext: string, role: string, term: LunumTerm): void {
  if (Array.isArray(term)) {
    addFeature(features, `role-cardinality:${clauseContext}:${role}:${term.length}`, 1);
    for (const item of term) collectTermFeatures(features, clauseContext, role, item);
    return;
  }
  if (term !== null && typeof term === 'object') {
    addFeature(features, `role-type:${clauseContext}:${role}:${term.type}`, 2);
    if (typeof term.id === 'string') addFeature(features, `role-id:${clauseContext}:${role}:${term.id}`, 2);
    if (typeof term.ref === 'string') addFeature(features, `role-ref:${clauseContext}:${role}:${term.ref}`, 2);
    if (typeof term.language === 'string') addFeature(features, `role-language:${clauseContext}:${role}:${term.language}`, 1);
    if ('value' in term) addFeature(features, `role-value:${clauseContext}:${role}:${stableValue(term.value)}`, 2);
    return;
  }
  addFeature(features, `role-value:${clauseContext}:${role}:${stableValue(term)}`, 2);
}

function collectClauseFeatures(features: WeightedFeatures, clause: LunumClause, relation: string): void {
  addFeature(features, `relation:${relation}`, 1);
  addFeature(features, `predicate:${clause.predicate}`, 4);
  const clauseContext = typeof clause.predicate === 'string' && clause.predicate.length > 0 ? clause.predicate : '-';
  for (const role of Object.keys(clause.roles ?? {}).sort()) {
    addFeature(features, `role:${role}`, 3);
    collectTermFeatures(features, clauseContext, role, clause.roles[role]!);
  }
  if (clause.time !== undefined) collectTermFeatures(features, clauseContext, 'time', clause.time);
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

function collectPrimitiveValues(value: unknown, output: string[]): void {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(primitiveToken(value));
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

function collectHardTermLiterals(term: LunumTerm, output: string[]): void {
  if (Array.isArray(term)) {
    for (const item of term) collectHardTermLiterals(item, output);
    return;
  }
  if (term !== null && typeof term === 'object') {
    if (typeof term.ref === 'string') output.push(`ref:${JSON.stringify(term.ref)}`);
    if ('value' in term) collectPrimitiveValues(term.value, output);
    return;
  }
  collectPrimitiveValues(term, output);
}

function collectHardClauseLiterals(clause: LunumClause, output: string[]): void {
  for (const term of Object.values(clause.roles ?? {})) collectHardTermLiterals(term, output);
  if (clause.time !== undefined) collectHardTermLiterals(clause.time, output);
  for (const condition of clause.conditions ?? []) collectHardClauseLiterals(condition, output);
  for (const consequence of clause.consequences ?? []) collectHardClauseLiterals(consequence, output);
}

function hardSignature(sem: LunumSem): HardSignature {
  const literals: string[] = [];
  for (const clause of sem.clauses) collectHardClauseLiterals(clause, literals);
  for (const reference of sem.references ?? []) {
    if (typeof reference.ref === 'string') literals.push(`ref:${JSON.stringify(reference.ref)}`);
    if ('value' in reference) collectPrimitiveValues(reference.value, literals);
  }
  return {
    schema: sem.schema,
    world: sem.world,
    kind: sem.kind,
    clauseShapes: sem.clauses.map(clauseShape).sort(),
    literals: literals.sort()
  };
}

function featureTokens(features: WeightedFeatures): string[] {
  const tokens: string[] = [];
  for (const [key, value] of [...features.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const multiplicity = value.count * value.weight;
    for (let index = 0; index < multiplicity; index += 1) {
      tokens.push(digest(`${key}#${index}`, 16));
    }
  }
  return tokens.sort();
}

function parseFingerprint(fingerprint: NearSemanticFingerprint): ParsedFingerprint | null {
  const match = fingerprint.match(/^nfp:2:sha256:([a-f0-9]{64}):([a-f0-9]{64}):(-|[a-f0-9.]+)$/u);
  if (!match) return null;
  const checksum = match[1]!;
  const hardDigest = match[2]!;
  const tokenText = match[3]!;
  // This is a self-checking integrity checksum, not a keyed authenticity proof.
  if (digest(`${hardDigest}:${tokenText}`) !== checksum) return null;
  if (tokenText === '-') return { hardDigest, featureTokens: new Set() };
  const tokens = tokenText.split('.');
  if (tokens.some((token) => !/^[a-f0-9]{16}$/u.test(token))) return null;
  return { hardDigest, featureTokens: new Set(tokens) };
}

function hardMismatchReasons(first: HardSignature, second: HardSignature): string[] {
  const reasons: string[] = [];
  if (first.schema !== second.schema) reasons.push(`schema differs: ${first.schema} != ${second.schema}`);
  if (first.world !== second.world) reasons.push(`world differs: ${first.world} != ${second.world}`);
  if (first.kind !== second.kind) reasons.push(`kind differs: ${first.kind} != ${second.kind}`);
  if (stableValue(first.clauseShapes) !== stableValue(second.clauseShapes)) {
    reasons.push('clause structure, negation, or modality differs');
  }
  if (stableValue(first.literals) !== stableValue(second.literals)) {
    reasons.push('typed literal, reference value, or literal multiplicity differs');
  }
  return reasons;
}

function protectedLiteralMismatchReasons(first: LunumSem, second: LunumSem, options: NearSemanticComparisonOptions): string[] {
  if (!options.protectedLiterals || options.protectedLiterals.length === 0) return [];
  const firstValues: string[] = [];
  const secondValues: string[] = [];
  collectPrimitiveValues(first, firstValues);
  collectPrimitiveValues(second, secondValues);
  const firstSet = new Set(firstValues);
  const secondSet = new Set(secondValues);
  return options.protectedLiterals
    .map((literal) => ({ literal, token: primitiveToken(literal) }))
    .filter(({ token }) => firstSet.has(token) !== secondSet.has(token))
    .map(({ literal }) => `protected literal differs: ${stableValue(literal)}`);
}

function tokenJaccard(first: Set<string>, second: Set<string>): { similarity: number; matchedWeight: number; totalWeight: number } {
  let matchedWeight = 0;
  for (const token of first) if (second.has(token)) matchedWeight += 1;
  const totalWeight = new Set([...first, ...second]).size;
  return { similarity: totalWeight === 0 ? 1 : matchedWeight / totalWeight, matchedWeight, totalWeight };
}

export class NearSemanticFingerprintGenerator {
  private threshold: number;

  constructor(threshold: number = 0.8) {
    assertThreshold(threshold);
    this.threshold = threshold;
  }

  generate(sem: LunumSem): NearSemanticFingerprint {
    const hard = digest(stableValue(hardSignature(sem)));
    const tokens = featureTokens(extractFeatures(sem));
    const tokenText = tokens.length > 0 ? tokens.join('.') : '-';
    const checksum = digest(`${hard}:${tokenText}`);
    return `nfp:2:sha256:${checksum}:${hard}:${tokenText}`;
  }

  generateFromRecord(record: LunumRecord): NearSemanticFingerprint {
    return this.generate(record.sem);
  }

  compare(fp1: NearSemanticFingerprint, fp2: NearSemanticFingerprint): SimilarityResult {
    const first = parseFingerprint(fp1);
    const second = parseFingerprint(fp2);
    if (!first || !second) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 0,
        similar: false,
        threshold: this.threshold,
        hardCompatible: false,
        hardMismatchReasons: ['Invalid or checksum-mismatched near-semantic fingerprint'],
        matchedWeight: 0,
        totalWeight: 0
      };
    }
    if (fp1 === fp2) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 1,
        similar: true,
        threshold: this.threshold,
        hardCompatible: true,
        hardMismatchReasons: [],
        matchedWeight: first.featureTokens.size,
        totalWeight: first.featureTokens.size
      };
    }
    if (first.hardDigest !== second.hardDigest) {
      return {
        fingerprint1: fp1,
        fingerprint2: fp2,
        similarity: 0,
        similar: false,
        threshold: this.threshold,
        hardCompatible: false,
        hardMismatchReasons: ['Hard semantic signature differs'],
        matchedWeight: 0,
        totalWeight: 0
      };
    }
    const score = tokenJaccard(first.featureTokens, second.featureTokens);
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
    const reasons = [
      ...hardMismatchReasons(hardSignature(first), hardSignature(second)),
      ...protectedLiteralMismatchReasons(first, second, options)
    ];
    if (reasons.length > 0) {
      return {
        fingerprint1,
        fingerprint2,
        similarity: 0,
        similar: false,
        threshold: this.threshold,
        hardCompatible: false,
        hardMismatchReasons: reasons,
        matchedWeight: 0,
        totalWeight: 0
      };
    }
    return this.compare(fingerprint1, fingerprint2);
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
