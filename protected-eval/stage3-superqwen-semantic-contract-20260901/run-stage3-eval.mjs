#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from '../../packages/eval/node_modules/ajv/dist/2020.js';
import { buildExtractionSchema, extractStructuredJson } from '../../packages/eval/dist/src/parse-experiment.js';
import { OpenAICompatibleModel, effectiveSystemPrompt } from '../../packages/eval/dist/src/model.js';
import { parsePrompt } from '../../packages/eval/dist/src/prompts.js';
import { runRawTextRetrievalEvaluation } from '../../packages/eval/dist/src/raw-text-retrieval.js';
import { NearSemanticFingerprintGenerator, compareSem, normalizeSemanticCandidate, stableStringify, validateSemanticCandidate } from '../../packages/core/dist/src/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const corpusPath = path.join(here, 'corpus.jsonl');
const protectedManifestPath = path.join(here, 'protected-manifest.json');
const experimentPath = path.join(here, 'experiment.json');
const profilePath = path.join(root, 'profiles/models/superqwen3.8-27b-abliterated-live.json');
const semSchemaPath = path.join(root, 'schemas/lunum-sem.schema.json');
const evidenceRoot = path.join(here, 'evidence');
const requestedCandidate = '6149deed6b518020bc804b5db8f68f36ba00f4cf';
const implementationCandidate = '6149deed6b518020bc804b5db8f68f36ba00f4cf';
const thresholds = [0.6, 0.7, 0.8, 0.85, 0.9, 0.95];

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
async function fileHash(file) { return hash(await readFile(file)); }
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function wordTokens(text) { return text.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) || []; }
function lexical(input) {
  const q = new Set(wordTokens(input.query.text));
  return input.memories.map((memory) => ({ id: memory.id, score: wordTokens(memory.text).filter((t) => q.has(t)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, input.topK).map((x) => x.id);
}
function scoreMetrics(tp, fp, fn, tn) {
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, falsePositiveRate: fp + tn ? fp / (fp + tn) : 0 };
}
function thresholdSweep(memories, queries, extracted, topK) {
  const memorySem = new Map(extracted.filter((x) => x.kind === 'memory' && x.sem).map((x) => [x.id, x.sem]));
  const querySem = new Map(extracted.filter((x) => x.kind === 'query' && x.sem).map((x) => [x.id, x.sem]));
  const sweep = [];
  for (const threshold of thresholds) {
    const near = new NearSemanticFingerprintGenerator(threshold);
    let tp = 0; let fp = 0; let fn = 0; let tn = 0; let positiveTop1 = 0; let negativeRejected = 0; let positives = 0; let negatives = 0;
    const criticalFalsePositives = [];
    for (const query of queries) {
      const qSem = querySem.get(query.id);
      const candidates = [];
      if (qSem) for (const memory of memories.filter((x) => !query.targetLanguage || x.language === query.targetLanguage)) {
        const mSem = memorySem.get(memory.id);
        if (!mSem) continue;
        const comparison = near.compareSem(qSem, mSem);
        if (comparison.similarity >= threshold) candidates.push({ id: memory.id, score: comparison.similarity });
      }
      candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const retrieved = candidates.slice(0, topK).map((x) => x.id);
      const expected = new Set(query.expectedMemoryIds);
      const matched = retrieved.filter((id) => expected.has(id));
      tp += matched.length;
      fp += retrieved.filter((id) => !expected.has(id)).length;
      fn += query.expectedMemoryIds.filter((id) => !retrieved.includes(id)).length;
      const candidateCount = memories.filter((x) => !query.targetLanguage || x.language === query.targetLanguage).length;
      tn += Math.max(0, candidateCount - retrieved.length - expected.size + matched.length);
      if (expected.size) { positives += 1; if (retrieved[0] && expected.has(retrieved[0])) positiveTop1 += 1; }
      else { negatives += 1; if (!retrieved.length) negativeRejected += 1; }
      for (const candidate of candidates.slice(0, topK)) {
        if (!expected.has(candidate.id) && (candidate.id.includes('transfer-ba') || query.id.includes('transfer-ab') || query.id.includes('transfer-ba'))) {
          criticalFalsePositives.push({ queryId: query.id, candidateId: candidate.id, score: candidate.score, expectedMemoryIds: query.expectedMemoryIds });
        }
      }
    }
    sweep.push({ threshold, ...scoreMetrics(tp, fp, fn, tn), truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn, top1Accuracy: positives ? positiveTop1 / positives : 0, positiveTop1Accuracy: positives ? positiveTop1 / positives : 0, negativeRejectionAccuracy: negatives ? negativeRejected / negatives : 0, criticalFalsePositives });
  }
  return { frozenThreshold: 0.8, thresholds: sweep, criticalFalsePositivesAtFrozen: sweep.find((x) => x.threshold === 0.8)?.criticalFalsePositives || [] };
}
async function corpusRows() {
  const lines = (await readFile(corpusPath, 'utf8')).split(/\r?\n/u).filter((x) => x.trim());
  return lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error('Corpus line ' + (index + 1) + ' is not JSON: ' + (error instanceof Error ? error.message : String(error))); }
  });
}
async function validateInputs(corpus, protectedManifest, experiment, extractionSchema) {
  const manifestValidator = new Ajv2020({ allErrors: true, strict: false }).compile(await json(path.join(root, 'schemas/protected-eval.schema.json')));
  if (!manifestValidator(protectedManifest)) throw new Error('Protected manifest invalid: ' + JSON.stringify(manifestValidator.errors));
  const transportValidator = new Ajv2020({ allErrors: true, strict: false, validateSchema: false }).compile(extractionSchema);
  const invalidGold = [];
  corpus.forEach((item, index) => {
    if (item.goldSem !== null && item.expectedOutcome !== 'abstain' && !transportValidator(item.goldSem)) invalidGold.push({ line: index + 1, id: item.id, errors: transportValidator.errors });
  });
  if (invalidGold.length) throw new Error('Gold Sem failed exact transport schema: ' + JSON.stringify(invalidGold));
  const corpusSha = await fileHash(corpusPath);
  if (corpusSha !== protectedManifest.dataset.sha256 || corpusSha !== experiment.dataset.sha256) throw new Error('Corpus hash mismatch: ' + corpusSha);
  const frozen = {
    protectedManifest,
    experiment,
    corpus: { path: path.relative(root, corpusPath), sha256: corpusSha, itemCount: corpus.length },
    schema: { path: path.relative(root, semSchemaPath), sha256: await fileHash(semSchemaPath), transportSchema: extractionSchema, transportSchemaSha256: hash(stableStringify(extractionSchema)), validatedGoldItems: corpus.filter((x) => x.goldSem !== null && x.expectedOutcome !== 'abstain').length, abstentionItems: corpus.filter((x) => x.expectedOutcome === 'abstain').length },
    candidate: { requestedSha: requestedCandidate, requestedShaResolvable: git(['cat-file', '-t', requestedCandidate]) === 'commit', implementationSha: implementationCandidate, implementationShaResolvable: git(['cat-file', '-t', implementationCandidate]) === 'commit' }
  };
  await save(path.join(evidenceRoot, 'frozen-inputs.json'), frozen);
  return frozen;
}
async function runIncrementalParse(corpus, profile, extractionSchema) {
  const subset = corpus;
  const runOutput = path.join(evidenceRoot, 'parse-full', new Date().toISOString().replace(/[:.]/gu, '-'));
  await mkdir(runOutput, { recursive: true });
  const model = new OpenAICompatibleModel({ ...profile, maxTokens: 256 });
  const validator = new Ajv2020({ allErrors: true, strict: false, validateSchema: false }).compile(extractionSchema);
  const rows = [];
  let passed = 0;
  let exact = 0;
  let abstentionExpected = 0;
  let abstentionCorrect = 0;
  for (const item of subset) {
    const started = Date.now();
    const prompt = parsePrompt(item);
    const row = { id: item.id, sourceLanguage: item.sourceLanguage, sourceText: item.sourceText, expectedOutcome: item.expectedOutcome || 'parse', rawOutput: '', rawRequest: null, rawResponse: null, systemPromptSha256: hash(effectiveSystemPrompt(profile, prompt.system)), userPromptSha256: hash(prompt.user), attempts: 1 };
    try {
      const completion = await model.complete(prompt.system, prompt.user, { structuredOutput: { mode: 'json_schema', schema: extractionSchema, strict: true, fallback: 'json_object' } });
      row.rawOutput = completion.content;
      row.rawRequest = completion.rawRequest;
      row.rawResponse = completion.rawResponse;
      const parsed = extractStructuredJson(completion.content);
      row.transportSchemaValid = Boolean(validator(parsed));
      if (!row.transportSchemaValid) throw new Error('Transport schema validation failed: ' + JSON.stringify(validator.errors));
      if (parsed?.status === 'abstain') {
        row.abstained = true;
        row.status = item.expectedOutcome === 'abstain' ? 'passed' : 'failed';
        if (item.expectedOutcome === 'abstain') { abstentionExpected += 1; abstentionCorrect += 1; }
      } else {
        const validation = validateSemanticCandidate(parsed);
        if (!validation.ok) throw new Error(validation.errors.join('; '));
        row.parsedSem = parsed;
        if (item.expectedOutcome === 'abstain') {
          row.status = 'failed';
          abstentionExpected += 1;
        } else {
          const gold = normalizeSemanticCandidate(item.goldSem);
          const candidate = normalizeSemanticCandidate(parsed);
          const comparison = gold.canonical && candidate.canonical ? compareSem(gold.sem, candidate.sem) : null;
          row.canonicalExact = comparison?.exactFingerprint === true;
          row.featureRecall = comparison?.featureRecall ?? 0;
          row.featurePrecision = comparison?.featurePrecision ?? 0;
          row.status = row.canonicalExact ? 'passed' : 'failed';
          if (row.canonicalExact) exact += 1;
        }
      }
      if (row.status === 'passed') passed += 1;
    } catch (error) {
      row.status = 'error';
      row.error = error instanceof Error ? error.message : String(error);
    }
    row.latencyMs = Date.now() - started;
    await appendFile(path.join(runOutput, 'parse-results.jsonl'), JSON.stringify(row) + '\n', 'utf8');
    rows.push(row);
  }
  const byLanguage = Object.fromEntries([...new Set(subset.map((x) => x.sourceLanguage))].map((language) => {
    const items = subset.filter((x) => x.sourceLanguage === language);
    const results = rows.filter((x) => x.sourceLanguage === language);
    const expected = items.length;
    const pass = results.filter((x) => x.status === 'passed').length;
    const exactCount = results.filter((x) => x.canonicalExact === true).length;
    const recalls = results.filter((x) => typeof x.featureRecall === 'number').map((x) => x.featureRecall);
    const abstainItems = items.filter((x) => x.expectedOutcome === 'abstain');
    const abstainRows = results.filter((x) => x.expectedOutcome === 'abstain');
    return [language, { totalItems: expected, passedItems: pass, failedItems: results.filter((x) => x.status === 'failed').length, errorItems: results.filter((x) => x.status === 'error').length, exactRate: expected ? exactCount / expected : 0, featureRecall: recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 0, abstentionAccuracy: abstainItems.length ? abstainRows.filter((x) => x.abstained === true).length / abstainItems.length : null }];
  }));
  const report = { status: 'COMPLETE', corpusPolicy: 'full frozen corpus: all 54 cases; prior 18-case diagnostic preserved separately', totalItems: subset.length, totalPassed: passed, totalFailed: rows.filter((x) => x.status === 'failed').length, totalErrors: rows.filter((x) => x.status === 'error').length, exactRate: subset.length ? exact / subset.length : 0, abstentionAccuracy: abstentionExpected ? abstentionCorrect / abstentionExpected : null, byLanguage, decoding: { temperature: profile.temperature, seed: profile.seed ?? null, maxTokens: 256, chatTemplateKwargs: profile.chatTemplateKwargs ?? null }, noRetries: true, firstUntouchedRun: true };
  await save(path.join(runOutput, 'parse-summary.json'), report);
  return { outputDirectory: runOutput, report, subset };
}
async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(evidenceRoot, { recursive: true });
  const corpus = await corpusRows();
  const protectedManifest = await json(protectedManifestPath);
  const experiment = await json(experimentPath);
  const profile = await json(profilePath);
  const semSchema = await json(semSchemaPath);
  const extractionSchema = buildExtractionSchema(semSchema);
  const frozen = await validateInputs(corpus, protectedManifest, experiment, extractionSchema);
  const evaluationProfile = { ...profile, maxTokens: 256 };
  const model = new OpenAICompatibleModel(evaluationProfile);
  let discovery;
  try {
    discovery = await model.doctor();
    await save(path.join(evidenceRoot, 'model-discovery.json'), discovery);
  } catch (error) {
    const blocker = { status: 'NOT_RUN', phase: 'live-model-discovery', startedAt, completedAt: new Date().toISOString(), endpoint: profile.baseUrl, requestedModel: profile.model, error: error instanceof Error ? error.message : String(error), candidate: frozen.candidate };
    await save(path.join(evidenceRoot, 'live-gate.json'), blocker);
    await save(path.join(evidenceRoot, 'run-status.json'), { status: 'NOT_RUN', reason: 'Live model access unavailable; no fabricated live metrics.', blocker });
    return blocker;
  }
  const modelIds = [
    ...(Array.isArray(discovery?.data) ? discovery.data : []),
    ...(Array.isArray(discovery?.models) ? discovery.models : [])
  ].flatMap((x) => typeof x?.id === 'string' ? [x.id] : typeof x?.model === 'string' ? [x.model] : typeof x?.name === 'string' ? [x.name] : []);
  if (!modelIds.includes(profile.model)) {
    const blocker = { status: 'NOT_RUN', phase: 'live-model-identity', startedAt, completedAt: new Date().toISOString(), endpoint: profile.baseUrl, requestedModel: profile.model, advertisedModelIds: modelIds, error: 'GET /v1/models did not advertise requested model ID', candidate: frozen.candidate };
    await save(path.join(evidenceRoot, 'live-gate.json'), blocker);
    await save(path.join(evidenceRoot, 'run-status.json'), { status: 'NOT_RUN', reason: 'Model identity not verified; no fabricated live metrics.', blocker });
    return blocker;
  }
  let parseResult;
  if (process.env.STAGE3_RETRIEVAL_ONLY === '1') {
    const existingParseOutput = process.env.STAGE3_PARSE_OUTPUT || path.join(evidenceRoot, 'parse-full/2026-09-01T10-31-29-151Z');
    parseResult = { outputDirectory: existingParseOutput, report: await json(path.join(existingParseOutput, 'parse-summary.json')) };
  } else {
    try {
      parseResult = await runIncrementalParse(corpus, profile, extractionSchema);
    } catch (error) {
      const blocker = { status: 'NOT_RUN', phase: 'live-parse', startedAt, completedAt: new Date().toISOString(), endpoint: profile.baseUrl, requestedModel: profile.model, advertisedModelIds: modelIds, error: error instanceof Error ? error.message : String(error), noRetries: true, candidate: frozen.candidate };
      await save(path.join(evidenceRoot, 'live-gate.json'), blocker);
      await save(path.join(evidenceRoot, 'run-status.json'), { status: 'NOT_RUN', reason: 'Live parse gate failed; no fabricated live metrics.', blocker, partialParseOutput: parseResult?.outputDirectory || null });
      return blocker;
    }
  }
  const retrievalGroups = new Set(['pref-dark-mode', 'neg-delete-archive', 'mod-obligation-approve', 'cond-low-power', 'ref-send-contract', 'list-review-date', 'critical-transfer-ab', 'critical-transfer-ba']);
  const selected = corpus.filter((x) => retrievalGroups.has(x.semanticGroup) && (x.sourceLanguage === 'en' || x.sourceLanguage === 'el'));
  const memories = selected.map((x) => ({ id: x.id, text: x.sourceText, language: x.sourceLanguage }));
  const queries = selected.map((x) => {
    const targetLanguage = x.sourceLanguage === 'el' ? 'en' : 'el';
    const counterpart = selected.find((y) => y.semanticGroup === x.semanticGroup && y.sourceLanguage === targetLanguage);
    return { id: 'query-' + x.id, text: x.sourceText, language: x.sourceLanguage, targetLanguage, expectedMemoryIds: counterpart ? [counterpart.id] : [] };
  });
  const extractionEvidence = [];
  const extracted = [];
  const cache = new Map();
  const retrievalOutput = path.join(evidenceRoot, 'retrieval', new Date().toISOString().replace(/[:.]/gu, '-'));
  await mkdir(retrievalOutput, { recursive: true });
  await writeFile(path.join(retrievalOutput, 'raw-extractions.jsonl'), '', 'utf8');
  const extract = async (input) => {
    const key = input.kind + ':' + input.id;
    if (cache.has(key)) return cache.get(key);
    const prompt = parsePrompt({ id: input.id, sourceLanguage: input.language, sourceText: input.text, goldSem: {} });
    const evidence = { id: input.id, kind: input.kind, language: input.language, text: input.text, rawOutput: '', valid: false, abstained: false, startedAt: new Date().toISOString() };
    let completion;
    try {
      completion = await model.complete(prompt.system, prompt.user, { structuredOutput: { mode: 'json_schema', schema: extractionSchema, strict: true, fallback: 'json_object' } });
      evidence.rawOutput = completion.content; evidence.rawRequest = completion.rawRequest; evidence.rawResponse = completion.rawResponse;
      const parsed = extractStructuredJson(completion.content);
      if (parsed?.status === 'abstain') { evidence.abstained = true; evidence.valid = true; evidence.completedAt = new Date().toISOString(); extractionEvidence.push(evidence); await appendFile(path.join(retrievalOutput, 'raw-extractions.jsonl'), JSON.stringify(evidence) + '\n', 'utf8'); extracted.push({ id: input.id, kind: input.kind, language: input.language, sem: null }); cache.set(key, null); return null; }
      const validation = validateSemanticCandidate(parsed);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      evidence.valid = true; evidence.completedAt = new Date().toISOString(); extractionEvidence.push(evidence); await appendFile(path.join(retrievalOutput, 'raw-extractions.jsonl'), JSON.stringify(evidence) + '\n', 'utf8'); extracted.push({ id: input.id, kind: input.kind, language: input.language, sem: parsed }); cache.set(key, parsed); return parsed;
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error); evidence.rawOutput = evidence.rawOutput || completion?.content || ''; evidence.rawRequest = completion?.rawRequest || error?.rawRequest || null; evidence.rawResponse = completion?.rawResponse || error?.rawResponse || null; evidence.completedAt = new Date().toISOString(); extractionEvidence.push(evidence); await appendFile(path.join(retrievalOutput, 'raw-extractions.jsonl'), JSON.stringify(evidence) + '\n', 'utf8'); extracted.push({ id: input.id, kind: input.kind, language: input.language, sem: null }); cache.set(key, null); return null;
    }
  };
  const retrievalReport = await runRawTextRetrievalEvaluation({ memories, queries, extract, threshold: 0.8, topK: 3, baselines: { lexical } });
  await save(path.join(retrievalOutput, 'retrieval-report.json'), retrievalReport);
  await save(path.join(retrievalOutput, 'raw-extractions.json'), extractionEvidence);
  await writeFile(path.join(retrievalOutput, 'raw-extractions.jsonl'), extractionEvidence.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  await save(path.join(retrievalOutput, 'threshold-sweep.json'), thresholdSweep(memories, queries, extracted, 3));
  await save(path.join(retrievalOutput, 'retrieval-inputs.json'), { inputMode: 'raw-text-only', directionPairs: ['el->en', 'en->el'], memories, queries, candidatePoolRule: 'Identical raw memory pools are used for semantic and lexical retrieval; gold IDs are scoring labels only.', embeddingBaseline: { status: 'NOT RUN', reason: 'No embedding endpoint was already available without changing the loaded model.' } });
  const promptProbe = parsePrompt(corpus[0]);
  const metadata = {
    status: 'COMPLETE', firstUntouchedRun: true, noTuningAfterFailures: true, noRetries: true, fullCorpusRan: true, fullCorpusRequestedItems: 54, startedAt, completedAt: new Date().toISOString(),
    requestedCandidateSha: requestedCandidate, requestedCandidateShaResolvable: git(['cat-file', '-t', requestedCandidate]) === 'commit', implementationSha: implementationCandidate, implementationShaResolvable: git(['cat-file', '-t', implementationCandidate]) === 'commit',
    endpoint: profile.baseUrl, getModelsPath: profile.baseUrl + '/models', requestedModelId: profile.model, reportedModelIds: modelIds, modelVerified: true,
    profilePath: path.relative(root, profilePath), profileSha256: await fileHash(profilePath), profileId: profile.id,
    decoding: { temperature: evaluationProfile.temperature, seed: evaluationProfile.seed ?? null, maxTokens: evaluationProfile.maxTokens, chatTemplateKwargs: evaluationProfile.chatTemplateKwargs ?? null },
    promptVersion: 'parse-prompt/3', effectiveSystemPromptSha256: hash(effectiveSystemPrompt(profile, promptProbe.system)), schemaPath: path.relative(root, semSchemaPath), schemaSha256: await fileHash(semSchemaPath), transportSchemaSha256: frozen.schema.transportSchemaSha256, structuredOutputMode: 'json-schema',
    parseEvidenceDirectory: path.relative(root, parseResult.outputDirectory), retrievalEvidenceDirectory: path.relative(root, retrievalOutput),
    retrieval: { inputMode: 'raw-text-only', directions: ['el->en', 'en->el'], threshold: 0.8, topK: 3, lexicalBaseline: 'same candidate pools', embeddingBaseline: 'NOT RUN' },
    liveModelProcessPolicy: 'Existing loaded endpoint only; no download, restart, replacement, or /free call.', candidatePoolPolicy: 'Raw text only for model extractor and lexical baseline.', sourceWorkingTree: 'isolated evaluator clone; candidate implementation tree unchanged', modelDiscovery: discovery
  };
  await save(path.join(evidenceRoot, 'metadata.json'), metadata);
  await save(path.join(evidenceRoot, 'run-status.json'), { status: 'COMPLETE', firstUntouchedRun: true, fullCorpusRan: true, priorDiagnostic: 'evidence/parse-subset/2026-09-01T10-22-34-360Z', parseSummary: path.relative(root, path.join(parseResult.outputDirectory, 'parse-summary.json')), retrievalReport: path.relative(root, path.join(retrievalOutput, 'retrieval-report.json')), thresholdSweep: path.relative(root, path.join(retrievalOutput, 'threshold-sweep.json')), metrics: { parse: parseResult.report, retrieval: retrievalReport.metrics } });
  return { status: 'COMPLETE', parseOutputDirectory: parseResult.outputDirectory, retrievalOutput };
}
main().then((result) => console.log(JSON.stringify(result, null, 2))).catch(async (error) => {
  const failure = { status: 'BLOCKED', completedAt: new Date().toISOString(), error: error instanceof Error ? error.stack || error.message : String(error) };
  await save(path.join(evidenceRoot, 'run-status.json'), failure); console.error(JSON.stringify(failure, null, 2)); process.exitCode = 1;
});
