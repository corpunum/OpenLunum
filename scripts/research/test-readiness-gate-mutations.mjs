#!/usr/bin/env node
// Deliberate weakenings run only in generated copies of built code.
// No source file, existing process, frozen evidence, or owner work is modified.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Scratch copies must stay inside the checkout so module resolution reaches its
// node_modules. In a linked worktree `.git` is a file, so fall back to the
// ignored node_modules/.cache directory.
const dotGit = path.join(root, '.git');
const scratchBase = fs.statSync(dotGit).isDirectory() ? dotGit : path.join(root, 'node_modules', '.cache');
fs.mkdirSync(scratchBase, { recursive: true });
const out = fs.mkdtempSync(path.join(scratchBase, 'readiness-gate-mutations-'));
const cases = [
  { name: 'record-literal-identity-bypass', source: 'derive.js', test: 'record-source-containment.test.js', from: 'literalRetention?.retained !== false', to: 'true' },
  { name: 'recursive-risk-disabled', source: 'fallback-policy.js', test: 'canonical-risk-containment.test.js', from: 'export function isHighRisk(sem) {', to: "export function isHighRisk(sem) { return {highRisk:false,reasons:[]};" },
  { name: 'schema-valid-always-promoted', source: 'policy.js', test: 'semantic-trust.test.js', from: 'export function evaluateSemanticTrust(input) {', to: "export function evaluateSemanticTrust(input) { return {status:'promoted',confidence:1,promoted:true,requiresHumanReview:false,reasons:[]};" },
  { name: 'deletion-plan-validation-disabled', source: 'privacy-derived-lifecycle.js', test: 'privacy-derived-lifecycle.test.js', from: 'const canonicalPlan = this.validateDeletionPlan(plan);', to: 'const canonicalPlan = plan;' },
  { name: 'retrieval-routing-validation-disabled', package: 'eval', source: 'raw-text-retrieval.js', test: 'raw-text-retrieval.test.js', from: 'throw new TypeError(`query ${query.id} expected IDs must belong to the target language route`);', to: ';' },
  { name: 'retrieval-gold-leakage-validation-disabled', package: 'eval', source: 'raw-text-retrieval.js', test: 'raw-text-retrieval.test.js', from: 'function validateInputFields(record, label, allowed) {', to: 'function validateInputFields(record, label, allowed) { return;' },
  { name: 'served-runtime-closure-validation-disabled', package: 'research', source: 'source-only-run-gates.mjs', test: 'source-only-run-gates.test.mjs', from: 'export function validateServedRuntimeManifest(root, manifest) {', to: 'export function validateServedRuntimeManifest(root, manifest) { return { match: true, errors: [], artifactCount: manifest?.artifacts?.length ?? 0 };' },
  { name: 'gold-metadata-validation-disabled', package: 'eval', source: 'parse-experiment.js', test: 'gold-metadata-preflight.test.js', from: 'if (metadataErrors.length > 0) {', to: 'if (false) {' },
  { name: 'gold-source-literal-validation-disabled', package: 'eval', source: 'parse-experiment.js', test: 'gold-metadata-preflight.test.js', from: 'checkLiteralRetention(item.sourceText, normalization.sem)', to: '({ retained: true, sourceNumbers: [], sourceIdentifiers: [], missingNumbers: [], missingIdentifiers: [] })' },
  { name: 'exact-date-retention-disabled', source: 'literal-retention.js', test: 'date-literal-retention.test.js', from: 'const missingDates = sourceDates.filter((date) => !candidateDates.has(date));', to: 'const missingDates = [];' },
  { name: 'evidence-field-filter-disabled', source: 'literal-retention.js', test: 'date-literal-retention.test.js', from: 'for (const key of SEMANTIC_LITERAL_FIELDS) {', to: 'for (const key of Object.keys(term)) {' },
  { name: 'ambiguous-date-guessing-enabled', source: 'literal-retention.js', test: 'date-literal-retention.test.js', from: 'return day > 12 ? validIsoDate(year, month, day) : null;', to: 'return validIsoDate(year, month, day);' },
  { name: 'cross-field-month-date-composition-enabled', source: 'literal-retention.js', test: 'month-name-date-retention.test.js', from: 'const candidateDateParts = strings.map(separateDates);', to: "const candidateDateParts = [separateDates(strings.join(' '))];" },
  { name: 'modal-may-month-guessing-enabled', source: 'literal-retention.js', test: 'month-name-date-retention.test.js', from: "if (key === 'may' && word !== 'May' && word !== 'MAY')", to: 'if (false)' },
  { name: 'greek-month-first-order-enabled', source: 'literal-retention.js', test: 'month-name-date-retention.test.js', from: 'const month = monthNumber(word, period, true);', to: 'const month = monthNumber(word, period);' },
  { name: 'number-word-retention-disabled', source: 'literal-retention.js', test: 'relative-time-number-word-retention.test.js', from: 'return [...digits, ...numberWordPositions(withoutIds)]', to: 'return [...digits]' },
  { name: 'relative-time-retention-disabled', source: 'literal-retention.js', test: 'relative-time-number-word-retention.test.js', from: 'const missingRelativeTimes = sourceRelativeTimes.filter((token) => !candidateRelativeTimes.has(token));', to: 'const missingRelativeTimes = [];' },
  { name: 'discourse-record-literal-gate-disabled', source: 'discourse.js', test: 'discourse.test.js', from: 'const recordText = rendered && retainsLiterals(literals, rendered) && rendered.length < unit.text.length ? rendered : null;', to: 'const recordText = rendered;' },
  { name: 'inclusive-bound-predicates-unregistered', source: 'semantic-registry.js', test: 'inclusive-bound.test.js', from: "'at_most', 'at_least'", to: "'x_at_most', 'x_at_least'" },
  { name: 'deploy-target-requirement-dropped', source: 'frame-registry.js', test: 'frame-gaps.test.js', from: "atLeastOneOf: Object.freeze(['theme', 'destination']),", to: '' },
  { name: 'discourse-duplicate-dedup-disabled', source: 'discourse.js', test: 'discourse.test.js', from: 'if (seenKeys.has(a.key) || localKeys.has(a.key)) {', to: 'if (false) {' },
];
function run(directory, test, research = false) {
  const result = spawnSync(process.execPath, ['--test', path.join(directory, research ? 'scripts/research' : 'test', test)], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  return { status: result.status, signal: result.signal, error: result.error?.message ?? null, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
const results = [];
for (const mutation of cases) {
  const directory = path.join(out, mutation.name);
  const packageName = mutation.package ?? 'core';
  const research = packageName === 'research';
  if (research) {
    fs.mkdirSync(path.join(directory, 'scripts/research'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'packages'), { recursive: true });
    for (const file of [mutation.source, mutation.test, 'replay-client-events.mjs']) {
      fs.copyFileSync(path.join(root, 'scripts/research', file), path.join(directory, 'scripts/research', file));
    }
    fs.symlinkSync(path.join(root, 'packages/core'), path.join(directory, 'packages/core'), 'dir');
  } else {
    fs.mkdirSync(path.join(directory, 'test'), { recursive: true });
    fs.cpSync(path.join(root, 'packages', packageName, 'dist/src'), path.join(directory, 'src'), { recursive: true });
    fs.copyFileSync(path.join(root, 'packages', packageName, 'dist/test', mutation.test), path.join(directory, 'test', mutation.test));
    fs.symlinkSync(path.join(root, 'packages', packageName, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  }
  const clean = run(directory, mutation.test, research);
  if (clean.status !== 0) throw Error(`unmutated_fixture_failed:${mutation.name}:${clean.output}`);
  const file = path.join(directory, research ? 'scripts/research' : 'src', mutation.source);
  const text = fs.readFileSync(file, 'utf8');
  if (text.split(mutation.from).length !== 2) throw Error(`mutation_site_missing_or_ambiguous:${mutation.name}`);
  fs.writeFileSync(file, text.replace(mutation.from, mutation.to));
  const weakened = run(directory, mutation.test, research);
  const caught = weakened.status === 1 && !weakened.error && /# fail [1-9]\d*/u.test(weakened.output) && /ERR_ASSERTION/u.test(weakened.output) && !/ERR_MODULE_NOT_FOUND|SyntaxError|ENOENT/u.test(weakened.output);
  fs.writeFileSync(path.join(directory, 'unmutated.tap'), clean.output, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'weakened.tap'), weakened.output, { flag: 'wx' });
  results.push({ name: mutation.name, unmutatedExit: clean.status, weakenedExit: weakened.status, caught });
}
const report = { format: 'openlunum-readiness-gate-mutations/0.1', generatedAt: new Date().toISOString(), codeCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(), workingTreeClean: spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim() === '', evidence: 'Deterministic regression sensitivity, not model quality or deployed persistence.', providerCalls: 0, results, allCaught: results.every(row => row.caught) };
fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (!report.allCaught) process.exitCode = 1;
