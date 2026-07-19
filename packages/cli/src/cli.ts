#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { compileContext, createRecord, deriveLunumSidecar, deriveSurfaceSidecar, fingerprintSem, renderSem, validateSem, runQualityGates, generateCIReport } from '@corpunum/lunum';
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
    const data = await readJson<any>(path);
    const records = Array.isArray(data) ? data : [data];
    const changes: Array<{ id: string; oldSchema: string; newSchema: string }> = [];
    const warnings: string[] = [];
    let migrated = 0;
    let unchanged = 0;
    for (const record of records) {
      const oldSchema = record.sem?.schema ?? 'unknown';
      if (!oldSchema.includes(fromVersion)) {
        warnings.push(`${record.id || 'unknown'}: schema ${oldSchema} does not match --from ${fromVersion}`);
        unchanged++;
        continue;
      }
      const newSem = { ...record.sem, schema: `lunum-sem/${toVersion}` };
      changes.push({
        id: record.id || 'unknown',
        oldSchema,
        newSchema: newSem.schema
      });
      migrated++;
    }
    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, from: fromVersion, to: toVersion, total: records.length, migrated, unchanged, changes, warnings }, null, 2));
    } else {
      // Transform and write back
      const transformed = records.map(record => {
        const oldSchema = record.sem?.schema ?? 'unknown';
        if (!oldSchema.includes(fromVersion)) return record;
        const newSem = { ...record.sem, schema: `lunum-sem/${toVersion}` };
        return { ...record, sem: newSem };
      });
      const output = Array.isArray(data) ? transformed : transformed[0];
      await writeFile(path, JSON.stringify(output, null, 2));
      console.log(JSON.stringify({ dryRun: false, from: fromVersion, to: toVersion, total: records.length, migrated, unchanged, changes, warnings }, null, 2));
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
  if (command === 'quality-gate') {
    // Run quality gates on records
    // Usage: lunum quality-gate --records <file> [--min-pass-rate 0.8] [--strict] [--output report.md]
    const recordsFile = flag('records') || flag('file') || process.argv[3];
    const minPassRate = flag('min-pass-rate') ? parseFloat(flag('min-pass-rate')!) : 0.8;
    const strict = process.argv.includes('--strict');
    const outputReport = flag('output');

    let records: LunumRecord[];
    if (recordsFile) {
      const data = await readJson<any>(recordsFile);
      records = Array.isArray(data) ? data : [data];
    } else {
      // Try stdin
      const chunks: Buffer[] = [];
      process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      const input = await new Promise<string>((resolve) => {
        process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      const data = JSON.parse(input);
      records = Array.isArray(data) ? data : [data];
    }

    if (records.length === 0) {
      console.error('Error: no records provided');
      process.exitCode = 1;
      return;
    }

    const report = runQualityGates(records, { minimumPassRate: minPassRate, strictMode: strict });
    const markdown = generateCIReport(report);

    if (outputReport) {
      await writeFile(outputReport, markdown, 'utf-8');
      console.log(`Quality gate report written to ${outputReport}`);
      console.log(`Exit code: ${report.exitCode}`);
    } else {
      console.log(markdown);
    }

    process.exitCode = report.exitCode;
    return;
  }
  console.error('Usage: lunum inspect --text <text> | encode --sem <file> | compile --messages <file> [--mode mixed] | migrate <file> [--from 0.1] [--to 0.2] [--dry-run] | pipeline --text <text> [--language en] [--category simple_fact] [--risk low] [--mode full] | quality-gate --records <file> [--min-pass-rate 0.8] [--strict] [--output report.md]');
  process.exitCode = 2;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
