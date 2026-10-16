import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceOnlyPrompt, classify } from './run-openai-compatible-source-only.mjs';

const block = (file, start) => {
  const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const from = src.indexOf(start);
  return src.slice(src.indexOf('return [', from), src.indexOf("].join('\\n');", from));
};

test('prompt text is the Claude runner prompt, with only the parameter names changed', () => {
  const claude = block('./run-claude-code-source-only.mjs', 'function prompt(request)')
    .replace('path.basename(PACKAGE)', 'packageName').replace('pkg.conventions', 'conventions');
  const ours = block('./run-openai-compatible-source-only.mjs', 'export function sourceOnlyPrompt(');
  assert.equal(ours, claude);
});

test('prompt carries only handle, language and source', () => {
  const p = sourceOnlyPrompt({ handle: 'h1', sourceLanguage: 'en', sourceText: 'Hi there.', sourceSha256: 'x', contractHash: 'y' }, 'pkg.json', {}, 'PROFILE');
  assert.match(p, /"handle":"h1","sourceLanguage":"en","sourceText":"Hi there\."/u);
  assert.doesNotMatch(p, /sourceSha256|contractHash/u);
});

const pkg = { freeze: {} };
const request = { handle: 'h', sourceLanguage: 'en', sourceText: 'X.' };

test('abstention without a contract call is invalid (CONTRACT_UNBOUND), as in the Claude runner', () => {
  const row = classify({ request, calls: [], finalText: '{"status":"abstain","reason":"unsupported"}', failure: null, pkg, model: 'm', reportedModels: ['m'] });
  assert.equal(row.status, 'abstain');
  assert.equal(row.evidenceValid, false);
  assert.ok(row.evidenceFailures.includes('CONTRACT_UNBOUND'));
});

test('parse claimed without an accepted submission is a failure', () => {
  const row = classify({ request, calls: [], finalText: '{"status":"parse"}', failure: null, pkg, model: 'm', reportedModels: ['m'] });
  assert.equal(row.status, null);
  assert.ok(row.evidenceFailures.includes('parse_claimed_without_accepted_submission'));
});

test('a submission of a different source text and an unverified model are failures', () => {
  const calls = [{ name: 'lunum_submit_candidate', input: { sourceText: 'Y.', candidateSem: { clauses: [] } }, result: { success: true }, isError: false }];
  const row = classify({ request, calls, finalText: '{"status":"parse"}', failure: null, pkg, model: 'm', reportedModels: ['other'] });
  assert.ok(row.evidenceFailures.includes('SUBMITTED_SOURCE_MISMATCH'));
  assert.ok(row.evidenceFailures.includes('MODEL_UNVERIFIED'));
});

test('abstention after a submission core refused identity to is a valid abstention (pilot v1 runner bug)', () => {
  const contract = { name: 'lunum_get_extraction_contract', input: {}, result: { contract: {} }, isError: false };
  const refused = { name: 'lunum_submit_candidate', input: { sourceText: 'X.', candidateSem: { clauses: [] } }, result: { success: true, submission: { candidateIdentityAvailable: false } }, isError: false };
  const row = classify({ request, calls: [contract, refused], finalText: '{"status":"abstain","reason":"unresolved"}', failure: null, pkg, model: 'm', reportedModels: ['m'] });
  assert.equal(row.status, 'abstain');
  assert.ok(!row.evidenceFailures.includes('abstain_after_accepted_submission'));
  const canonical = { ...refused, result: { success: true, submission: { candidateIdentityAvailable: true } } };
  const bad = classify({ request, calls: [contract, canonical], finalText: '{"status":"abstain","reason":"unresolved"}', failure: null, pkg, model: 'm', reportedModels: ['m'] });
  assert.ok(bad.evidenceFailures.includes('ABSTAIN_AFTER_CANONICAL_SUBMISSION'));
});
