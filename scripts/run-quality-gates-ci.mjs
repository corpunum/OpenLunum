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
  const sem = value?.sem;
  const supportedVersionPair =
    (value?.recordVersion === 'lunum-record/0.1-draft' && sem?.schema === 'lunum-sem/0.1-draft') ||
    (value?.recordVersion === 'lunum-record/0.2' && sem?.schema === 'lunum-sem/0.2');
  const semIsValid = Boolean(
    sem &&
    typeof sem === 'object' &&
    typeof sem.world === 'string' &&
    sem.world.length > 0 &&
    typeof sem.kind === 'string' &&
    sem.kind.length > 0 &&
    Array.isArray(sem.clauses) &&
    sem.clauses.length > 0 &&
    sem.clauses.every((clause) =>
      clause &&
      typeof clause === 'object' &&
      typeof clause.predicate === 'string' &&
      clause.predicate.length > 0 &&
      clause.roles &&
      typeof clause.roles === 'object' &&
      !Array.isArray(clause.roles)
    )
  );
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.recordVersion === 'string' &&
    value.source &&
    typeof value.source.text === 'string' &&
    (typeof value.source.language === 'string' || value.source.language === null) &&
    (typeof value.source.role === 'string' || value.source.role === null) &&
    (typeof value.source.ref === 'string' || value.source.ref === null) &&
    supportedVersionPair &&
    semIsValid &&
    typeof value.fingerprint === 'string' &&
    value.fingerprint.length > 0 &&
    value.renderings &&
    typeof value.renderings === 'object' &&
    !Array.isArray(value.renderings) &&
    value.policy &&
    typeof value.policy.eligible === 'boolean' &&
    typeof value.policy.category === 'string' &&
    typeof value.policy.risk === 'string' &&
    typeof value.policy.confidence === 'number' &&
    Number.isFinite(value.policy.confidence) &&
    Array.isArray(value.policy.reasons) &&
    value.meta &&
    typeof value.meta === 'object' &&
    !Array.isArray(value.meta)
  );
}

export function recordsFromJson(value, source = 'JSON fixture') {
  if (isLunumRecord(value)) return [value];
  if (Array.isArray(value)) {
    if (value.length === 0 || !value.every(isLunumRecord)) {
      throw new TypeError(`${source} must contain only valid Lunum records`);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of ['records', 'items', 'data']) {
      const candidate = value[key];
      if (Array.isArray(candidate)) {
        if (candidate.length === 0 || !candidate.every(isLunumRecord)) {
          throw new TypeError(`${source}.${key} must contain only valid Lunum records`);
        }
        return candidate;
      }
    }
  }
  throw new TypeError(`${source} does not contain a valid Lunum record or supported record container`);
}

export function normalizeProcessExit(gateExitCode, strictMode) {
  if (gateExitCode === 2) return 2;
  if (gateExitCode === 1 && strictMode) return 1;
  return 0;
}

export function fallbackRecord() {
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

export async function loadProtectedRecords(datasetDir = PROTECTED_DATASET_DIR) {
  const records = [];
  try {
    const filenames = (await readdir(datasetDir)).filter((name) => name.endsWith('.json')).sort();
    if (filenames.length === 0) {
      throw new Error(`No protected JSON fixtures found in ${datasetDir}`);
    }

    for (const filename of filenames) {
      const fixturePath = join(datasetDir, filename);
      let parsed;
      try {
        parsed = JSON.parse(await readFile(fixturePath, 'utf8'));
      } catch (error) {
        throw new Error(`Cannot read protected fixture ${filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
      records.push(...recordsFromJson(parsed, `Protected fixture ${filename}`));
    }
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('No protected') || error.message.startsWith('Cannot read protected') || error.message.startsWith('Protected fixture'))) {
      throw error;
    }
    throw new Error(`Cannot inspect protected fixture directory ${datasetDir}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (records.length === 0) {
    throw new Error(`Protected fixtures in ${datasetDir} yielded no records`);
  }
  return records;
}

export function parseRunnerArguments(args) {
  let fallbackOnly = false;
  let protectedDir = PROTECTED_DATASET_DIR;
  for (const argument of args) {
    if (argument === '--fallback-only') {
      fallbackOnly = true;
    } else if (argument.startsWith('--protected-dir=')) {
      protectedDir = argument.slice('--protected-dir='.length);
      if (!protectedDir) throw new Error('--protected-dir requires a path');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (fallbackOnly && protectedDir !== PROTECTED_DATASET_DIR) {
    throw new Error('--fallback-only cannot be combined with --protected-dir');
  }
  return { fallbackOnly, protectedDir };
}

export async function executeQualityGateCI({
  args = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
} = {}) {
  const { fallbackOnly, protectedDir } = parseRunnerArguments(args);
  const strictMode = env.QUALITY_GATE_STRICT === '1';
  const records = fallbackOnly ? [fallbackRecord()] : await loadProtectedRecords(protectedDir);
  const inputMode = fallbackOnly ? 'fallback-only' : 'protected-fixtures';
  const report = runQualityGates(records, {
    minimumPassRate: 0.8,
    strictMode,
  });
  const markdown = generateCIReport(report);

  stdout.write(`Quality gate input mode: ${inputMode}\n${markdown}\n`);

  if (env.GITHUB_OUTPUT) {
    await appendFile(env.GITHUB_OUTPUT, `gate_exit_code=${report.exitCode}\nrecord_count=${records.length}\ninput_mode=${inputMode}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `Quality gate input mode: **${inputMode}**\n\n${markdown}\n`);
  }

  return normalizeProcessExit(report.exitCode, strictMode);
}

export async function main() {
  process.exitCode = await executeQualityGateCI();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
