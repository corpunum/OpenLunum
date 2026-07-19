#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { compileContext, createRecord, deriveLunumSidecar, deriveSurfaceSidecar, fingerprintSem, renderSem, validateSem, migrateForward01to02, migrateBackward02to01, SEM_SCHEMA, SEM_SCHEMA_02, RECORD_SCHEMA, RECORD_SCHEMA_02 } from '@corpunum/lunum';
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
    const filePath = flag('file') || process.argv[3];
    if (!filePath) throw new Error('<file> or --file <path> is required');
    const fromVersion = flag('from') ?? '0.1';
    const toVersion = flag('to') ?? '0.2';
    const dryRun = process.argv.includes('--dry-run');

    const data = await readJson<any>(filePath);
    const records = Array.isArray(data) ? data : [data];

    // Validate versions
    const validFromVersions = ['0.1', '0.1-draft'];
    const validToVersions = ['0.2'];
    const forward = validFromVersions.includes(fromVersion) && toVersion === '0.2';
    const backward = fromVersion === '0.2' && validToVersions.includes(fromVersion) ? false : false;
    const isBackward = fromVersion === '0.2' && (validFromVersions.includes(toVersion) || toVersion === '0.1');

    const allWarnings: MigrationWarning[] = [];
    const results: Array<{ id: string; oldSchema: string; newSchema: string; oldFp: string; newFp: string; sourceValid: boolean; destValid: boolean; warnings: MigrationWarning[] }> = [];
    let migrated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const record of records) {
      const oldSchema = record.sem?.schema ?? 'unknown';
      const oldFp = record.fingerprint ?? 'none';
      const recordId = record.id || record.source?.text?.slice(0, 40) || 'unknown';

      // Check if record matches --from version
      const matchesFrom = validFromVersions.includes(fromVersion)
        ? (oldSchema.includes('0.1') || record.recordVersion?.includes('0.1'))
        : oldSchema.includes(fromVersion) || record.recordVersion?.includes(fromVersion);

      if (!matchesFrom) {
        unchanged++;
        results.push({
          id: recordId,
          oldSchema,
          newSchema: oldSchema,
          oldFp,
          newFp: oldFp,
          sourceValid: false,
          destValid: false,
          warnings: [{ code: 'VERSION_MISMATCH', message: `Schema ${oldSchema} does not match --from ${fromVersion}`, field: 'sem.schema' }]
        });
        continue;
      }

      // Perform migration
      let result;
      if (isBackward) {
        result = migrateBackward02to01(record as LunumRecord);
      } else {
        result = migrateForward01to02(record as LunumRecord);
      }

      const newSchema = result.record.sem.schema;
      const newFp = result.record.fingerprint;

      results.push({
        id: recordId,
        oldSchema,
        newSchema,
        oldFp,
        newFp,
        sourceValid: result.sourceValid,
        destValid: result.destValid,
        warnings: result.warnings
      });

      if (result.sourceValid && result.destValid) {
        migrated++;
      } else {
        failed++;
      }

      allWarnings.push(...result.warnings);
    }

    const output = {
      dryRun,
      direction: isBackward ? 'backward' : 'forward',
      from: fromVersion,
      to: toVersion,
      total: records.length,
      migrated,
      unchanged,
      failed,
      results,
      warningsCount: allWarnings.length,
      warnings: allWarnings.length > 0 ? allWarnings : undefined
    };

    if (dryRun) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Transform and write back
      const transformed = records.map((record, i) => {
        const oldSchema = record.sem?.schema ?? 'unknown';
        const matchesFrom = validFromVersions.includes(fromVersion)
          ? (oldSchema.includes('0.1') || record.recordVersion?.includes('0.1'))
          : oldSchema.includes(fromVersion) || record.recordVersion?.includes(fromVersion);
        if (!matchesFrom) return record;

        let result;
        if (isBackward) {
          result = migrateBackward02to01(record as LunumRecord);
        } else {
          result = migrateForward01to02(record as LunumRecord);
        }
        return result.record;
      });

      const outputData = Array.isArray(data) ? transformed : transformed[0];
      await writeFile(filePath, JSON.stringify(outputData, null, 2));
      console.log(JSON.stringify(output, null, 2));
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
  console.error('Usage: lunum inspect --text <text> | encode --sem <file> | compile --messages <file> [--mode mixed] | migrate <file> --from 0.1 --to 0.2 [--dry-run] | pipeline --text <text> [--language en] [--category simple_fact] [--risk low] [--mode full]');
  process.exitCode = 2;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
