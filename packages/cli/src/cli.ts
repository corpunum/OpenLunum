#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { compileContext, deriveLunumSidecar, fingerprintSem, renderSem, validateSem } from '@corpunum/lunum';
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
  console.error('Usage: lunum inspect --text <text> | encode --sem <file> | compile --messages <file> [--mode mixed] | migrate <file> [--from 0.1] [--to 0.2] [--dry-run]');
  process.exitCode = 2;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
