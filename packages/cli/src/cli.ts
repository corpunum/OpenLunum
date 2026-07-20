#!/usr/bin/env node
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import {
  compileContext,
  createRecord,
  deriveLunumSidecar,
  deriveSurfaceSidecar,
  fingerprintSem,
  migrateBackward02to01,
  migrateForward01to02,
  parseFingerprint,
  RECORD_SCHEMA,
  RECORD_SCHEMA_02,
  renderSem,
  SEM_SCHEMA,
  SEM_SCHEMA_02,
  validateSem,
} from '@corpunum/lunum';
import type { ContextMessage, LunumSem, LunumRecord, MigrationWarning } from '@corpunum/lunum';

type MigrationVersion = '0.1' | '0.2';

const SEM_FIELDS = new Set(['schema', 'world', 'kind', 'clauses', 'references', 'provenance', 'annotations']);
const CLAUSE_FIELDS = new Set(['predicate', 'roles', 'negated', 'modality', 'time', 'conditions', 'consequences', 'annotations']);
const TERM_FIELDS = new Set(['type', 'id', 'value', 'language', 'ref']);
const RECORD_FIELDS_01 = new Set(['recordVersion', 'source', 'sem', 'fingerprint', 'renderings', 'policy', 'meta']);
const RECORD_FIELDS_02 = new Set([...RECORD_FIELDS_01, 'nearSemanticFingerprint']);
const SOURCE_FIELDS_02 = new Set(['text', 'language', 'role', 'ref', 'format']);
const POLICY_FIELDS_02 = new Set(['eligible', 'risk', 'confidence', 'reasons']);
const META_FIELDS_02 = new Set(['created', 'modified', 'schemaVersion']);
const RENDERING_FIELDS_02 = new Set(['code', 'profile', 'tokens']);
const REFERENCE_FIELDS_02 = new Set(['id', 'url', 'label']);
const PROVENANCE_FIELDS_02 = new Set(['source', 'author', 'timestamp', 'license']);
const SEM_ANNOTATION_FIELDS_02 = new Set(['confidence', 'tags', 'notes']);
const CLAUSE_ANNOTATION_FIELDS_02 = new Set(['confidence', 'evidence']);
const LANGUAGE_TAG = /^[a-z]{2}(?:-[a-z]{2})?$/u;
const REFERENCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredFlag(name: string): string {
  const value = flag(name);
  if (!value || value.startsWith('--')) throw new Error(`--${name} <version> is required`);
  return value;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedVersion(value: string): MigrationVersion | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === '0.1' || normalized === '0.1-draft' || normalized.endsWith('/0.1-draft')) return '0.1';
  if (normalized === '0.2' || normalized.endsWith('/0.2')) return '0.2';
  return null;
}

function migrationDirection(fromRaw: string, toRaw: string): { from: MigrationVersion; to: MigrationVersion } {
  const from = normalizedVersion(fromRaw);
  const to = normalizedVersion(toRaw);
  if (!from || !to || from === to || !((from === '0.1' && to === '0.2') || (from === '0.2' && to === '0.1'))) {
    throw new Error(`Unsupported migration direction: ${fromRaw} -> ${toRaw}. Supported directions are 0.1 -> 0.2 and 0.2 -> 0.1.`);
  }
  return { from, to };
}

function recordId(value: unknown, index: number): string {
  if (!isObject(value)) return `record-${index}`;
  const fingerprint = value.fingerprint;
  return typeof fingerprint === 'string' && fingerprint.length > 0
    ? fingerprint.slice(0, 24)
    : `record-${index}`;
}

