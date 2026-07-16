import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { renderSem, canonicalizeSem, fingerprintSem, validateSem } from '@corpunum/lunum';
import type { LunumSem, RenderResult } from '@corpunum/lunum';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest } from './types.js';

export interface RenderReport {
  id: string;
  sourceText: string;       // Original natural source text (NOT serialized Sem JSON)
  sourceLanguage: string;
  lunumSem: string;
  lunumCode: string;
  profile: string;
  naturalTokens: number;    // Estimated
  lunumTokens: number;      // Estimated
  ratio: number;
  fingerprint: string;
  canonical: string;
  status: 'passed' | 'failed' | 'unsupported';
  failureReason?: string;
}

/**
 * Estimate tokens from text length.
 * These are HEURISTIC ESTIMATES, not exact counts.
 * Exact counts require a real tokenizer adapter.
 */
function estimateTokens(text: string, tokenizer: string = 'generic'): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function runRenderExperiment(
  manifest: ExperimentManifest,
  root: string
): Promise<{ results: RenderReport[]; output: string }> {
  const examplesDir = path.join(root, 'examples');
  const semFiles = (await readdir(examplesDir)).filter(f => f.endsWith('.sem.json'));

  const results: RenderReport[] = [];

  for (const file of semFiles.slice(0, manifest.limits.maxItems)) {
    const filePath = path.join(examplesDir, file);
    const content = await readFile(filePath, 'utf-8');
    let sem: LunumSem;

    try {
      sem = JSON.parse(content) as LunumSem;
    } catch (error) {
      results.push({
        id: file, sourceText: '', sourceLanguage: 'unknown',
        lunumSem: '', lunumCode: '', profile: 'generic-en-pivot/0.1',
        naturalTokens: 0, lunumTokens: 0, ratio: 0,
        fingerprint: '', canonical: '', status: 'failed',
        failureReason: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
      });
      continue;
    }

    // Validate schema
    const validation = validateSem(sem);
    if (!validation.ok) {
      results.push({
        id: file, sourceText: '', sourceLanguage: 'unknown',
        lunumSem: '', lunumCode: '', profile: 'generic-en-pivot/0.1',
        naturalTokens: 0, lunumTokens: 0, ratio: 0,
        fingerprint: '', canonical: '', status: 'failed',
        failureReason: `Schema validation failed: ${validation.errors.join('; ')}`
      });
      continue;
    }

    // Use ORIGINAL natural source text from annotations
    // NEVER use serialized Sem JSON as natural source
    const sourceText: string = (sem.annotations?.sourceText as string) ?? `[${sem.kind} @ ${sem.world}]`;
    const sourceLanguage: string = (sem.annotations?.sourceLanguage as string) ?? 'en';

    // Render to Lunum-Code
    let rendered: RenderResult;
    try {
      rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });
    } catch (error) {
      results.push({
        id: file, sourceText: sourceText, sourceLanguage: sourceLanguage,
        lunumSem: JSON.stringify(sem), lunumCode: '', profile: 'generic-en-pivot/0.1',
        naturalTokens: estimateTokens(sourceText), lunumTokens: 0, ratio: 0,
        fingerprint: '', canonical: '', status: 'failed',
        failureReason: `Render failed: ${error instanceof Error ? error.message : String(error)}`
      });
      continue;
    }

    // Calculate token estimates (HEURISTIC, not exact)
    const naturalTokens = estimateTokens(sourceText, 'generic');
    const lunumTokens = estimateTokens(rendered.code, 'generic');
    const ratio = naturalTokens > 0 ? lunumTokens / naturalTokens : 0;

    // Fingerprint
    const canonical = canonicalizeSem(sem);
    const fp = fingerprintSem(canonical);

    results.push({
      id: file,
      sourceText: sourceText,
      sourceLanguage: sourceLanguage,
      lunumSem: JSON.stringify(sem).substring(0, 200),
      lunumCode: rendered.code,
      profile: rendered.profile,
      naturalTokens,
      lunumTokens,
      ratio,
      fingerprint: typeof fp === 'string' ? fp : String(fp),
      canonical: JSON.stringify(canonical),
      status: rendered.code.length > 0 ? 'passed' : 'failed'
    });
  }

  return { results, output: 'reports/experiments/render-context-runner' };
}

export async function writeRenderReport(results: RenderReport[], outputDir: string): Promise<void> {
  const root = await findWorkspaceRoot();
  const output = path.isAbsolute(outputDir) ? outputDir : path.join(root, outputDir);
  await mkdir(output, { recursive: true });

  // Write JSONL results
  const jsonlPath = path.join(output, 'render-results.jsonl');
  let jsonlContent = '';
  for (const r of results) {
    jsonlContent += JSON.stringify(r) + '\n';
  }
  await writeFile(jsonlPath, jsonlContent, 'utf8');

  // Summary with estimates label
  const avgRatio = results.length > 0
    ? results.filter(r => r.status === 'passed').reduce((sum, r) => sum + r.ratio, 0) / results.length
    : 0;
  const summary = {
    task: 'render',
    items: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status !== 'passed').length,
    averageRatio: avgRatio,
    notes: 'Token counts are heuristic ESTIMATES for portable smoke tests. Exact counts require a real tokenizer adapter.'
  };
  await writeJson(path.join(output, 'summary.json'), summary);

  // Markdown report
  const markdown = `# Render Runner Report

## Summary

- Items: ${results.length}
- Passed: ${results.filter(r => r.status === 'passed').length}
- Failed: ${results.filter(r => r.status !== 'passed').length}
- Average Lunum/natural token ratio (estimate): ${avgRatio.toFixed(4)}
- Note: Token counts are HEURISTIC ESTIMATES, not exact counts

## Per-item results

| ID | Status | Source | Lunum-Code | Ratio |
|---|---|---|---|---:|
${results.map(r => `| ${r.id} | ${r.status} | ${(r.sourceText as string).substring(0,30)} | \`${(r.lunumCode || '').substring(0,30)}\` | ${r.ratio.toFixed(4)} |`).join('\n')}
`;
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');
}
