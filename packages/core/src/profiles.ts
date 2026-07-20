import { canonicalizeSem, stableStringify } from './canonicalize.js';
import type { LunumClause, LunumRecord, LunumSem } from './types.js';

export type ProfileType = 'safe' | 'short' | 'tight';
export type ProfileLevel = 'Experiment' | 'Reference';

export interface ProfileConfig {
  type: ProfileType;
  level?: ProfileLevel;
  preserveAnnotations?: boolean;
  preserveProvenance?: boolean;
  maxTokenReduction?: number;
}

export interface ProfileResult {
  type: ProfileType;
  originalTokens: number;
  profiledTokens: number;
  reduction: number;
  preservation: number;
  record: LunumRecord;
  warnings?: string[];
}

const PROFILE_PREFIXES: Record<ProfileType, string> = {
  safe: 'LUNUM-SAFE/0.1:',
  short: 'LUNUM-SHORT/0.1:',
  tight: 'LUNUM-TIGHT/0.1:',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimTrailingNulls(values: unknown[]): unknown[] {
  while (values.length > 0 && values[values.length - 1] === null) values.pop();
  return values;
}

function shortClause(clause: LunumClause): Record<string, unknown> {
  const encoded: Record<string, unknown> = { p: clause.predicate, r: clause.roles };
  if (clause.negated === true) encoded.n = true;
  if (clause.modality !== undefined) encoded.m = clause.modality;
  if (clause.time !== undefined) encoded.t = clause.time;
  if (clause.conditions !== undefined) encoded.i = clause.conditions.map(shortClause);
  if (clause.consequences !== undefined) encoded.o = clause.consequences.map(shortClause);
  if (clause.annotations !== undefined) encoded.a = clause.annotations;
  return encoded;
}

function shortSem(sem: LunumSem): Record<string, unknown> {
  const encoded: Record<string, unknown> = {
    s: sem.schema,
    w: sem.world,
    k: sem.kind,
    c: sem.clauses.map(shortClause),
  };
  if (sem.references !== undefined) encoded.r = sem.references;
  if (sem.provenance !== undefined) encoded.p = sem.provenance;
  if (sem.annotations !== undefined) encoded.a = sem.annotations;
  return encoded;
}

function tightClause(clause: LunumClause): unknown[] {
  return trimTrailingNulls([
    clause.predicate,
    clause.roles,
    clause.negated === true ? 1 : null,
    clause.modality ?? null,
    clause.time ?? null,
    clause.conditions?.map(tightClause) ?? null,
    clause.consequences?.map(tightClause) ?? null,
    clause.annotations ?? null,
  ]);
}

function tightSem(sem: LunumSem): unknown[] {
  return trimTrailingNulls([
    sem.schema,
    sem.world,
    sem.kind,
    sem.clauses.map(tightClause),
    sem.references ?? null,
    sem.provenance ?? null,
    sem.annotations ?? null,
  ]);
}

function decodeShortClause(value: unknown): LunumClause {
  if (!isObject(value) || typeof value.p !== 'string' || !isObject(value.r)) {
    throw new TypeError('Invalid short-profile clause');
  }
  const clause: LunumClause = {
    predicate: value.p,
    roles: value.r as LunumClause['roles'],
    negated: value.n === true,
  };
  if (value.m !== undefined) clause.modality = value.m as string | null;
  if (value.t !== undefined) clause.time = value.t as NonNullable<LunumClause['time']>;
  if (value.i !== undefined) {
    if (!Array.isArray(value.i)) throw new TypeError('Invalid short-profile conditions');
    clause.conditions = value.i.map(decodeShortClause);
  }
  if (value.o !== undefined) {
    if (!Array.isArray(value.o)) throw new TypeError('Invalid short-profile consequences');
    clause.consequences = value.o.map(decodeShortClause);
  }
  if (value.a !== undefined) {
    if (!isObject(value.a)) throw new TypeError('Invalid short-profile clause annotations');
    clause.annotations = value.a;
  }
  return clause;
}

function decodeShort(value: unknown): LunumSem {
  if (!isObject(value) || typeof value.s !== 'string' || typeof value.w !== 'string' || typeof value.k !== 'string' || !Array.isArray(value.c)) {
    throw new TypeError('Invalid short-profile semantic payload');
  }
  const sem: LunumSem = {
    schema: value.s,
    world: value.w,
    kind: value.k,
    clauses: value.c.map(decodeShortClause),
  };
  if (value.r !== undefined) {
    if (!Array.isArray(value.r)) throw new TypeError('Invalid short-profile references');
    sem.references = value.r as NonNullable<LunumSem['references']>;
  }
  if (value.p !== undefined) {
    if (!isObject(value.p)) throw new TypeError('Invalid short-profile provenance');
    sem.provenance = value.p;
  }
  if (value.a !== undefined) {
    if (!isObject(value.a)) throw new TypeError('Invalid short-profile annotations');
    sem.annotations = value.a;
  }
  return sem;
}

function decodeTightClause(value: unknown): LunumClause {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8 || typeof value[0] !== 'string' || !isObject(value[1])) {
    throw new TypeError('Invalid tight-profile clause');
  }
  const clause: LunumClause = {
    predicate: value[0],
    roles: value[1] as LunumClause['roles'],
    negated: value[2] === 1,
  };
  if (value[3] !== undefined && value[3] !== null) clause.modality = value[3] as string;
  if (value[4] !== undefined && value[4] !== null) clause.time = value[4] as NonNullable<LunumClause['time']>;
  if (value[5] !== undefined && value[5] !== null) {
    if (!Array.isArray(value[5])) throw new TypeError('Invalid tight-profile conditions');
    clause.conditions = value[5].map(decodeTightClause);
  }
  if (value[6] !== undefined && value[6] !== null) {
    if (!Array.isArray(value[6])) throw new TypeError('Invalid tight-profile consequences');
    clause.consequences = value[6].map(decodeTightClause);
  }
  if (value[7] !== undefined && value[7] !== null) {
    if (!isObject(value[7])) throw new TypeError('Invalid tight-profile clause annotations');
    clause.annotations = value[7];
  }
  return clause;
}