function unexpectedFields(value: Record<string, unknown>, allowed: Set<string>, location: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${location}.${key} is not allowed`);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && /T/u.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function validateNullableString(value: unknown, location: string): string[] {
  return value === undefined || value === null || typeof value === 'string' ? [] : [`${location} must be a string or null`];
}

function validateConfidence(value: unknown, location: string): string[] {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? []
    : [`${location} must be a finite number between 0 and 1`];
}

function validateTerm(value: unknown, location: string, version: MigrationVersion): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [];
  if (!isObject(value)) return [`${location} must be a string, number, boolean, or typed term object`];

  const errors: string[] = [];
  if (version === '0.2') errors.push(...unexpectedFields(value, TERM_FIELDS, location));
  if (typeof value.type !== 'string' || value.type.trim().length === 0) errors.push(`${location}.type must be a non-empty string`);
  for (const field of ['id', 'language', 'ref'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') errors.push(`${location}.${field} must be a string`);
  }
  return errors;
}

function validateClause(value: unknown, location: string, version: MigrationVersion): string[] {
  if (!isObject(value)) return [`${location} must be an object`];
  const errors = unexpectedFields(value, CLAUSE_FIELDS, location);
  if (typeof value.predicate !== 'string' || value.predicate.trim().length === 0) {
    errors.push(`${location}.predicate must be a non-empty string`);
  }
  if (!isObject(value.roles)) {
    errors.push(`${location}.roles must be an object`);
  } else {
    for (const [role, term] of Object.entries(value.roles)) {
      errors.push(...validateTerm(term, `${location}.roles.${role}`, version));
    }
  }
  if (value.negated !== undefined && typeof value.negated !== 'boolean') errors.push(`${location}.negated must be a boolean`);
  if (value.modality !== undefined && value.modality !== null) {
    if (typeof value.modality !== 'string') errors.push(`${location}.modality must be a string or null`);
    if (version === '0.2' && !['certainty', 'possibility', 'necessity', 'obligation'].includes(String(value.modality))) {
      errors.push(`${location}.modality is not valid for Lunum-Sem 0.2`);
    }
  }
  if (version === '0.2' && value.time !== undefined && !(isObject(value.time) || isIsoDateTime(value.time))) {
    errors.push(`${location}.time must be an ISO 8601 date-time string or object`);
  }
  for (const nestedField of ['conditions', 'consequences'] as const) {
    const nested = value[nestedField];
    if (nested === undefined) continue;
    if (!Array.isArray(nested)) {
      errors.push(`${location}.${nestedField} must be an array`);
      continue;
    }
    nested.forEach((clause, index) => errors.push(...validateClause(clause, `${location}.${nestedField}[${index}]`, version)));
  }
  if (version === '0.2' && value.annotations !== undefined) {
    if (!isObject(value.annotations)) {
      errors.push(`${location}.annotations must be an object`);
    } else {
      errors.push(...unexpectedFields(value.annotations, CLAUSE_ANNOTATION_FIELDS_02, `${location}.annotations`));
      if (value.annotations.confidence !== undefined) errors.push(...validateConfidence(value.annotations.confidence, `${location}.annotations.confidence`));
      if (value.annotations.evidence !== undefined && typeof value.annotations.evidence !== 'string') errors.push(`${location}.annotations.evidence must be a string`);
    }
  }
  return errors;
}

function validateReferences(value: unknown, version: MigrationVersion): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ['record.sem.references must be an array'];
  const errors: string[] = [];
  value.forEach((reference, index) => {
    const location = `record.sem.references[${index}]`;
    if (!isObject(reference)) {
      errors.push(`${location} must be an object`);
      return;
    }
    if (version === '0.2') {
      errors.push(...unexpectedFields(reference, REFERENCE_FIELDS_02, location));
      if (typeof reference.id !== 'string' || !REFERENCE_ID.test(reference.id)) errors.push(`${location}.id must be a valid reference identifier`);
      if (typeof reference.url !== 'string') {
        errors.push(`${location}.url must be a URI string`);
      } else {
        try { new URL(reference.url); } catch { errors.push(`${location}.url must be a valid URI`); }
      }
      if (reference.label !== undefined && typeof reference.label !== 'string') errors.push(`${location}.label must be a string`);
    }
  });
  return errors;
}

function validateSemObject(value: unknown, version: MigrationVersion): string[] {
  if (!isObject(value)) return ['record.sem must be an object'];
  const errors = unexpectedFields(value, SEM_FIELDS, 'record.sem');
  const expectedSemSchema = version === '0.1' ? SEM_SCHEMA : SEM_SCHEMA_02;
  if (value.schema !== expectedSemSchema) errors.push(`record.sem.schema must equal ${expectedSemSchema}`);
  if (typeof value.world !== 'string' || value.world.trim().length === 0) errors.push('record.sem.world must be a non-empty string');
  if (typeof value.kind !== 'string' || value.kind.trim().length === 0) errors.push('record.sem.kind must be a non-empty string');
  if (!Array.isArray(value.clauses) || value.clauses.length === 0) {
    errors.push('record.sem.clauses must be a non-empty array');
  } else {
    value.clauses.forEach((clause, index) => errors.push(...validateClause(clause, `record.sem.clauses[${index}]`, version)));
  }
  errors.push(...validateReferences(value.references, version));

  if (version === '0.2' && value.provenance !== undefined) {
    if (!isObject(value.provenance)) {
      errors.push('record.sem.provenance must be an object');
    } else {
      errors.push(...unexpectedFields(value.provenance, PROVENANCE_FIELDS_02, 'record.sem.provenance'));
      for (const field of ['source', 'author', 'license'] as const) {
        if (value.provenance[field] !== undefined && typeof value.provenance[field] !== 'string') errors.push(`record.sem.provenance.${field} must be a string`);
      }
      if (value.provenance.timestamp !== undefined && !isIsoDateTime(value.provenance.timestamp)) errors.push('record.sem.provenance.timestamp must be an ISO 8601 date-time');
    }
  }

  if (version === '0.2' && value.annotations !== undefined) {
    if (!isObject(value.annotations)) {
      errors.push('record.sem.annotations must be an object');
    } else {
      errors.push(...unexpectedFields(value.annotations, SEM_ANNOTATION_FIELDS_02, 'record.sem.annotations'));
      if (value.annotations.confidence !== undefined) errors.push(...validateConfidence(value.annotations.confidence, 'record.sem.annotations.confidence'));
      if (value.annotations.tags !== undefined && (!Array.isArray(value.annotations.tags) || value.annotations.tags.some((tag) => typeof tag !== 'string'))) {
        errors.push('record.sem.annotations.tags must be an array of strings');
      }
      if (value.annotations.notes !== undefined && typeof value.annotations.notes !== 'string') errors.push('record.sem.annotations.notes must be a string');
    }
  }
  return errors;
}

function validateRenderings(value: unknown, version: MigrationVersion): string[] {
  if (!isObject(value)) return ['record.renderings must be an object'];
  const errors: string[] = [];
  for (const [key, rendering] of Object.entries(value)) {
    const location = `record.renderings.${key}`;
    if (version === '0.2' && !LANGUAGE_TAG.test(key)) errors.push(`${location} key must be a lowercase BCP-47 language tag`);
    if (!isObject(rendering)) {
      errors.push(`${location} must be an object`);
      continue;
    }
    if (version === '0.2') errors.push(...unexpectedFields(rendering, RENDERING_FIELDS_02, location));
    if (typeof rendering.code !== 'string') errors.push(`${location}.code must be a string`);
    if (typeof rendering.profile !== 'string') errors.push(`${location}.profile must be a string`);
    if (rendering.tokens !== undefined && rendering.tokens !== null && typeof rendering.tokens !== 'number') errors.push(`${location}.tokens must be a number or null`);
  }
  return errors;
}

function validatePolicy(value: unknown, version: MigrationVersion): string[] {
  if (!isObject(value)) return ['record.policy must be an object'];
  const errors: string[] = [];
  if (version === '0.2') errors.push(...unexpectedFields(value, POLICY_FIELDS_02, 'record.policy'));
  if (typeof value.eligible !== 'boolean') errors.push('record.policy.eligible must be a boolean');
  if (!['low', 'medium', 'high', 'unknown'].includes(String(value.risk))) errors.push('record.policy.risk must be low, medium, high, or unknown');
  errors.push(...validateConfidence(value.confidence, 'record.policy.confidence'));
  if (value.reasons !== undefined) {
    if (!Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== 'string')) errors.push('record.policy.reasons must be an array of strings');
    if (version === '0.2' && Array.isArray(value.reasons) && value.reasons.length === 0) errors.push('record.policy.reasons must not be empty when present');
  }
  return errors;
}

function validateMeta(value: unknown, version: MigrationVersion): string[] {
  if (value === undefined) return [];
  if (!isObject(value)) return ['record.meta must be an object'];
  if (version === '0.1') return [];
  const errors = unexpectedFields(value, META_FIELDS_02, 'record.meta');
  if (value.created !== undefined && !isIsoDateTime(value.created)) errors.push('record.meta.created must be an ISO 8601 date-time');
  if (value.modified !== undefined && !isIsoDateTime(value.modified)) errors.push('record.meta.modified must be an ISO 8601 date-time');
  if (value.schemaVersion !== undefined && value.schemaVersion !== '0.2') errors.push('record.meta.schemaVersion must equal 0.2');
  return errors;
}

function validateRecordSchema(value: unknown, version: MigrationVersion): string[] {
  if (!isObject(value)) return ['record must be an object'];
  const errors = unexpectedFields(value, version === '0.1' ? RECORD_FIELDS_01 : RECORD_FIELDS_02, 'record');
  const expectedRecordSchema = version === '0.1' ? RECORD_SCHEMA : RECORD_SCHEMA_02;
  if (value.recordVersion !== expectedRecordSchema) errors.push(`record.recordVersion must equal ${expectedRecordSchema}`);

  if (!isObject(value.source)) {
    errors.push('record.source must be an object');
  } else {
    if (version === '0.2') errors.push(...unexpectedFields(value.source, SOURCE_FIELDS_02, 'record.source'));
    if (typeof value.source.text !== 'string') errors.push('record.source.text must be a string');
    errors.push(...validateNullableString(value.source.language, 'record.source.language'));
    errors.push(...validateNullableString(value.source.role, 'record.source.role'));
    errors.push(...validateNullableString(value.source.ref, 'record.source.ref'));
    if (version === '0.2' && value.source.format !== undefined && !['natural', 'structured', 'mixed'].includes(String(value.source.format))) {
      errors.push('record.source.format must be natural, structured, or mixed');
    }
  }

  errors.push(...validateSemObject(value.sem, version));
  if (typeof value.fingerprint !== 'string' || !value.fingerprint.startsWith('lfp:')) errors.push('record.fingerprint must be an lfp fingerprint string');
  if (version === '0.2' && value.nearSemanticFingerprint !== undefined && (typeof value.nearSemanticFingerprint !== 'string' || !value.nearSemanticFingerprint.startsWith('nfp:'))) {
    errors.push('record.nearSemanticFingerprint must be an nfp fingerprint string');
  }
  errors.push(...validateRenderings(value.renderings, version));
  errors.push(...validatePolicy(value.policy, version));
  errors.push(...validateMeta(value.meta, version));
  return errors;
}

function validateFingerprint(record: LunumRecord, version: MigrationVersion, label: 'source' | 'destination'): string[] {
  const parsed = parseFingerprint(record.fingerprint);
  if (!parsed || parsed.prefix !== 'lfp' || parsed.algorithm !== 'sha256') {
    return [`${label} fingerprint must be a valid lfp SHA-256 fingerprint`];
  }
  if (parsed.version !== version) return [`${label} fingerprint version must equal ${version}`];
  if (parsed.digest.length < 16 || parsed.digest.length > 64) return [`${label} fingerprint digest must contain 16 to 64 hexadecimal characters`];

  try {
    const canonicalInput = structuredClone(record.sem);
    canonicalInput.schema = SEM_SCHEMA;
    const expected = fingerprintSem(canonicalInput, { length: parsed.digest.length });
    const expectedDigest = parseFingerprint(expected)?.digest;
    return expectedDigest === parsed.digest ? [] : [`${label} fingerprint digest does not match canonical semantic content`];
  } catch (error) {
    return [`${label} fingerprint cannot be verified: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function pushLossWarning(warnings: MigrationWarning[], code: string, field: string, message: string): void {
  warnings.push({ code, field, message });
}

function normalizeForwardWrapper(record: LunumRecord, warnings: MigrationWarning[]): LunumRecord {
  const raw = record as unknown as Record<string, unknown>;
  const source = isObject(raw.source) ? raw.source : {};
  const normalizedSource: Record<string, unknown> = { text: typeof source.text === 'string' ? source.text : '' };
  for (const field of ['language', 'role', 'ref', 'format'] as const) {
    if (source[field] !== undefined) normalizedSource[field] = source[field];
  }
  for (const field of Object.keys(source)) {
    if (!SOURCE_FIELDS_02.has(field)) pushLossWarning(warnings, 'SOURCE_FIELD_REMOVED', `source.${field}`, `Source field '${field}' is not allowed in 0.2 and was removed`);
  }

  const normalizedRenderings: Record<string, unknown> = {};
  const sourceLanguage = typeof normalizedSource.language === 'string' && LANGUAGE_TAG.test(normalizedSource.language)
    ? normalizedSource.language
    : null;
  for (const [key, rendering] of Object.entries(record.renderings ?? {})) {
    if (LANGUAGE_TAG.test(key)) {
      normalizedRenderings[key] = rendering;
    } else if (sourceLanguage && normalizedRenderings[sourceLanguage] === undefined) {
      normalizedRenderings[sourceLanguage] = rendering;
      pushLossWarning(warnings, 'RENDERING_KEY_MAPPED', `renderings.${key}`, `Rendering key '${key}' was mapped to source language '${sourceLanguage}' for 0.2`);
    } else {
      pushLossWarning(warnings, 'RENDERING_REMOVED', `renderings.${key}`, `Rendering key '${key}' is not valid in 0.2 and was removed`);
    }
  }

  const policy = record.policy as unknown as Record<string, unknown>;
  const normalizedPolicy: Record<string, unknown> = {
    eligible: policy.eligible,
    risk: policy.risk,
    confidence: policy.confidence,
  };
  if (Array.isArray(policy.reasons) && policy.reasons.length > 0) normalizedPolicy.reasons = policy.reasons;
  for (const field of Object.keys(policy)) {
    if (!POLICY_FIELDS_02.has(field)) pushLossWarning(warnings, 'POLICY_FIELD_REMOVED', `policy.${field}`, `Policy field '${field}' is not allowed in 0.2 and was removed`);
  }

  const meta = isObject(raw.meta) ? raw.meta : {};
  const normalizedMeta: Record<string, unknown> = { schemaVersion: '0.2' };
  if (typeof meta.created === 'string') normalizedMeta.created = meta.created;
  else if (typeof meta.generatedAt === 'string') {
    normalizedMeta.created = meta.generatedAt;
    pushLossWarning(warnings, 'META_FIELD_MAPPED', 'meta.generatedAt', "Metadata field 'generatedAt' was mapped to 'created' for 0.2");
  }
  if (typeof meta.modified === 'string') normalizedMeta.modified = meta.modified;
  for (const field of Object.keys(meta)) {
    if (!META_FIELDS_02.has(field) && field !== 'generatedAt') pushLossWarning(warnings, 'META_FIELD_REMOVED', `meta.${field}`, `Metadata field '${field}' is not allowed in 0.2 and was removed`);
  }

  const normalized: Record<string, unknown> = {
    recordVersion: RECORD_SCHEMA_02,
    source: normalizedSource,
    sem: record.sem,
    fingerprint: record.fingerprint,
    renderings: normalizedRenderings,
    policy: normalizedPolicy,
    meta: normalizedMeta,
  };
  if (typeof raw.nearSemanticFingerprint === 'string') normalized.nearSemanticFingerprint = raw.nearSemanticFingerprint;
  return normalized as unknown as LunumRecord;
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function runMigrationCommand(): Promise<void> {
  const path = flag('file') || process.argv[3];
  if (!path) throw new Error('<file> or --file <path> is required');

  const direction = migrationDirection(requiredFlag('from'), requiredFlag('to'));
  const dryRun = process.argv.includes('--dry-run');
  const originalBytes = await readFile(path, 'utf8');
  const data = JSON.parse(originalBytes) as unknown;
  const rawRecords: unknown[] = Array.isArray(data) ? data : [data];
  const migratedRecords: LunumRecord[] = [];
  const results: Array<{
    index: number;
    id: string;
    status: 'migrated' | 'failed';
    oldRecordVersion: string | null;
    newRecordVersion: string | null;
    oldSchema: string | null;
    newSchema: string | null;
    oldFingerprint: string | null;
    newFingerprint: string | null;
    warnings: MigrationWarning[];
    errors: string[];
  }> = [];

  for (const [index, raw] of rawRecords.entries()) {
    const id = recordId(raw, index);
    const errors = validateRecordSchema(raw, direction.from);
    let warnings: MigrationWarning[] = [];
    let migratedRecord: LunumRecord | null = null;
    const rawObject = isObject(raw) ? raw : null;

    if (errors.length === 0) errors.push(...validateFingerprint(raw as unknown as LunumRecord, direction.from, 'source'));

    if (errors.length === 0) {
      try {
        const migration = direction.from === '0.1'
          ? migrateForward01to02(raw as unknown as LunumRecord)
          : migrateBackward02to01(raw as unknown as LunumRecord);
        warnings = [...migration.warnings];
        migratedRecord = direction.to === '0.2'
          ? normalizeForwardWrapper(migration.record, warnings)
          : migration.record;
        errors.push(...validateRecordSchema(migratedRecord, direction.to));
        errors.push(...validateFingerprint(migratedRecord, direction.to, 'destination'));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    results.push({
      index,
      id,
      status: errors.length === 0 && migratedRecord ? 'migrated' : 'failed',
      oldRecordVersion: typeof rawObject?.recordVersion === 'string' ? rawObject.recordVersion : null,
      newRecordVersion: migratedRecord?.recordVersion ?? null,
      oldSchema: isObject(rawObject?.sem) && typeof rawObject.sem.schema === 'string' ? rawObject.sem.schema : null,
      newSchema: migratedRecord?.sem.schema ?? null,
      oldFingerprint: typeof rawObject?.fingerprint === 'string' ? rawObject.fingerprint : null,
      newFingerprint: migratedRecord?.fingerprint ?? null,
      warnings,
      errors,
    });

    if (errors.length === 0 && migratedRecord) migratedRecords.push(migratedRecord);
  }

  const failed = results.filter((result) => result.status === 'failed').length;
  const summary = {
    dryRun,
    from: direction.from,
    to: direction.to,
    total: rawRecords.length,
    migrated: results.length - failed,
    failed,
    warnings: results.reduce((count, result) => count + result.warnings.length, 0),
    results,
  };

  if (failed > 0) {
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!dryRun) await writeJsonAtomically(path, Array.isArray(data) ? migratedRecords : migratedRecords[0]);
  console.log(JSON.stringify(summary, null, 2));
}

async function runPipelineCommand(): Promise<void> {
  const textInput = flag('text') || flag('content');
  const inputFile = flag('input') || flag('file');
  const language = flag('language') ?? 'en';
  const category = flag('category') ?? 'simple_fact';
  const risk = flag('risk') ?? 'low';
  const mode = flag('mode') ?? 'full';
  const outputFormat = flag('output') ?? 'json';

  let inputText = textInput;
  if (!inputText && inputFile) {
    const inputData = await readJson<any>(inputFile);
    inputText = inputData.source?.text || inputData.content || inputData.text || JSON.stringify(inputData);
  }
  if (!inputText) {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    inputText = await new Promise<string>((resolve) => {
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }
  if (!inputText || !inputText.trim()) {
    console.error('Error: provide --text or pipe JSON via stdin');
    process.exitCode = 1;
    return;
  }

  const sidecar = deriveLunumSidecar({ role: 'user', content: inputText, category, risk: risk as any });
  if (mode === 'parse' || mode === 'parse-only') {
    console.log(JSON.stringify({ step: 'parse', sidecar }, null, 2));
    return;
  }

  const record = sidecar.lunumSem
    ? createRecord({
        sourceText: inputText,
        sourceLanguage: language,
        role: 'user',
        sem: sidecar.lunumSem,
        category,
        risk: risk as any,
        confidence: Number(sidecar.lunumMeta.confidence) || 0.9,
      })
    : createRecord({
        sourceText: inputText,
        sourceLanguage: language,
        role: 'user',
        sem: deriveSurfaceSidecar({ role: 'user', content: inputText, category, risk: risk as any }).lunumSem as LunumSem,
        category,
        risk: risk as any,
        confidence: 0.5,
      });

  if (mode === 'realize' || mode === 'realize-only') {
    console.log(JSON.stringify({ step: 'realize', record }, null, 2));
    return;
  }

  const renderings = Object.fromEntries(
    Object.entries(record.renderings).map(([profile, rendering]) => [profile, { code: rendering.code, profile: rendering.profile, tokens: null }]),
  );
  if (mode === 'render' || mode === 'render-only') {
    console.log(JSON.stringify({ step: 'render', renderings, fingerprint: record.fingerprint }, null, 2));
    return;
  }

  const result = {
    pipeline: 'parse | realize | render',
    input: { text: inputText, language, category, risk },
    parse: { sidecar: { lunumCode: sidecar.lunumCode, lunumFp: sidecar.lunumFp, lunumMeta: sidecar.lunumMeta } },
    realize: {
      recordVersion: record.recordVersion,
      fingerprint: record.fingerprint,
      semSchema: record.sem.schema,
      clauses: record.sem.clauses.length,
      renderings,
    },
    output: {
      code: Object.values(renderings)[0]?.code || '',
      fingerprint: record.fingerprint,
      policy: {
        eligible: record.policy.eligible,
        category: record.policy.category,
        risk: record.policy.risk,
        confidence: record.policy.confidence,
      },
    },
  };

  if (outputFormat === 'code') process.stdout.write(Object.values(renderings)[0]?.code || '');
  else console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'inspect') {
    console.log(JSON.stringify(deriveLunumSidecar({ role: flag('role') ?? 'user', content: flag('text') ?? '' }), null, 2));
    return;
  }
  if (command === 'encode') {
    const path = flag('sem');
    if (!path) throw new Error('--sem <path> is required');
    const sem = await readJson<LunumSem>(path);
    const validation = validateSem(sem);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    console.log(JSON.stringify({ sem, fingerprint: fingerprintSem(sem), rendering: renderSem(sem) }, null, 2));
    return;
  }
  if (command === 'compile') {
    const path = flag('messages');
    if (!path) throw new Error('--messages <path> is required');
    const messages = await readJson<ContextMessage[]>(path);
    console.log(JSON.stringify(compileContext(messages, { mode: (flag('mode') as 'natural' | 'lunum' | 'mixed' | 'shadow_mixed' | undefined) ?? 'mixed' }), null, 2));
    return;
  }
  if (command === 'migrate') {
    await runMigrationCommand();
    return;
  }
  if (command === 'pipeline') {
    await runPipelineCommand();
    return;
  }
  console.error('Usage: lunum inspect --text <text> | encode --sem <file> | compile --messages <file> [--mode mixed] | migrate <file> --from 0.1 --to 0.2 [--dry-run] | pipeline --text <text> [--language en] [--category simple_fact] [--risk low] [--mode full]');
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
