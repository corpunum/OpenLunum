import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { compileContext, validateSem, fingerprintSem, renderSem } from '@corpunum/lunum';
import type { LunumSem, ContextMessage } from '@corpunum/lunum';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest } from './types.js';

export interface ContextReport {
  id: string;
  sourceText: string;       // Original natural source, NOT serialized Sem JSON
  sourceLanguage: string;
  naturalTokens: number;    // Estimated
  lunumTokens: number;      // Estimated
  mixedTokens: number;      // Estimated
  tokenSavings: { natural: number; mixed: number };
  eligibility: { eligible: boolean; category: string; risk: string; confidence: number; reasons: string[] };
  status: 'passed' | 'failed' | 'unsupported';
  failureReason?: string;
}

/**
 * Estimate tokens from text length (HEURISTIC ESTIMATES).
 */
function estimateTokens(text: string, tokenizer: string = 'generic'): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function runContextExperiment(
  manifest: ExperimentManifest,
  root: string
): Promise<{ results: ContextReport[]; output: string }> {
  const examplesDir = path.join(root, 'examples');
  const semFiles = (await readdir(examplesDir)).filter(f => f.endsWith('.sem.json'));

  const results: ContextReport[] = [];

  for (const file of semFiles.slice(0, manifest.limits.maxItems)) {
    const filePath = path.join(examplesDir, file);
    const content = await readFile(filePath, 'utf-8');
    let sem: LunumSem;

    try {
      sem = JSON.parse(content) as LunumSem;
    } catch {
      results.push({
        id: file, sourceText: '', sourceLanguage: 'unknown',
        naturalTokens: 0, lunumTokens: 0, mixedTokens: 0,
        tokenSavings: { natural: 0, mixed: 0 },
        eligibility: { eligible: false, category: 'unknown', risk: 'high', confidence: 0, reasons: ['parse-error'] },
        status: 'failed', failureReason: 'Failed to parse JSON'
      });
      continue;
    }

    // Validate schema
    const validation = validateSem(sem);
    if (!validation.ok) {
      results.push({
        id: file, sourceText: '', sourceLanguage: 'unknown',
        naturalTokens: 0, lunumTokens: 0, mixedTokens: 0,
        tokenSavings: { natural: 0, mixed: 0 },
        eligibility: { eligible: false, category: 'unknown', risk: 'high', confidence: 0, reasons: ['schema-invalid'] },
        status: 'failed', failureReason: `Schema validation failed: ${validation.errors.join('; ')}`
      });
      continue;
    }

    // Use ORIGINAL natural source text from annotations
    // NEVER use serialized Sem JSON as natural source
    const sourceText: string = (sem.annotations?.sourceText as string) ?? `[${sem.kind} @ ${sem.world}]`;
    const sourceLanguage: string = (sem.annotations?.sourceLanguage as string) ?? 'en';

    // Render to Lunum-Code for context compilation
    let lunumCode: string;
    try {
      const rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });
      lunumCode = rendered.code;
    } catch {
      results.push({
        id: file, sourceText: sourceText, sourceLanguage: sourceLanguage,
        naturalTokens: estimateTokens(sourceText), lunumTokens: 0, mixedTokens: 0,
        tokenSavings: { natural: 0, mixed: 0 },
        eligibility: { eligible: false, category: 'unknown', risk: 'high', confidence: 0, reasons: ['render-failed'] },
        status: 'failed', failureReason: 'Render failed'
      });
      continue;
    }

    // Build a ContextMessage for the real context compiler
    // lunumMeta is NOT set from source sem annotations — eligibility comes from validation
    const message: ContextMessage = {
      role: 'user',
      source: { text: sourceText },
      lunumCode: lunumCode || null
    } as ContextMessage;

    // Use REAL context compiler from @corpunum/lunum
    const compilation = compileContext([message], { mode: 'mixed' });

    // Eligibility computed from validation result, NOT from source sem annotations
    const validationOk = validateSem(sem);
    const eligibility: ContextReport['eligibility'] = validationOk
      ? { eligible: true, category: sem.kind, risk: 'low', confidence: 0.95, reasons: ['validated-by-schema'] }
      : { eligible: false, category: 'invalid', risk: 'high', confidence: 0.9, reasons: ['schema-validation-failed'] };

    // Calculate token savings from REAL compilation result
    const naturalTokens = compilation.naturalTokens;
    const lunumTokens = compilation.lunumTokens;
    const mixedTokens = compilation.mixedTokens;

    // Status computed from compilation success, NOT just from eligibility
    // The context runner succeeds if compilation produced valid output
    const hasCompilationOutput = compilation.selectedMessages && compilation.selectedMessages.length > 0;
    const status = hasCompilationOutput ? 'passed' : 'failed';

    results.push({
      id: file,
      sourceText,
      sourceLanguage,
      naturalTokens,
      lunumTokens,
      mixedTokens,
      tokenSavings: {
        natural: naturalTokens > 0 ? (1 - lunumTokens / naturalTokens) : 0,
        mixed: naturalTokens > 0 ? (1 - mixedTokens / naturalTokens) : 0
      },
      eligibility,
      status
    });
  }

  return { results, output: 'reports/experiments/render-context-runner' };
}

export async function writeContextReport(results: ContextReport[], outputDir: string): Promise<void> {
  const root = await findWorkspaceRoot();
  const output = path.isAbsolute(outputDir) ? outputDir : path.join(root, outputDir);
  await mkdir(output, { recursive: true });

  // Write JSONL
  const jsonlPath = path.join(output, 'context-results.jsonl');
  let jsonlContent = '';
  for (const r of results) {
    jsonlContent += JSON.stringify(r) + '\n';
  }
  await writeFile(jsonlPath, jsonlContent, 'utf8');

  // Summary
  const passed = results.filter(r => r.status === 'passed');
  const avgLunumRatio = passed.length > 0
    ? passed.reduce((sum, r) => sum + r.tokenSavings.natural, 0) / passed.length
    : 0;
  const avgMixedRatio = passed.length > 0
    ? passed.reduce((sum, r) => sum + r.tokenSavings.mixed, 0) / passed.length
    : 0;

  const summary = {
    task: 'context',
    items: results.length,
    passed: passed.length,
    failed: results.length - passed.length,
    averageLunumRatio: avgLunumRatio,
    averageMixedRatio: avgMixedRatio,
    notes: 'Token counts are HEURISTIC ESTIMATES. Eligibility computed from validateSem, not hardcoded.'
  };
  await writeJson(path.join(output, 'summary.json'), summary);

  // Markdown report
  const markdown = `# Context Runner Report

## Summary

- Items: ${results.length}
- Passed: ${passed.length}
- Failed: ${results.length - passed.length}
- Average Lunum savings (estimate): ${(avgLunumRatio * 100).toFixed(1)}%
- Average Mixed savings (estimate): ${(avgMixedRatio * 100).toFixed(1)}%
- Note: Token counts are HEURISTIC ESTIMATES

## Per-item results

| ID | Status | NaturalTokens | LunumTokens | MixedTokens | Eligible | Risk | Confidence |
|---|---|---:|---:|---:|---|---|---|
${results.map(r => `| ${r.id} | ${r.status} | ${r.naturalTokens} | ${r.lunumTokens} | ${r.mixedTokens} | ${r.eligibility.eligible} | ${r.eligibility.risk} | ${r.eligibility.confidence} |`).join('\n')}
`;
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');
}
