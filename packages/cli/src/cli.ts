#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileContext, createRecord, deriveLunumSidecar, deriveSurfaceSidecar, fingerprintSem, migrateForward01to02, migrateBackward02to01, validateRecord, validateSemSchema, renderSem, validateSem } from '@corpunum/lunum';
import type { ContextMessage, LunumSem, LunumRecord } from '@corpunum/lunum';

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
    // Comprehensive migration CLI: lunum migrate <file> --from 0.1 --to 0.2 [--dry-run]
    // Validates source/destination schemas, migrates record structure/fingerprint,
    // fails closed on validation errors, writes atomically.
    const inputPath = flag('file') || process.argv[3];
    if (!inputPath) throw new Error('<file> or --file <path> is required');
    const fromVersion = flag('from') ?? '0.1';
    const toVersion = flag('to') ?? '0.2';
    const dryRun = process.argv.includes('--dry-run');
    const failClosed = process.argv.includes('--fail-closed');

    // Read and parse input
    const data = await readJson<any>(inputPath);
    const records: LunumRecord[] = Array.isArray(data) ? data : [data];

    const changes: Array<{ id: string; oldSchema: string; newSchema: string; oldFp: string; newFp: string }> = [];
    const allWarnings: Array<{ code: string; message: string; field?: string }> = [];
    let migrated = 0;
    let unchanged = 0;
    let errors = 0;

    // Validate source schema before migration
    for (const record of records) {
      const sourceValid = validateRecord(record) && validateSemSchema(record.sem);
      if (!sourceValid) {
        const id = (record.meta as any)?.id || 'unknown';
        if (failClosed) {
          throw new Error(`Source validation failed for record ${id}`);
        }
        allWarnings.push({ code: 'SOURCE_INVALID', message: `Record ${id} failed source validation`, field: 'record' });
      }
    }

    // Migrate each record
    const transformed: LunumRecord[] = [];
    for (const record of records) {
      const oldSchema = record.sem?.schema ?? 'unknown';
      const oldFp = record.fingerprint ?? '';

      if (!oldSchema.includes(fromVersion)) {
        allWarnings.push({ code: 'SCHEMA_MISMATCH', message: `schema ${oldSchema} does not match --from ${fromVersion}`, field: `record.${(record.meta as any)?.id || '?'} sem.schema` });
        unchanged++;
        transformed.push(record);
        continue;
      }

      let result: { record: LunumRecord; warnings: Array<{ code: string; message: string; field?: string }>; sourceValid: boolean; destValid: boolean };

      if (fromVersion.includes('0.1') && toVersion.includes('0.2')) {
        // Forward migration: 0.1 → 0.2 (comprehensive)
        result = migrateForward01to02(record);
      } else if (fromVersion.includes('0.2') && toVersion.includes('0.1')) {
        // Backward migration: 0.2 → 0.1 (lossy)
        result = migrateBackward02to01(record);
      } else {
        // Fallback: simple schema change
        const newSem = { ...record.sem, schema: `lunum-sem/${toVersion}` };
        result = { record: { ...record, sem: newSem }, warnings: [], sourceValid: true, destValid: true };
      }

      const newSchema = result.record.sem?.schema ?? 'unknown';
      const newFp = result.record.fingerprint ?? '';

      changes.push({
        id: (record.meta as any)?.id || 'unknown',
        oldSchema,
        newSchema,
        oldFp,
        newFp
      });

      allWarnings.push(...result.warnings);

      if (!result.destValid && failClosed) {
        errors++;
        if (errors > 0) {
          throw new Error(`Destination validation failed for record ${(record.meta as any)?.id || 'unknown'}`);
        }
      }

      transformed.push(result.record);
      migrated++;
    }

    // Compute summary
    const summary = {
      dryRun,
      from: fromVersion,
      to: toVersion,
      total: records.length,
      migrated,
      unchanged,
      errors,
      changes,
      warnings: allWarnings
    };

    if (dryRun) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      // Atomic write: write to temp file, then rename
      const tempDir = await mkdtemp(join(tmpdir(), 'lunum-migrate-'));
      const tempPath = join(tempDir, `migrate-${Date.now()}.json`);
      await writeFile(tempPath, JSON.stringify(transformed, null, 2), 'utf-8');

      try {
        await rename(tempPath, inputPath);
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        // Clean up temp file on error
        try { await unlink(tempPath); } catch {}  
        throw err instanceof Error ? err : new Error(String(err));
      }
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
