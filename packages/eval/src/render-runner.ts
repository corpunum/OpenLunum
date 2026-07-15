import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { renderSem, canonicalizeSem, fingerprintSem, validateSem } from '@corpunum/lunum';
import type { LunumSem, RenderResult } from '@corpunum/lunum';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest, ItemResult } from './types.js';

/**
 * Simple tokenizer that counts tokens approximately by whitespace and punctuation.
 * This is used for portable smoke tests and must be labeled as estimates.
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English, adjusted for punctuation
  const cleaned = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(/\s+/);
  return Math.max(1, Math.ceil(words.length * 1.3));
}

/**
 * Count tokens using a target tokenizer strategy.
 * For now uses character-based estimation with model-specific adjustments.
 */
function countTokens(text: string, tokenizer: string = 'generic'): number {
  if (tokenizer === 'llama') {
    // Llama-style: more conservative (subword-like)
    return Math.ceil(text.length / 3.5);
  }
  if (tokenizer === 'claude') {
    // Claude-style
    return Math.ceil(text.length / 3.0);
  }
  if (tokenizer === 'gemini') {
    // Gemini-style
    return Math.ceil(text.length / 4.0);
  }
  // Generic estimate
  return estimateTokens(text);
}

export interface RenderReport {
  id: string;
  source: string;
  lunumSem: string;
  lunumCode: string;
  profile: string;
  naturalTokens: number;
  lunumTokens: number;
  ratio: number;
  fingerprint: string;
  canonical: string;
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
    const sem = JSON.parse(content) as LunumSem;

    // Validate
    const validation = validateSem(sem);
    if (!validation.ok) {
      results.push({
        id: file, source: file, lunumSem: JSON.stringify(sem),
        lunumCode: '', profile: 'generic-en-pivot/0.1',
        naturalTokens: 0, lunumTokens: 0, ratio: 0,
        fingerprint: '', canonical: ''
      });
      continue;
    }

    // Render
    const rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });

    // Calculate token counts
    const sourceText = content.substring(0, 200); // Approximate source
    const naturalTokens = countTokens(sourceText, 'generic');
    const lunumTokens = countTokens(rendered.code, 'generic');
    const ratio = naturalTokens > 0 ? lunumTokens / naturalTokens : 0;

    // Fingerprint
    const canonical = canonicalizeSem(sem);
    const fingerprint = fingerprintSem(canonical);

    results.push({
      id: file,
      source: file,
      lunumSem: JSON.stringify(sem).substring(0, 200),
      lunumCode: rendered.code,
      profile: rendered.profile,
      naturalTokens,
      lunumTokens,
      ratio,
      fingerprint: JSON.stringify(fingerprint),
      canonical: JSON.stringify(canonical)
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

  // Write summary
  const avgRatio = results.length > 0
    ? results.reduce((sum, r) => sum + r.ratio, 0) / results.length
    : 0;
  const summary = {
    task: 'render',
    items: results.length,
    averageRatio: avgRatio,
    notes: 'Token counts are estimates for portable smoke tests'
  };
  await writeJson(path.join(output, 'summary.json'), summary);

  // Write Markdown report
  const markdown = `# Render Runner Report

## Summary

- Items: ${results.length}
- Average Lunum/natural token ratio: ${avgRatio.toFixed(4)}

## Per-item results

| ID | Source | Lunum-Code | Profile | NaturalTokens | LunumTokens | Ratio |
|---|---|---|---|---:|---:|---:|
${results.map(r => `| ${r.id} | ${r.source.substring(0,30)} | \`${r.lunumCode}\` | ${r.profile} | ${r.naturalTokens} | ${r.lunumTokens} | ${r.ratio.toFixed(4)} |`).join('\n')}

## Notes

- Token counts are estimates based on character/token heuristics
- Exact tokenizer counts require target tokenizer adapter
`;
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');
}
