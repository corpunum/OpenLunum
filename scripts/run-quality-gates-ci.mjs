#!/usr/bin/env node

import { appendFile, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createRecord,
  generateCIReport,
  runQualityGates,
} from '../packages/core/dist/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROTECTED_DATASET_DIR = join(ROOT, 'datasets', 'protected');

export function isLunumRecord(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.recordVersion === 'string' &&
    value.source &&
    typeof value.source.text === 'string' &&
    value.sem &&
    typeof value.sem.schema === 'string' &&
    Array.isArray(value.sem.clauses) &&
    typeof value.fingerprint === 'string' &&
    value.renderings &&
    typeof value.renderings === 'object' &&
    value.policy &&
    typeof value.policy.eligible === 'boolean' &&
    value.meta &&
    typeof value.meta === 'object'
  );
}

export function recordsFromJson(value) {
  if (isLunumRecord(value)) return [value];
  if (Array.isArray(value)) return value.filter(isLunumRecord);
  if (value && typeof value === 'object') {
    for (const key of ['records', 'items', 'data']) {
      const candidate = value[key];
      if (Array.isArray(candidate)) {
        const records = candidate.filter(isLunumRecord);
        if (records.length > 0) return records;
      }
    }
  }
  return [];
}

export function normalizeProcessExit(gateExitCode, strictMode) {
  if (gateExitCode === 2) return 2;
  if (gateExitCode === 1 && strictMode) return 1;
  return 0;
}

function fallbackRecord() {
  return createRecord({
    sourceText: 'Quality gate fallback record.',
    sourceLanguage: 'en',
    role: 'system',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'ci_fixture',
      clauses: [
        {
          predicate: 'verify',
          roles: { target: 'quality_gate' },
          negated: false,
        },
      ],
    },
    category: 'ci_fixture',
    risk: 'low',
    confidence: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
}

async function loadProtectedRecords() {
  const records = [];
  let filenames = [];
  try {
    filenames = (await readdir(PROTECTED_DATASET_DIR)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return records;
  }

  for (const filename of filenames) {
    try {
      const parsed = JSON.parse(await readFile(join(PROTECTED_DATASET_DIR, filename), 'utf8'));
      records.push(...recordsFromJson(parsed));
    } catch (error) {
      process.stderr.write(`Skipping unreadable protected fixture ${filename}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  return records;
}

export async function main() {
  const strictMode = process.env.QUALITY_GATE_STRICT === '1';
  const protectedRecords = await loadProtectedRecords();
  const records = protectedRecords.length > 0 ? protectedRecords : [fallbackRecord()];
  const report = runQualityGates(records, {
    minimumPassRate: 0.8,
    strictMode,
  });
  const markdown = generateCIReport(report);

  process.stdout.write(`${markdown}\n`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `gate_exit_code=${report.exitCode}\nrecord_count=${records.length}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  process.exitCode = normalizeProcessExit(report.exitCode, strictMode);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
