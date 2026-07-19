#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { compileContext, createRecord, deriveLunumSidecar, deriveSurfaceSidecar, fingerprintSem, renderSem, validateSem } from '@corpunum/lunum';
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
    const path = flag('file') || process.argv[3];
    if (!path) throw new Error('<file> or --file <path> is required');
    const fromVersion = flag('from') ?? '0.1';
    const toVersion = flag('to') ?? '0.2';
    const dryRun = process.argv.includes('--dry-run');

    const { migrateForward01to02, migrateBackward02to01, validateSemSchema, validateRecord } = require('@corpunum/lunum');

    const data = await readJson<any>(path);
    const records = Array.isArray(data) ? data : [data];
    const changes: Array<{ id: string; warnings: string[]; sourceValid: boolean; destValid: boolean }> = [];
    const allWarnings: string[] = [];
    let migrated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const record of records) {
      const recordId = record.id || record.fingerprint?.slice(0, 20) || 'unknown';

      // Validate source schema
      const sourceValid = validateRecord(record) && validateSemSchema(record.sem);
      if (!sourceValid) {
        allWarnings.push(`${recordId}: source record validation failed`);
        unchanged++;
        continue;
      }

      // Perform migration
      let result;
      if (fromVersion === '0.1' && toVersion === '0.2') {
        result = migrateForward01to02(record);
      } else if (fromVersion === '0.2' && toVersion === '0.1') {
        result = migrateBackward02to01(record);
      } else {
        allWarnings.push(`${recordId}: unsupported migration ${fromVersion}→${toVersion}`);
        unchanged++;
        continue;
      }

      if (!result.sourceValid || !result.destValid) {
        allWarnings.push(`${recordId}: migration validation failed (source: ${result.sourceValid}, dest: ${result.destValid})`);
        failed++;
        continue;
      }

      changes.push({
        id: recordId,
        warnings: result.warnings.map((w: { message: string }) => w.message),
        sourceValid: result.sourceValid,
        destValid: result.destValid
      });

      if (result.warnings.length > 0) {
        allWarnings.push(...result.warnings.map((w: { message: string }) => `${recordId}: ${w.message}`));
      }

      migrated++;
    }

    // Check if any failures should cause exit code 1 (fail closed)
    const hasFailures = failed > 0;
    const hasWarnings = allWarnings.length > 0;

    if (dryRun) {
      const output = {
        dryRun: true,
        from: fromVersion,
        to: toVersion,
        total: records.length,
        migrated,
        unchanged,
        failed,
        changes,
        warnings: allWarnings
      };
      console.log(JSON.stringify(output, null, 2));
      if (hasFailures) process.exitCode = 1;
    } else {
      // Transform records with migration results
      let idx = 0;
      const transformed = records.map(record => {
        const recordId = record.id || record.fingerprint?.slice(0, 20) || 'unknown';
        const change = changes[idx];
        idx++;
        if (!change || !change.destValid) return record;

      // Re-run migration to get the migrated record
      let migratedRecord;
      if (fromVersion === '0.1' && toVersion === '0.2') {
        migratedRecord = migrateForward01to02(record).record;
      } else {
        migratedRecord = migrateBackward02to01(record).record;
      }
        return migratedRecord;
      });

      const output = Array.isArray(data) ? transformed : transformed[0];
      // Atomic write: write to temp file, then rename
      const tmpPath = path + '.tmp';
      await writeFile(tmpPath, JSON.stringify(output, null, 2));
      // Use fs.rename for atomicity (same filesystem)
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, path);

      console.log(JSON.stringify({
        dryRun: false,
        from: fromVersion,
        to: toVersion,
        total: records.length,
        migrated,
        unchanged,
        failed,
        warnings: allWarnings
      }, null, 2));
      if (hasFailures) process.exitCode = 1;
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
