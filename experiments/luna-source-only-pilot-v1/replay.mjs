// Offline replay of three actual model responses, not a new provider run.
// Run after pnpm build. Output is JSON on stdout; frozen artifacts are not edited.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const { buildCandidateSem, submitCandidate } = await import(pathToFileURL(path.join(root, 'packages/core/dist/src/index.js')));
const { runRawTextRetrievalEvaluation } = await import(pathToFileURL(path.join(root, 'packages/eval/dist/src/raw-text-retrieval.js')));
const rows = ['', '-2', '-3'].map(suffix => {
  const requestBytes = fs.readFileSync(path.join(directory, `request${suffix}.json`));
  const request = JSON.parse(requestBytes);
  const result = JSON.parse(fs.readFileSync(path.join(directory, `result${suffix}.json`), 'utf8'));
  if (hash(requestBytes) !== result.requestSha256 || hash(request.prompt) !== result.promptSha256 ||
      hash(request.source.sourceText) !== result.sourceSha256 || hash(result.rawResponse) !== result.rawResponseSha256 ||
      JSON.stringify(JSON.parse(result.rawResponse)) !== JSON.stringify(result.output) ||
      request.source.sourceText !== result.source.sourceText || request.source.sourceLanguage !== result.source.sourceLanguage ||
      result.model !== 'gpt-6-luna' || result.session.contexts.some(context => context.model !== result.model) ||
      result.session.toolCalls.length !== 0 || !result.session.userPromptObserved || !result.session.completed) {
    throw Error(`pilot_receipt_mismatch:${suffix}`);
  }
  return { request, result };
});
const bySource = new Map(rows.map(row => [hash(`${row.request.source.sourceLanguage}\n${row.request.source.sourceText}`), row]));
const extract = ({ text, language }) => {
  const row = bySource.get(hash(`${language}\n${text}`));
  if (!row) throw Error('raw_source_has_no_model_receipt');
  const response = JSON.parse(row.result.rawResponse);
  return response.status === 'parse' ? buildCandidateSem(response.builderInput).sem : null;
};
const source = index => ({ text: rows[index].request.source.sourceText, language: rows[index].request.source.sourceLanguage });
const memories = [{ id: 'memory-en', ...source(0) }, { id: 'memory-el', ...source(1) }];
const queries = [
  { id: 'query-el-en', ...source(1), targetLanguage: 'en', expectedMemoryIds: ['memory-en'], semanticEquivalentMemoryIds: ['memory-en', 'memory-el'] },
  { id: 'query-en-el', ...source(0), targetLanguage: 'el', expectedMemoryIds: ['memory-el'], semanticEquivalentMemoryIds: ['memory-en', 'memory-el'] },
  { id: 'query-role-swap', ...source(2), targetLanguage: 'en', expectedMemoryIds: [], semanticEquivalentMemoryIds: [] },
];
// A deliberately simple lexical baseline, not BM25 or an embedding proxy.
const tokens = text => new Set(text.toLocaleLowerCase('und').normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []);
const lexical = ({ query, memories, topK }) => {
  const q = tokens(query.text);
  return memories.map(memory => {
    const m = tokens(memory.text);
    const intersection = [...q].filter(token => m.has(token)).length;
    return { id: memory.id, score: intersection / (q.size + m.size - intersection || 1) };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, topK).map(row => row.id);
};
const submissions = rows.map(row => submitCandidate({
  sourceText: row.request.source.sourceText,
  sourceLanguage: row.request.source.sourceLanguage,
  candidateSem: extract({ text: row.request.source.sourceText, language: row.request.source.sourceLanguage }),
  provenance: row.result.submission.provenance,
}));
const exact = await runRawTextRetrievalEvaluation({ memories, queries, extract, mode: 'exact', topK: 1, baselines: { lexicalTokenJaccard: lexical } });
const near = await runRawTextRetrievalEvaluation({ memories, queries, extract, mode: 'near-semantic', threshold: 0.8, topK: 1 });
const bindings = [];
for (const relative of ['packages/core/dist/src', 'packages/eval/dist/src']) {
  const visit = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.js')) bindings.push({ file: path.relative(root, file), sha256: hash(fs.readFileSync(file)) });
    }
  };
  visit(path.join(root, relative));
}
console.log(JSON.stringify({
  format: 'openlunum-luna-development-response-replay/0.1',
  replayedAt: new Date().toISOString(),
  replayImplementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  replayWorkingTreeClean: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() === '',
  runtimeBindingsSha256: hash(JSON.stringify(bindings)), runtimeBindings: bindings,
  scriptSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  protected: false, humanReviewed: false, providerCallsDuringReplay: 0,
  actualEarlierModelCalls: 3, model: rows[0].result.model,
  tokens: rows.reduce((total, row) => {
    for (const [key, value] of Object.entries(row.result.tokenUsage)) total[key] = (total[key] ?? 0) + value;
    return total;
  }, {}),
  costUsd: null,
  sourceCorpusSha256: hash(JSON.stringify(rows.map(row => row.request.source))),
  sources: rows.map(row => ({ source: row.request.source, requestSha256: row.result.requestSha256, responseSha256: row.result.rawResponseSha256 })),
  candidateSubmissions: submissions,
  observations: {
    identityAvailable: submissions.filter(row => row.candidateIdentityAvailable).length,
    promoted: submissions.filter(row => row.promotable).length,
    englishGreekExactIdentityConverges: submissions[0].candidateIdentityAvailable && submissions[1].candidateIdentityAvailable && submissions[0].semanticFingerprint === submissions[1].semanticFingerprint,
    reversedRolesHaveDistinctIdentity: submissions[0].candidateIdentityAvailable && submissions[2].candidateIdentityAvailable && submissions[0].semanticFingerprint !== submissions[2].semanticFingerprint,
  },
  exact, near,
  embeddingBaseline: 'NOT RUN', thresholdCalibration: 'NOT RUN',
  nonClaims: [
    'One simple bilingual meaning and one role mutation, authored by the implementer. Not protected/generalization evidence.',
    'Raw-source replay consumes captured real-model builder responses; it does not call a model anew or supply gold Sem.',
    'Initial calls occurred on a dirty development tree. Partial v14 artifact bindings do not bind the entire original runtime closure.',
    'Actual session model identity is recorded, but immutable weights, HTTP endpoint, seed, temperature and dollar cost are unavailable.',
    'No embedding comparison, threshold calibration, deployed trust/persistence, compaction or OpenUnum integration is demonstrated.',
  ],
}, null, 2));
