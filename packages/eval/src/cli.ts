#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { findWorkspaceRoot, readJson, sha256File, validateProfile, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { runExperiment } from './runner.js';
import { runSmoke } from './smoke.js';
import { runParseExperimentCli } from './parse-experiment.js';
import { runRetentionCli } from './retention-cli.js';
import { runFalsePositiveReviewCliEntrypoint } from './false-positive-review-cli.js';
import type { ExperimentManifest, ExperimentTask, ModelProfile, WorkArea } from './types.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function createExperiment(): Promise<void> {
  const id = flag('id');
  const area = flag('area') as WorkArea | undefined;
  const task = flag('task') as ExperimentTask | undefined;
  if (!id || !area || !task) throw new Error('create requires --id, --area, and --task');
  const root = await findWorkspaceRoot();
  const directory = path.join(root, 'experiments', id);
  await mkdir(directory, { recursive: true });
  const datasetPath = 'datasets/dev/multilingual-core-v1.jsonl';
  let baselineCommit = 'UNCOMMITTED';
  try { baselineCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* non-git export */ }
  const manifest: ExperimentManifest = {
    schema: 'openlunum-experiment/0.1', id, area, task,
    hypothesis: 'Replace with one falsifiable hypothesis.', baselineCommit,
    dataset: { path: datasetPath, sha256: await sha256File(path.join(root, datasetPath)) },
    modelProfile: 'profiles/models/local-openai-compatible.example.json',
    limits: { maxItems: 16, maxAttemptsPerItem: 1, maxModelCalls: 16 },
    gates: { minimumFeatureRecall: 0.95, minimumExactRate: 0.75, requireProtectedLiteralCoverage: true },
    outputDirectory: `reports/experiments/${id}`
  };
  await writeJson(path.join(directory, 'experiment.json'), manifest);
  await writeFile(path.join(directory, 'CLAIM.md'), `# Claim\n\n- Worker: REPLACE\n- Area: ${area}\n- Branch: agent/REPLACE/${area}/${id}\n- Started: ${new Date().toISOString().slice(0, 10)}\n`, 'utf8');
  await writeFile(path.join(directory, 'notes.md'), '# Notes\n\n', 'utf8');
  console.log(path.relative(root, directory));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'smoke') { console.log(JSON.stringify(await runSmoke(), null, 2)); return; }
  if (command === 'status') {
    console.log(['OpenLunum worker status', '- Read START_HERE.md and AGENTS.md', '- Select one area from WORK_QUEUE.md', '- Run pnpm verify', '- Create a bounded experiment', '- Push an agent/... branch; do not merge autonomously'].join('\n'));
    return;
  }
  if (command === 'doctor') {
    const profilePath = flag('profile');
    if (!profilePath) throw new Error('doctor requires --profile <path>');
    const profile = await readJson<ModelProfile>(profilePath); validateProfile(profile);
    console.log(JSON.stringify(await new OpenAICompatibleModel(profile).doctor(), null, 2)); return;
  }
  if (command === 'create') { await createExperiment(); return; }
  if (command === 'run') {
    const manifest = flag('manifest') ?? process.argv[3];
    if (!manifest) throw new Error('run requires --manifest <path> or a positional manifest path');
    const root = await findWorkspaceRoot();
    const resolved = path.isAbsolute(manifest) ? manifest : path.join(root, manifest);
    console.log(await runExperiment(resolved)); return;
  }
  if (command === 'report') throw new Error('Reports are generated automatically by experiment:run in 0.2.0');
  if (command === 'parse-experiment') { await runParseExperimentCli(); return; }
  if (command === 'retention') {
    const manifest = flag('manifest') ?? process.argv[3];
    if (!manifest) throw new Error('retention requires --manifest <path> or a positional manifest path');
    const profile = flag('profile');
    const mockFixture = flag('mock-fixture');
    if (profile && mockFixture) {
      throw new Error('retention accepts either --profile <file> or test-only --mock-fixture <file>, not both');
    }
    const outputRoot = flag('output-root');
    const root = await findWorkspaceRoot();
    const resolvedManifest = path.isAbsolute(manifest) ? manifest : path.join(root, manifest);
    const options: NonNullable<Parameters<typeof runRetentionCli>[1]> = { root };
    if (profile) options.modelProfilePath = profile;
    if (mockFixture) options.mockFixturePath = mockFixture;
    if (outputRoot) options.outputRoot = outputRoot;
    const result = await runRetentionCli(resolvedManifest, options);
    console.log(JSON.stringify({ outputDirectory: result.outputDirectory, summary: result.summary }, null, 2));
    return;
  }
  if (command === 'false-positive-review') {
    const root = await findWorkspaceRoot();
    const { outputDirectory, summary } = await runFalsePositiveReviewCliEntrypoint(process.argv.slice(3), root);
    console.log(JSON.stringify({ outputDirectory, summary }, null, 2));
    return;
  }
  throw new Error('Commands: smoke | status | doctor --profile <file> | create --id <id> --area <area> --task <task> | run --manifest <file> | parse-experiment <manifest> | retention --manifest <file> --profile <file> [--output-root <dir>] [--mock-fixture <file>] | false-positive-review --manifest <file> --profile <file> [--output-root <dir>] [--mock-fixture <file>]');
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
