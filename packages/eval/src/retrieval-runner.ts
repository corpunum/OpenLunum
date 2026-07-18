import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson } from './io.js';
import type { ExperimentManifest, ItemResult } from './types.js';

export interface RetrievalFixture {
  queryId: string;
  query: string;
  candidates: string[];
  expectedRelevant: string[];
  rankedResults: string[];
  mode: 'exact' | 'near-semantic';
  falseEquivalenceIds?: string[];
}

export interface RetrievalManifest extends ExperimentManifest {
  task: 'retrieval';
  retrievalConfig?: {
    k?: number;
    mode?: 'exact' | 'near-semantic';
  };
}

export interface RetrievalItemResult extends ItemResult {
  queryId: string;
  candidateIds: string[];
  expectedRelevantIds: string[];
  rankedResultIds: string[];
  mode: 'exact' | 'near-semantic';
  precisionAtK: number;
  recallAtK: number;
  reciprocalRank: number;
  meanReciprocalRank: number;
  falsePositives: string[];
  falseNegatives: string[];
  hasFalseEquivalence: boolean;
  isNearSemantic: boolean;
}

function precisionAtK(results: string[], expected: string[]): number {
  if (results.length === 0) return 0;
  const relevant = results.filter(id => expected.includes(id)).length;
  return relevant / results.length;
}

function recallAtK(results: string[], expected: string[]): number {
  if (expected.length === 0) return 1;
  const relevant = results.filter(id => expected.includes(id)).length;
  return relevant / expected.length;
}

function reciprocalRank(results: string[], expected: string[]): number {
  const idx = results.findIndex(id => expected.includes(id));
  if (idx === -1) return 0;
  return 1 / (idx + 1);
}

function computeMRR(results: RetrievalItemResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.reciprocalRank, 0);
  return sum / results.length;
}

export async function runRetrievalExperiment(
  manifest: RetrievalManifest,
  root: string,
  outputDir: string
): Promise<RetrievalItemResult[]> {
  if (!manifest.retrievalConfig) {
    throw new Error('Missing retrievalConfig in manifest');
  }

  const k = manifest.retrievalConfig.k ?? 3;
  if (k <= 0) {
    throw new Error(`Invalid k value: ${k}`);
  }

  const fixtureDir = path.join(root, 'packages', 'eval', 'test-fixtures', 'retrieval', 'fixtures');
  const entries = await readdir(fixtureDir);
  const fixtureFiles = entries.filter(f => f.endsWith('.json')).sort();

  if (fixtureFiles.length === 0) {
    throw new Error('No retrieval fixtures found in ' + fixtureDir);
  }

  const results: RetrievalItemResult[] = [];

  // Respect limits.maxItems
  const maxItems = manifest.limits.maxItems ?? fixtureFiles.length;
  const toProcess = fixtureFiles.slice(0, maxItems);

  for (const file of toProcess) {
    const fixturePath = path.join(fixtureDir, file);
    const fixture: RetrievalFixture = await readJson(fixturePath);

    // Validate fixture structure
    if (!fixture.queryId || typeof fixture.queryId !== 'string' || fixture.queryId.trim() === '') {
      throw new Error(`Fixture ${file}: queryId must be a non-empty string`);
    }
    if (!fixture.query || typeof fixture.query !== 'string' || fixture.query.trim() === '') {
      throw new Error(`Fixture ${file}: query must be a non-empty string`);
    }
    if (!Array.isArray(fixture.candidates) || fixture.candidates.length === 0) {
      throw new Error(`Fixture ${file}: candidates must be a non-empty array`);
    }
    if (!Array.isArray(fixture.expectedRelevant)) {
      throw new Error(`Fixture ${file}: expectedRelevant must be an array`);
    }
    // Fail-closed: reject empty expected set
    if (fixture.expectedRelevant.length === 0) {
      throw new Error(`Fixture ${file}: expectedRelevant must not be empty`);
    }
    if (!Array.isArray(fixture.rankedResults)) {
      throw new Error(`Fixture ${file}: rankedResults must be an array`);
    }

    // Check for duplicate IDs in candidates
    const candidateSet = new Set(fixture.candidates);
    if (candidateSet.size !== fixture.candidates.length) {
      throw new Error(`Fixture ${file}: duplicate IDs in candidates`);
    }

    // Check for duplicate IDs in rankedResults
    const rankedSet = new Set(fixture.rankedResults);
    if (rankedSet.size !== fixture.rankedResults.length) {
      throw new Error(`Fixture ${file}: duplicate IDs in rankedResults`);
    }

    // Check for empty IDs
    for (const id of [...fixture.candidates, ...fixture.rankedResults]) {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new Error(`Fixture ${file}: empty ID found`);
      }
    }

    // Validate ranked results are subset of candidates
    const unknownCandidates = fixture.rankedResults.filter(id => !candidateSet.has(id));
    if (unknownCandidates.length > 0) {
      throw new Error(`Fixture ${file}: ranked results contain unknown candidates: ${unknownCandidates.join(', ')}`);
    }

    // Validate expected relevant are in candidates
    const unknownExpected = fixture.expectedRelevant.filter(id => !candidateSet.has(id));
    if (unknownExpected.length > 0) {
      throw new Error(`Fixture ${file}: expected relevant not in candidates: ${unknownExpected.join(', ')}`);
    }

    // Slice to top-k
    const topK = fixture.rankedResults.slice(0, k);

    // Compute metrics
    const prec = precisionAtK(topK, fixture.expectedRelevant);
    const rec = recallAtK(topK, fixture.expectedRelevant);
    const rr = reciprocalRank(topK, fixture.expectedRelevant);
    const fps = topK.filter(id => !fixture.expectedRelevant.includes(id));
    const fns = fixture.expectedRelevant.filter(id => !topK.includes(id));
    const falseEqIds = fixture.falseEquivalenceIds ?? [];
    const hasFalseEq = falseEqIds.some(id => topK.includes(id));

    // Use manifest gates instead of hard-coded 0.5
    const minRecall = manifest.gates.minimumFeatureRecall ?? 0.5;
    const minExact = manifest.gates.minimumExactRate ?? 0.5;
    const passed = prec >= minExact && rec >= minRecall;

    const result: RetrievalItemResult = {
      id: fixture.queryId,
      status: passed ? 'passed' : 'failed',
      rawOutput: JSON.stringify({ query: fixture.query, topK, expected: fixture.expectedRelevant }),
      queryId: fixture.queryId,
      candidateIds: fixture.candidates,
      expectedRelevantIds: fixture.expectedRelevant,
      rankedResultIds: topK,
      mode: manifest.retrievalConfig.mode ?? fixture.mode,
      exact: passed,
      featurePrecision: prec,
      featureRecall: rec,
      precisionAtK: prec,
      recallAtK: rec,
      reciprocalRank: rr,
      meanReciprocalRank: rr,
      falsePositives: fps,
      falseNegatives: fns,
      hasFalseEquivalence: hasFalseEq,
      isNearSemantic: (manifest.retrievalConfig.mode ?? fixture.mode) === 'near-semantic',
      latencyMs: 0
    };

    results.push(result);
  }

  // Compute aggregate MRR
  const mrr = computeMRR(results);

  // Write per-fixture results
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const resultsPath = path.join(outputDir, 'retrieval-results.json');
    await writeFile(resultsPath, JSON.stringify({
      results,
      aggregateMetrics: { meanReciprocalRank: mrr, items: results.length }
    }, null, 2));
  }

  return results;
}
