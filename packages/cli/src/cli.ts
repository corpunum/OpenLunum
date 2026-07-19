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

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

function isRecordLike(value: unknown): value is LunumRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.recordVersion === 'string' &&
    isObject(value.source) &&
    typeof value.source.text === 'string' &&
    isObject(value.sem) &&
    typeof value.sem.schema === 'string' &&
    Array.isArray(value.sem.clauses) &&
    typeof value.fingerprint === 'string' &&
    isObject(value.renderings) &&
    isObject(value.policy) &&
    isObject(value.meta)
  );
}

function sourceVersionMatches(record: LunumRecord, from: MigrationVersion): boolean {
  return from === '0.1'
    ? record.recordVersion === RECORD_SCHEMA && record.sem.schema === SEM_SCHEMA
    : record.recordVersion === RECORD_SCHEMA_02 && record.sem.schema === SEM_SCHEMA_02;
}

function destinationVersionMatches(record: LunumRecord, to: MigrationVersion): boolean {
  const parsedFingerprint = parseFingerprint(record.fingerprint);
  return to === '0.1'
    ? record.recordVersion === RECORD_SCHEMA && record.sem.schema === SEM_SCHEMA && parsedFingerprint?.version === '0.1'
    : record.recordVersion === RECORD_SCHEMA_02 && record.sem.schema === SEM_SCHEMA_02 && parsedFingerprint?.version === '0.2';
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

  const direction = migrationDirection(flag('from') ?? '0.1', flag('to') ?? '0.2');
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
    const errors: string[] = [];
    let warnings: MigrationWarning[] = [];
    let migratedRecord: LunumRecord | null = null;
    const rawObject = isObject(raw) ? raw : null;

    if (!isRecordLike(raw)) {
      errors.push('record must match the LunumRecord structure');
    } else if (!sourceVersionMatches(raw, direction.from)) {
      errors.push(`source record must have ${direction.from === '0.1' ? RECORD_SCHEMA : RECORD_SCHEMA_02} and ${direction.from === '0.1' ? SEM_SCHEMA : SEM_SCHEMA_02}`);
    } else {
      try {
        const migration = direction.from === '0.1'
          ? migrateForward01to02(raw)
          : migrateBackward02to01(raw);
        warnings = migration.warnings;
        migratedRecord = migration.record;
        if (!migration.sourceValid) errors.push('source validation failed');
        if (!migration.destValid) errors.push('destination validation failed');
        if (!destinationVersionMatches(migration.record, direction.to)) {
          errors.push('destination record version, semantic schema, or fingerprint version is inconsistent');
        }
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

  if (!dryRun) {
    await writeJsonAtomically(path, Array.isArray(data) ? migratedRecords : migratedRecords[0]);
  }
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
