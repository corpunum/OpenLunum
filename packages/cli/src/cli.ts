#!/usr/bin/env node
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { compileContext, createRecord, deriveLunumSidecar, deriveSurfaceSidecar, fingerprintSem, renderSem, validateSem, migrateForward01to02, migrateBackward02to01, validateSemSchema, validateRecord } from '@corpunum/lunum';
import type { ContextMessage, LunumSem, LunumRecord, MigrationWarning } from '@corpunum/lunum';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
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
    const path = flag('file') || process.argv[3];
    if (!path) throw new Error('<file> or --file <path> is required');
    const fromVersion = flag('from') ?? '0.1';
    const toVersion = flag('to') ?? '0.2';
    const dryRun = process.argv.includes('--dry-run');
    const data = await readJson<any>(path);
    const records = Array.isArray(data) ? data : [data];

    const SEM_PREFIX = 'lunum-sem/';
    const RECORD_PREFIX = 'lunum-record/';

    function resolveVersion(v: string): string {
      // Normalize: strip lunum- prefix for comparison
      if (v.startsWith('lunum-')) return v;
      if (v === '0.1' || v === '0.1-draft') return SEM_PREFIX + '0.1-draft';
      if (v === '0.2') return SEM_PREFIX + '0.2';
      return v;
    }

    const fromSem = resolveVersion(fromVersion);
    const toSem = resolveVersion(toVersion);

    const changes: Array<{ id: string; oldSchema: string; newSchema: string; warnings: MigrationWarning[] }> = [];
    const errors: string[] = [];
    let migrated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const record of records) {
      const recordId = (record as any).id ?? (record as any).source?.text?.slice(0, 40) ?? 'unknown';
      const oldSchema = (record.sem as LunumSem)?.schema ?? 'unknown';

      // Validate source schema matches --from
      if (!oldSchema.startsWith(fromSem)) {
        if (!oldSchema.startsWith(fromSem) && !(fromVersion === '0.1' && oldSchema.includes('0.1-draft'))) {
          errors.push(`${recordId}: schema ${oldSchema} does not match --from ${fromVersion}`);
          unchanged++;
          continue;
        }
      }

      // Use proper migration functions
      let result: { record: LunumRecord; warnings: MigrationWarning[]; sourceValid: boolean; destValid: boolean };

      // Detect direction
      const isForward = (toSem.includes('0.2') && oldSchema.includes('0.1')) || (toSem === SEM_PREFIX + '0.2' && oldSchema === SEM_PREFIX + '0.1-draft');
      const isBackward = (fromSem.includes('0.2') && toSem.includes('0.1')) || (fromSem === SEM_PREFIX + '0.2' && oldSchema === SEM_PREFIX + '0.2');

      if (isForward) {
        result = migrateForward01to02(record as LunumRecord);
      } else if (isBackward) {
        result = migrateBackward02to01(record as LunumRecord);
      } else {
        // Fallback: just update schema string (simple migration)
        const newSem = { ...(record.sem as LunumSem), schema: toSem };
        result = {
          record: { ...record, sem: newSem },
          warnings: [{ code: 'SCHEMA_ONLY', message: `Schema updated to ${toSem}`, field: 'sem.schema' }],
          sourceValid: true,
          destValid: true
        };
      }

      if (!result.sourceValid) {
        errors.push(`${recordId}: source validation failed`);
        failed++;
        continue;
      }
      if (!result.destValid) {
        errors.push(`${recordId}: destination validation failed`);
        failed++;
        continue;
      }

      changes.push({
        id: recordId,
        oldSchema,
        newSchema: result.record.sem.schema,
        warnings: result.warnings
      });
      migrated++;
    }

    // Fail closed: if any records failed validation, exit with error
    if (failed > 0 && !dryRun) {
      console.error(JSON.stringify({ dryRun, from: fromVersion, to: toVersion, total: records.length, migrated, unchanged, failed, errors }, null, 2));
      process.exitCode = 1;
      return;
    }

    if (dryRun) {
      console.log(JSON.stringify({
        dryRun: true,
        from: fromVersion,
        to: toVersion,
        total: records.length,
        migrated,
        unchanged,
        failed,
        changes: changes.map(c => ({ id: c.id, oldSchema: c.oldSchema, newSchema: c.newSchema, warnings: c.warnings })),
        errors
      }, null, 2));
    } else {
      // Transform records
      let outputRecords = records;
      if (migrated > 0) {
        outputRecords = records.map((record: any, index: number) => {
          const change = changes[index];
          if (!change || change.warnings.length === 0 && change.oldSchema === change.newSchema) return record;

          const oldSchema = record.sem?.schema ?? 'unknown';
          const isForward = (toSem.includes('0.2') && oldSchema.includes('0.1')) || (toSem === SEM_PREFIX + '0.2' && oldSchema === SEM_PREFIX + '0.1-draft');
          const isBackward = (fromSem.includes('0.2') && toSem.includes('0.1')) || (fromSem === SEM_PREFIX + '0.2' && oldSchema === SEM_PREFIX + '0.2');

          let result: { record: LunumRecord; warnings: MigrationWarning[] };
          if (isForward) {
            result = migrateForward01to02(record as LunumRecord);
          } else if (isBackward) {
            result = migrateBackward02to01(record as LunumRecord);
          } else {
            const newSem = { ...(record.sem as LunumSem), schema: toSem };
            result = { record: { ...record, sem: newSem }, warnings: [] };
          }
          return result.record;
        });
      }

      const output = Array.isArray(data) ? outputRecords : outputRecords[0];

      // Atomic write: write to temp file, then rename
      const tempPath = path + '.tmp.' + randomUUID();
      await writeFile(tempPath, JSON.stringify(output, null, 2));
      await rename(tempPath, path);

      console.log(JSON.stringify({
        dryRun: false,
        from: fromVersion,
        to: toVersion,
        total: records.length,
        migrated,
        unchanged,
        failed,
        warnings: changes.flatMap(c => c.warnings.map(w => `${c.id}: ${w.code} - ${w.message}`)),
        errors
      }, null, 2));
    }
    return;
  }
  if (command === 'pipeline') {
    // Standalone CLI pipeline: lunum parse | lunum realize | lunum render
    // Usage: lunum pipeline --text <text> [--language en] [--category simple_fact] [--risk low]
    // Or: cat input.json | lunum pipeline [--mode parse|realize|render|full]
    const textInput = flag('text') || flag('content');
    const inputFile = flag('input') || flag('file');
    const language = flag('language') ?? 'en';
    const category = flag('category') ?? 'simple_fact';
    const risk = flag('risk') ?? 'low';
    const mode = flag('mode') ?? 'full';
    const outputFormat = flag('output') ?? 'json';

    // Get input text
    let inputText = textInput;
    if (!inputText && inputFile) {
      const data = await readJson<any>(inputFile);
      inputText = data.source?.text || data.content || data.text || JSON.stringify(data);
    }
    if (!inputText) {
      // Try stdin
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

    // Parse step: derive sidecar
    const sidecar = deriveLunumSidecar({ role: 'user', content: inputText, category, risk: risk as any });

    if (mode === 'parse' || mode === 'parse-only') {
      console.log(JSON.stringify({ step: 'parse', sidecar }, null, 2));
      return;
    }

    // Realize step: create full record from sidecar sem
    let record: LunumRecord;
    if (sidecar.lunumSem) {
      record = createRecord({
        sourceText: inputText,
        sourceLanguage: language,
        role: 'user',
        sem: sidecar.lunumSem,
        category,
        risk: risk as any,
        confidence: Number(sidecar.lunumMeta.confidence) || 0.9
      });
    } else {
      // Fallback: create record with heuristic surface
      const surface = deriveSurfaceSidecar({ role: 'user', content: inputText, category, risk: risk as any });
      record = createRecord({
        sourceText: inputText,
        sourceLanguage: language,
        role: 'user',
        sem: surface.lunumSem as LunumSem,
        category,
        risk: risk as any,
        confidence: 0.5
      });
    }

    if (mode === 'realize' || mode === 'realize-only') {
      console.log(JSON.stringify({ step: 'realize', record }, null, 2));
      return;
    }

    // Render step
    const renderings = Object.fromEntries(
      Object.entries(record.renderings).map(([profile, r]) => [profile, { code: r.code, profile: r.profile, tokens: null }])
    );

    if (mode === 'render' || mode === 'render-only') {
      console.log(JSON.stringify({ step: 'render', renderings, fingerprint: record.fingerprint }, null, 2));
      return;
    }

    // Full pipeline: parse | realize | render
    const result = {
      pipeline: 'parse | realize | render',
      input: { text: inputText, language, category, risk },
      parse: { sidecar: { lunumCode: sidecar.lunumCode, lunumFp: sidecar.lunumFp, lunumMeta: sidecar.lunumMeta } },
      realize: {
        recordVersion: record.recordVersion,
        fingerprint: record.fingerprint,
        semSchema: record.sem.schema,
        clauses: record.sem.clauses.length,
        renderings: renderings
      },
      output: {
        code: Object.values(renderings)[0]?.code || '',
        fingerprint: record.fingerprint,
        policy: { eligible: record.policy.eligible, category: record.policy.category, risk: record.policy.risk, confidence: record.policy.confidence }
      }
    };

    if (outputFormat === 'code') {
      // Output just the code for piping to other tools
      const code = Object.values(renderings)[0]?.code || '';
      process.stdout.write(code);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }
  console.error('Usage: lunum inspect --text <text> | encode --sem <file> | compile --messages <file> [--mode mixed] | migrate <file> [--from 0.1] [--to 0.2] [--dry-run] | pipeline --text <text> [--language en] [--category simple_fact] [--risk low] [--mode full]');
  process.exitCode = 2;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
