import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetItem, ExperimentManifest, ModelProfile } from './types.js';


export async function findWorkspaceRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    try {
      await access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Could not find pnpm-workspace.yaml above ${start}`);
      current = parent;
    }
  }
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}
`, 'utf8');
}

export async function sha256File(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function loadDataset(file: string): Promise<DatasetItem[]> {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/u).filter((line) => line.trim());
  return lines.map((line, index) => {
    try { return JSON.parse(line) as DatasetItem; }
    catch (error) { throw new Error(`Invalid JSONL at ${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
}

export function validateManifest(value: ExperimentManifest): void {
  if (value.schema !== 'openlunum-experiment/0.1') throw new Error('Unsupported experiment schema');
  for (const key of ['id', 'area', 'task', 'hypothesis', 'baselineCommit', 'outputDirectory'] as const) if (!String(value[key] ?? '').trim()) throw new Error(`${key} is required`);

  const isDeterministic = value.deterministic === true;
  const deterministicTasks = ['render', 'context', 'conformance', 'infrastructure'] as const;
  const isDeterministicTask = isDeterministic || deterministicTasks.includes(value.task as any);

  if (!isDeterministicTask) {
    if (!value.dataset?.path || !/^[a-f0-9]{64}$/u.test(value.dataset.sha256)) throw new Error('dataset path and SHA-256 are required for non-deterministic tasks');
    if (!value.modelProfile) throw new Error('modelProfile is required for non-deterministic tasks');
  }

  if (value.limits.maxModelCalls < 0 || value.limits.maxItems < 0 || value.limits.maxAttemptsPerItem < 1) throw new Error('experiment limits must be non-negative');
}

export function validateProfile(value: ModelProfile): void {
  if (value.schema !== 'openlunum-model-profile/0.1') throw new Error('Unsupported model profile schema');
  if (value.provider !== 'openai-compatible') throw new Error('Only openai-compatible profiles are currently supported');
  if (!value.baseUrl || !value.model) throw new Error('baseUrl and model are required');
}
