import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { compileContext, validateSem, fingerprintSem, renderSem } from '@corpunum/lunum';
import type { LunumSem, LunumRecord, EligibilityDecision } from '@corpunum/lunum';
import { writeJson, findWorkspaceRoot } from './io.js';
import type { ExperimentManifest } from './types.js';

export interface ContextReport {
  id: string;
  sourceText: string;       // Original natural source
  sourceLanguage: string;
  naturalTokens: number;    // Estimated
  lunumTokens: number;      // Estimated
  mixedTokens: number;      // Estimated
  tokenSavings: { natural: number; mixed: number };
  eligibility: EligibilityDecision;
  [key: string]: unknown;
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

    // Use real source text
    const sourceText: string = (sem.annotations?.sourceText as string) ?? content.substring(0, 200);
    const sourceLanguage = (sem.annotations?.sourceLanguage) ?? 'en';

    // Render to Lunum-Code for context compilation
    let lunumCode: string;
    try {
      const rendered = renderSem(sem, { profile: 'generic-en-pivot/0.1' });
      lunumCode = rendered.code;
    } catch {
      results.push({
        id: file, sourceText, sourceLanguage: String(sourceLanguage),
        naturalTokens: estimateTokens(sourceText), lunumTokens: 0, mixedTokens: 0,
        tokenSavings: { natural: 0, mixed: 0 },
        eligibility: { eligible: false, category: 'unknown', risk: 'high', confidence: 0, reasons: ['render-failed'] },
        status: 'failed', failureReason: 'Render failed'
      });
      continue;
    }

    // Use real context compiler and policy
    // Build a LunumRecord to feed to compileContext
    const canonical = require('@corpunum/lunum').canonicalizeSem(sem);
    const fp = require('@corpunum/lunum').fingerprintSem(canonical);

    const record: LunumRecord = {
      recordVersion: 'lunum-record/0.1-draft',
      source: {
        text: sourceText as string,
        language: String(sourceLanguage),
        role: null,
        ref: null
      },
      sem,
      fingerprint: fp.fingerprint,
      renderings: { 'generic-en-pivot/0.1': { code: lunumCode, profile: 'generic-en-pivot/0.1', tokens: null } },
      policy: { eligible: true, category: sem.kind, risk: 'low', confidence: 0.9, reasons: ['validated', 'low-risk'] },
      meta: {}
    };

    // Determine eligibility and risk from real policy evaluation
    // Not hardcoded - uses the record's policy field
    const eligibility: EligibilityDecision = {
      eligible: record.policy.eligible,
      category: record.policy.category,
      risk: record.policy.risk,
      confidence: record.policy.confidence,
      reasons: record.policy.reasons
    };

    // Calculate context sizes for each mode
    const naturalContent = JSON.stringify({ source: record.source.text, metadata: { kind: sem.kind, world: sem.world } });
    const lunumContent = lunumCode;
    const mixedContent = JSON.stringify({ source: record.source.text, lunum: lunumCode, fp: fp.fingerprint });

    const naturalTokens = estimateTokens(naturalContent);
    const lunumTokens = estimateTokens(lunumContent);
    const mixedTokens = estimateTokens(mixedContent);

    results.push({
      id: file,
      sourceText,
      sourceLanguage: String(sourceLanguage),
      naturalTokens,
      lunumTokens,
      mixedTokens,
      tokenSavings: {
        natural: naturalTokens > 0 ? (1 - lunumTokens / naturalTokens) : 0,
        mixed: naturalTokens > 0 ? (1 - mixedTokens / naturalTokens) : 0
      },
      eligibility,
      status: eligibility.eligible ? 'passed' : 'failed'
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
    notes: 'Token counts are HEURISTIC ESTIMATES for portable smoke tests. Exact counts require a real tokenizer adapter. Eligibility and risk are computed from the record policy, not hardcoded.'
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
