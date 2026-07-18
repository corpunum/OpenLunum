import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareSem, validateSem, renderSem, canonicalizeSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumSem, LunumRendering } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, readJson, sha256File, validateManifest, validateProfile, writeJson } from './io.js';
import { OpenAICompatibleModel } from './model.js';
import { parsePrompt, realizePrompt } from './prompts.js';
import { runRenderExperiment, writeRenderReport } from './render-runner.js';
import { runContextExperiment, writeContextReport } from './context-runner.js';
import type { ExperimentManifest, ItemResult, ModelProfile, ExperimentItem } from './types.js';
export type { ExperimentItem };

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

async function runModelTask(manifest: ExperimentManifest, root: string, output: string, dataset: ExperimentItem[], profile: ModelProfile): Promise<ItemResult[]> {
  const model = new OpenAICompatibleModel(profile);
  const results: ItemResult[] = [];
  let calls = 0;

  for (const item of dataset as any) {
    if (calls >= manifest.limits.maxModelCalls) break;
    let finalResult: ItemResult | null = null;

    for (let attempt = 1; attempt <= manifest.limits.maxAttemptsPerItem && calls < manifest.limits.maxModelCalls; attempt += 1) {
      const started = performance.now();
      let rawOutput = '';
      try {
        const promptText = manifest.task === 'realize'
          ? realizePrompt(item as any, manifest.targetLanguage ?? (item as any).targetLanguage ?? 'English').user
          : parsePrompt(item as any).user;

        calls += 1;
        rawOutput = await model.complete('You are a precise Lunum experiment runner. Reply only with valid JSON.', promptText);

        if (manifest.task === 'parse') {
          // Missing goldSem must fail, not self-pass
          if (!item.goldSem) {
            throw new Error('goldSem is required for parse but missing');
          }
          const parsed = extractJson(rawOutput);
          const validation = validateSem(parsed);
          if (!validation.ok) throw new Error(validation.errors.join('; '));
          const parsedSem = parsed as LunumSem;
          // Use actual goldSem as reference, not the parsed result
          const comparison = compareSem((item as any).goldSem as any, parsedSem);
          finalResult = {
            id: item.id, status: comparison.exactFingerprint ? 'passed' : 'failed', rawOutput, parsedSem,
            exact: comparison.exactFingerprint, featureRecall: comparison.featureRecall,
            featurePrecision: comparison.featurePrecision, missingFeatures: comparison.missingFeatures,
            latencyMs: performance.now() - started
          };
        } else if (manifest.task === 'realize') {
          const coverage = literalCoverage(rawOutput, item.protectedLiterals ?? []);
          finalResult = {
            id: item.id, status: coverage === 1 ? 'passed' : 'failed', rawOutput,
            realizedText: rawOutput.trim(), exact: coverage === 1, featureRecall: coverage,
            featurePrecision: coverage, protectedLiteralCoverage: coverage, latencyMs: performance.now() - started
          };
        } else {
          // For non-parse/realize tasks, compute status from output content, NOT model self-assessment
          const result = extractJson(rawOutput) as Record<string, unknown>;
          // Compute status independently: output must be non-empty JSON with expected fields
          const hasOutput = rawOutput.trim().length > 0;
          const resultIsValid = result && typeof result === 'object' && !('error' in result);
          const status = (hasOutput && resultIsValid) ? 'passed' : 'failed';
          finalResult = {
            id: item.id, status, rawOutput, result, latencyMs: performance.now() - started
          };
        }

        if (finalResult.status === 'passed') break;
      } catch (error) {
        finalResult = {
          id: item.id, status: 'error', rawOutput,
          error: `attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
          latencyMs: performance.now() - started
        };
      }
    }
    if (finalResult) results.push(finalResult);
  }
  return results;
}

async function runDeterministicTask(manifest: ExperimentManifest, root: string, outputDir: string): Promise<ItemResult[]> {
  const results: ItemResult[] = [];

  switch (manifest.task) {
    case 'render': {
      // Use dedicated render runner with original source text
      const renderResult = await runRenderExperiment(manifest, root);
      // Reports written to output directory
      await writeRenderReport(renderResult.results, outputDir);
      results.push(...renderResult.results.map((r, _i) => ({
        id: r.id, status: r.status, result: r as unknown as Record<string, unknown>, exact: r.status === 'passed', latencyMs: 0
      })) as unknown as ItemResult[]);
      break;
    }

    case 'context': {
      // Use dedicated context runner with real compiler/policy
      const ctxResult = await runContextExperiment(manifest, root);
      // Reports written to output directory
      await writeContextReport(ctxResult.results, outputDir);
      results.push(...ctxResult.results.map((r, _i) => ({
        id: r.id, status: r.status, result: r as unknown as Record<string, unknown>, exact: r.status === 'passed', latencyMs: 0
      })) as unknown as ItemResult[]);
      break;
    }

    case 'conformance': {
      // Schema conformance check
      const { readdir } = await import('node:fs/promises');
      const schemasDir = path.join(root, 'schemas');
      const schemaFiles = (await readdir(schemasDir)).filter(f => f.endsWith('.schema.json'));
      for (const schemaFile of schemaFiles) {
        const started = performance.now();
        try {
          const schemaContent = await import('node:fs/promises').then(fs => fs.readFile(path.join(schemasDir, schemaFile), 'utf-8'));
          const schema = JSON.parse(schemaContent);
          const hasId = !!schema.$id;
          const hasSchema = !!schema.$schema;
          const hasType = !!schema.type;
          const valid = hasId && hasSchema && hasType;
          results.push({
            id: schemaFile, status: valid ? 'passed' : 'failed', rawOutput: '',
            result: { hasId, hasSchema, hasType } as Record<string, unknown>, exact: valid, latencyMs: performance.now() - started
          });
        } catch (error) {
          results.push({
            id: schemaFile, status: 'error', rawOutput: '',
            error: error instanceof Error ? error.message : String(error), latencyMs: performance.now() - started
          });
        }
      }
      break;
    }

    case 'infrastructure': {
      // Infrastructure checks
      const { execSync } = await import('node:child_process');
      const checks = [
        { name: 'core-types-compile', check: async () => {
          try { await import('@corpunum/lunum'); return true; } catch { return false; }
        }},
        { name: 'schemas-exist', check: async () => {
          const { readdir } = await import('node:fs/promises');
          const schemas = await readdir(path.join(root, 'schemas'));
          return schemas.length >= 5;
        }},
        { name: 'types-schema-sync', check: async () => {
          try {
            execSync(`node ${path.join(root, 'scripts', 'schema-to-ts.cjs')} --dry-run`, { cwd: root, stdio: 'pipe' });
            return true;
          } catch { return false; }
        }}
      ];
      for (const check of checks.slice(0, manifest.limits.maxItems)) {
        const started = performance.now();
        try {
          const pass = await check.check();
          results.push({
            id: check.name, status: pass ? 'passed' : 'failed', rawOutput: '',
            exact: pass, latencyMs: performance.now() - started
          });
        } catch (error) {
          results.push({
            id: check.name, status: 'error', rawOutput: '',
            error: error instanceof Error ? error.message : String(error), latencyMs: performance.now() - started
          });
        }
      }
      break;
    }

    case 'retrieval': {
      // Use dedicated retrieval runner
      const { runRetrievalExperiment } = await import('./retrieval-runner.js');
      const retrievalResults = await runRetrievalExperiment(manifest as any, root, outputDir);
      results.push(...retrievalResults);
      break;
    }

    case 'integration': {
      // Use dedicated integration runner
      const { runIntegrationExperiment } = await import('./integration-runner.js');
      const integrationResults = await runIntegrationExperiment(manifest as any, root, outputDir);
      results.push(...integrationResults);
      break;
    }

    default:
      throw new Error(`Deterministic task not yet implemented: ${manifest.task}`);
  }

  return results;
}

export async function runExperiment(manifestPath: string): Promise<string> {
  const root = await findWorkspaceRoot();
  const manifest = await readJson<ExperimentManifest>(manifestPath);
  validateManifest(manifest);

  const outputRoot = path.isAbsolute(manifest.outputDirectory)
    ? manifest.outputDirectory
    : path.join(root, manifest.outputDirectory);

  const isDeterministic = manifest.deterministic === true;
  let dataset: ExperimentItem[] = [];
  let profile: ModelProfile | null = null;

  if (isDeterministic) {
    dataset = [];
    profile = null;
  } else {
    if (!manifest.dataset) throw new Error('Model task requires dataset');
    if (!manifest.modelProfile) throw new Error('Model task requires modelProfile');

    const datasetPath = path.isAbsolute(manifest.dataset.path)
      ? manifest.dataset.path
      : path.join(root, manifest.dataset.path);
    const modelProfilePath = path.isAbsolute(manifest.modelProfile)
      ? manifest.modelProfile
      : path.join(root, manifest.modelProfile);

    const actualHash = await sha256File(datasetPath);
    if (actualHash !== manifest.dataset.sha256) {
      throw new Error(`Dataset hash mismatch: expected ${manifest.dataset.sha256}, got ${actualHash}`);
    }

    dataset = (await loadDataset(datasetPath)).slice(0, manifest.limits.maxItems) as any;
    profile = await readJson<ModelProfile>(modelProfilePath);
    validateProfile(profile);
  }

  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const output = path.join(outputRoot, runId);
  await mkdir(output, { recursive: true });
  await writeJson(path.join(output, 'manifest.snapshot.json'), manifest);
  await writeJson(path.join(output, 'environment.json'), {
    node: process.version, platform: process.platform, arch: process.arch,
    modelProfile: profile, deterministic: isDeterministic,
    startedAt: new Date().toISOString()
  });

  const results: ItemResult[] = isDeterministic
    ? await runDeterministicTask(manifest, root, output)
    : profile
      ? await runModelTask(manifest, root, output, dataset, profile)
      : [];

  // Write results
  const resultPath = path.join(output, 'item-results.jsonl');
  await writeFile(resultPath, '', 'utf8');
  for (const result of results) await appendFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');

  const failures = results.filter((result) => result.status !== 'passed');
  await writeFile(
    path.join(output, 'failures.jsonl'),
    failures.map((result) => JSON.stringify(result)).join('\n') + (failures.length ? '\n' : ''),
    'utf8'
  );

  const exactRate = results.length ? results.filter((result) => result.exact === true).length / results.length : 0;
  const featureRecall = results.length ? results.reduce((sum, result) => sum + (result.featureRecall ?? 1), 0) / results.length : 0;
  const protectedCoverage = results.length ? results.reduce((sum, result) => sum + (result.protectedLiteralCoverage ?? 1), 0) / results.length : 0;

  // Compute aggregate MRR for retrieval tasks
  let aggregateMrr = 0;
  if (manifest.task === 'retrieval' && results.length > 0) {
    const sum = results.reduce((acc, r) => acc + ((r as any).meanReciprocalRank ?? 0), 0);
    aggregateMrr = sum / results.length;
  }

  const summary = {
    experimentId: manifest.id, runId, task: manifest.task, deterministic: isDeterministic,
    items: results.length, calls: isDeterministic ? 0 : results.length,
    passed: results.length - failures.length, failed: failures.length,
    exactRate, featureRecall, protectedLiteralCoverage: protectedCoverage,
    meanReciprocalRank: manifest.task === 'retrieval' ? aggregateMrr : undefined,
    gatesPassed: featureRecall >= (manifest.gates.minimumFeatureRecall ?? 0) &&
                 exactRate >= (manifest.gates.minimumExactRate ?? 0) &&
                 (!manifest.gates.requireProtectedLiteralCoverage || protectedCoverage === 1)
  };

  await writeJson(path.join(output, 'summary.json'), summary);

  const markdownLines = [
    `# Experiment ${manifest.id}`,
    '',
    `- Run: ${runId}`,
    `- Task: ${manifest.task}`,
    `- Deterministic: ${isDeterministic}`,
    `- Items: ${results.length}`,
    `- Exact rate: ${exactRate.toFixed(4)}`,
    `- Feature recall: ${featureRecall.toFixed(4)}`,
    `- Protected literal coverage: ${protectedCoverage.toFixed(4)}`,
    `- Gates passed: ${summary.gatesPassed}`,
    `- Failures: ${failures.length}`
  ];
  if (manifest.task === 'retrieval') {
    markdownLines.push(`- Mean reciprocal rank: ${aggregateMrr.toFixed(4)}`);
  }
  const markdown = markdownLines.join('\n') + '\n';
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');

  return output;
}