function decodeTight(value: unknown): LunumSem {
  if (!Array.isArray(value) || value.length < 4 || value.length > 7 || typeof value[0] !== 'string' || typeof value[1] !== 'string' || typeof value[2] !== 'string' || !Array.isArray(value[3])) {
    throw new TypeError('Invalid tight-profile semantic payload');
  }
  const sem: LunumSem = {
    schema: value[0],
    world: value[1],
    kind: value[2],
    clauses: value[3].map(decodeTightClause),
  };
  if (value[4] !== undefined && value[4] !== null) {
    if (!Array.isArray(value[4])) throw new TypeError('Invalid tight-profile references');
    sem.references = value[4] as NonNullable<LunumSem['references']>;
  }
  if (value[5] !== undefined && value[5] !== null) {
    if (!isObject(value[5])) throw new TypeError('Invalid tight-profile provenance');
    sem.provenance = value[5];
  }
  if (value[6] !== undefined && value[6] !== null) {
    if (!isObject(value[6])) throw new TypeError('Invalid tight-profile annotations');
    sem.annotations = value[6];
  }
  return sem;
}

export function encodeProfileSem(sem: LunumSem, profile: ProfileType): string {
  const canonical = canonicalizeSem(sem);
  const payload = profile === 'safe'
    ? canonical
    : profile === 'short'
      ? shortSem(canonical)
      : tightSem(canonical);
  return `${PROFILE_PREFIXES[profile]}${stableStringify(payload)}`;
}

