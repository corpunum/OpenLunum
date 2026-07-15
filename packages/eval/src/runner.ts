import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareSem, validateSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, validateManifest, validateProfile, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt, realizePrompt } from './prompts.js';
import type { ExperimentManifest, ItemResult, ModelProfile } from './types.js';

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

function literalCoverage(text: string, literals: string[]): number {
  if (!literals.length) return 1;
  const found = literals.filter((literal) => text.includes(literal)).length;
  return found / literals.length;
}

export async function runExperiment(manifestPath: string): Promise<string> {
  const root = await findWorkspaceRoot();
  const manifest = await readJson<ExperimentManifest>(manifestPath);
  validateManifest(manifest);
  const datasetPath = path.isAbsolute(manifest.dataset.path) ? manifest.dataset.path : path.join(root, manifest.dataset.path);
  const modelProfilePath = path.isAbsolute(manifest.modelProfile) ? manifest.modelProfile : path.join(root, manifest.modelProfile);
  const outputRoot = path.isAbsolute(manifest.outputDirectory) ? manifest.outputDirectory : path.join(root, manifest.outputDirectory);
  const actualHash = await sha256File(datasetPath);
  if (actualHash !== manifest.dataset.sha256) throw new Error(`Dataset hash mismatch: expected ${manifest.dataset.sha256}, got ${actualHash}`);
  const profile = await readJson<ModelProfile>(modelProfilePath);
  validateProfile(profile);
  const model = new OpenAICompatibleModel(profile);
  const dataset = (await loadDataset(datasetPath)).slice(0, manifest.limits.maxItems);
  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const output = path.join(outputRoot, runId);
  await mkdir(output, { recursive: true });
  await writeJson(path.join(output, 'manifest.snapshot.json'), manifest);
  await writeJson(path.join(output, 'environment.json'), { node: process.version, platform: process.platform, arch: process.arch, modelProfile: profile, startedAt: new Date().toISOString() });
  const results: ItemResult[] = [];
  let calls = 0;
  for (const item of dataset) {
    if (calls >= manifest.limits.maxModelCalls) break;
    let finalResult: ItemResult | null = null;
    for (let attempt = 1; attempt <= manifest.limits.maxAttemptsPerItem && calls < manifest.limits.maxModelCalls; attempt += 1) {
      const started = performance.now();
      let rawOutput = '';
      try {
        const prompt = manifest.task === 'realize' ? realizePrompt(item, manifest.targetLanguage ?? item.targetLanguage ?? 'English') : parsePrompt(item);
        calls += 1;
        rawOutput = await model.complete(prompt.system, prompt.user);
        if (manifest.task === 'parse') {
          const parsed = extractJson(rawOutput);
          const validation = validateSem(parsed);
          if (!validation.ok) throw new Error(validation.errors.join('; '));
          const parsedSem = parsed as LunumSem;
          const comparison = compareSem(item.goldSem, parsedSem);
          finalResult = { id: item.id, status: comparison.exactFingerprint ? 'passed' : 'failed', rawOutput, parsedSem, exact: comparison.exactFingerprint, featureRecall: comparison.featureRecall, featurePrecision: comparison.featurePrecision, missingFeatures: comparison.missingFeatures, latencyMs: performance.now() - started };
        } else if (manifest.task === 'realize') {
          const coverage = literalCoverage(rawOutput, item.protectedLiterals ?? []);
          finalResult = { id: item.id, status: coverage === 1 ? 'passed' : 'failed', rawOutput, realizedText: rawOutput.trim(), exact: coverage === 1, featureRecall: coverage, featurePrecision: coverage, protectedLiteralCoverage: coverage, latencyMs: performance.now() - started };
        } else {
          throw new Error(`Task ${manifest.task} is specified but not yet executable by the local-model runner`);
        }
        if (finalResult.status === 'passed') break;
      } catch (error) {
        finalResult = { id: item.id, status: 'error', rawOutput, error: `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`, latencyMs: performance.now() - started };
      }
    }
    if (finalResult) results.push(finalResult);
  }
  const resultPath = path.join(output, 'item-results.jsonl');
  await writeFile(resultPath, '', 'utf8');
  for (const result of results) await appendFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');
  const failures = results.filter((result) => result.status !== 'passed');
  await writeFile(path.join(output, 'failures.jsonl'), failures.map((result) => JSON.stringify(result)).join('\n') + (failures.length ? '\n' : ''), 'utf8');
  const exactRate = results.length ? results.filter((result) => result.exact === true).length / results.length : 0;
  const featureRecall = results.length ? results.reduce((sum, result) => sum + (result.featureRecall ?? 0), 0) / results.length : 0;
  const protectedCoverage = results.length ? results.reduce((sum, result) => sum + (result.protectedLiteralCoverage ?? 1), 0) / results.length : 0;
  const summary = { experimentId: manifest.id, runId, task: manifest.task, items: results.length, calls, passed: results.length - failures.length, failed: failures.length, exactRate, featureRecall, protectedLiteralCoverage: protectedCoverage, gatesPassed: featureRecall >= manifest.gates.minimumFeatureRecall && exactRate >= manifest.gates.minimumExactRate && (!manifest.gates.requireProtectedLiteralCoverage || protectedCoverage === 1) };
  await writeJson(path.join(output, 'summary.json'), summary);
  const markdown = `# Experiment ${manifest.id}\n\n- Run: ${runId}\n- Task: ${manifest.task}\n- Items: ${results.length}\n- Calls: ${calls}\n- Exact rate: ${exactRate.toFixed(4)}\n- Feature recall: ${featureRecall.toFixed(4)}\n- Protected literal coverage: ${protectedCoverage.toFixed(4)}\n- Gates passed: ${summary.gatesPassed}\n- Failures: ${failures.length}\n`;
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');
  return output;
}
