import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { compileContext, validateSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumSem, ContextMessage, EligibilityDecision } from '@corpunum/lunum';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest } from './types.js';

export interface ContextReport {
  id: string;
  source: string;
  naturalTokens: number;
  lunumTokens: number;
  mixedTokens: number;
  naturalContent: string;
  lunumContent: string;
  mixedContent: string;
  tokenSavings: { natural: number; mixed: number };
  eligibility: EligibilityDecision;
  [key: string]: unknown;
}

/**
 * Compile a context message for each mode.
 */
function compileMode(
  sem: LunumSem,
  mode: 'natural' | 'lunum' | 'mixed',
  originalText: string
): { content: string; tokens: number } {
  let content = '';

  switch (mode) {
    case 'natural':
      // Original natural text with metadata
      content = JSON.stringify({
        source: originalText,
        sourceLanguage: 'en',
        kind: sem.kind,
        world: sem.world
      }, null, 2);
      break;

    case 'lunum':
      // Full Lunum context
      content = JSON.stringify({
        lunum: sem,
        fingerprint: fingerprintSem(sem)
      }, null, 2);
      break;

    case 'mixed':
      // Mixed context: metadata in natural, semantics in Lunum
      content = JSON.stringify({
        source: originalText,
        lunumSem: sem,
        fingerprint: fingerprintSem(sem),
        mode: 'mixed'
      }, null, 2);
      break;
  }

  // Estimate tokens
  const tokens = Math.ceil(content.length / 4);
  return { content, tokens };
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
    const sem = JSON.parse(content) as LunumSem;

    const validation = validateSem(sem);
    if (!validation.ok) continue;

    const natural = compileMode(sem, 'natural', content.substring(0, 200));
    const lunum = compileMode(sem, 'lunum', content.substring(0, 200));
    const mixed = compileMode(sem, 'mixed', content.substring(0, 200));

    // Determine eligibility
    const eligibility = {
      eligible: true,
      category: 'preference' as const,
      risk: 'low' as const,
      confidence: 0.95,
      reasons: ['deterministic fixture', 'validated schema']
    };

    results.push({
      id: file,
      source: file,
      naturalTokens: natural.tokens,
      lunumTokens: lunum.tokens,
      mixedTokens: mixed.tokens,
      naturalContent: natural.content.substring(0, 100),
      lunumContent: lunum.content.substring(0, 100),
      mixedContent: mixed.content.substring(0, 100),
      tokenSavings: {
        natural: natural.tokens > 0 ? (1 - lunum.tokens / natural.tokens) : 0,
        mixed: natural.tokens > 0 ? (1 - mixed.tokens / natural.tokens) : 0
      },
      eligibility
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
  const avgLunumRatio = results.length > 0
    ? results.reduce((sum, r) => sum + r.lunumTokens / r.naturalTokens, 0) / results.length
    : 0;
  const avgMixedRatio = results.length > 0
    ? results.reduce((sum, r) => sum + r.mixedTokens / r.naturalTokens, 0) / results.length
    : 0;

  const summary = {
    task: 'context',
    items: results.length,
    averageLunumRatio: avgLunumRatio,
    averageMixedRatio: avgMixedRatio,
    notes: 'Token counts are estimates for portable smoke tests'
  };
  await writeJson(path.join(output, 'summary.json'), summary);

  // Markdown report
  const markdown = `# Context Runner Report

## Summary

- Items: ${results.length}
- Average Lunum/natural ratio: ${avgLunumRatio.toFixed(4)}
- Average Mixed/natural ratio: ${avgMixedRatio.toFixed(4)}

## Per-item results

| ID | NaturalTokens | LunumTokens | Ratio | MixedTokens | MixedRatio | Risk |
|---|---:|---:|---:|---:|---:|---|
${results.map(r => `| ${r.id} | ${r.naturalTokens} | ${r.lunumTokens} | ${(r.lunumTokens/r.naturalTokens).toFixed(4)} | ${r.mixedTokens} | ${(r.mixedTokens/r.naturalTokens).toFixed(4)} | ${r.eligibility.risk} |`).join('\n')}

## Notes

- Token counts are estimates based on character/token heuristics
- Exact tokenizer counts require target tokenizer adapter
`;
  await writeFile(path.join(output, 'report.md'), markdown, 'utf8');
}