export function decodeProfileSem(code: string, expectedProfile?: ProfileType): LunumSem {
  const profile = (Object.keys(PROFILE_PREFIXES) as ProfileType[]).find((candidate) => code.startsWith(PROFILE_PREFIXES[candidate]));
  if (!profile) throw new TypeError('Unknown renderer-profile encoding');
  if (expectedProfile !== undefined && profile !== expectedProfile) {
    throw new TypeError(`Expected ${expectedProfile} renderer profile, received ${profile}`);
  }
  const payload = JSON.parse(code.slice(PROFILE_PREFIXES[profile].length)) as unknown;
  const decoded = profile === 'safe'
    ? payload as LunumSem
    : profile === 'short'
      ? decodeShort(payload)
      : decodeTight(payload);
  return canonicalizeSem(decoded);
}

function estimatedTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class ProfileGenerator {
  private configs: Map<ProfileType, Required<ProfileConfig>>;

  constructor() {
    this.configs = new Map((Object.entries(DEFAULT_PROFILE_CONFIGS) as Array<[ProfileType, Required<ProfileConfig>]>).map(([type, config]) => [type, { ...config }]));
  }

  profile(record: LunumRecord, type: ProfileType = 'safe'): ProfileResult {
    const config = this.configs.get(type);
    if (!config) throw new Error(`Unknown profile type: ${type}`);

    const code = encodeProfileSem(record.sem, type);
    const originalText = record.source.text || stableStringify(canonicalizeSem(record.sem));
    const originalTokens = estimatedTokens(originalText);
    const profiledTokens = estimatedTokens(code);
    const profiledRecord: LunumRecord = {
      ...record,
      sem: record.sem,
      renderings: {
        ...record.renderings,
        [type]: { code, profile: `${type}/0.1`, tokens: profiledTokens },
      },
    };
    const originalCanonical = stableStringify(canonicalizeSem(record.sem));
    const decodedCanonical = stableStringify(decodeProfileSem(code, type));
    const preservation = originalCanonical === decodedCanonical ? 1 : 0;
    const reduction = originalTokens > 0 ? 1 - profiledTokens / originalTokens : 0;

    return {
      type,
      originalTokens,
      profiledTokens,
      reduction,
      preservation,
      record: profiledRecord,
      warnings: [],
    };
  }

  profileSafe(record: LunumRecord): ProfileResult {
    return this.profile(record, 'safe');
  }

  profileShort(record: LunumRecord): ProfileResult {
    return this.profile(record, 'short');
  }

  profileTight(record: LunumRecord): ProfileResult {
    return this.profile(record, 'tight');
  }

  getConfig(type: ProfileType): Required<ProfileConfig> {
    const config = this.configs.get(type);
    if (!config) throw new Error(`Unknown profile type: ${type}`);
    return { ...config };
  }

  setConfig(type: ProfileType, config: Partial<ProfileConfig>): void {
    const existing = this.configs.get(type);
    if (!existing) throw new Error(`Unknown profile type: ${type}`);
    if (config.preserveAnnotations === false || config.preserveProvenance === false) {
      throw new Error('Renderer profiles cannot discard canonical semantics or provenance');
    }
    this.configs.set(type, { ...existing, ...config } as Required<ProfileConfig>);
  }

  isReferenceLevel(type: ProfileType): boolean {
    return this.configs.get(type)?.level === 'Reference';
  }

  allProfilesReference(): boolean {
    return PROFILE_TYPES.every((type) => this.isReferenceLevel(type));
  }
}

export const profileExports = [ProfileGenerator, encodeProfileSem, decodeProfileSem] as const;
export const PROFILE_TYPES: readonly ProfileType[] = ['safe', 'short', 'tight'] as const;
export const PROFILE_LEVELS: readonly ProfileLevel[] = ['Experiment', 'Reference'] as const;

export const DEFAULT_PROFILE_CONFIGS: Record<ProfileType, Required<ProfileConfig>> = {
  safe: {
    type: 'safe',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.3,
  },
  short: {
    type: 'short',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.5,
  },
  tight: {
    type: 'tight',
    level: 'Reference',
    preserveAnnotations: true,
    preserveProvenance: true,
    maxTokenReduction: 0.7,
  },
};
