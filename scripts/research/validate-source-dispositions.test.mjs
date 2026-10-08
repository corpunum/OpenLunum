import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { validateSourceDispositions, validateSourceDispositionFiles } from './validate-source-dispositions.mjs';

const reviewPath = 'experiments/meaning-source-review-v4/review.json';
const review = JSON.parse(fs.readFileSync(reviewPath));
const probes = JSON.parse(fs.readFileSync(review.inputs.probes.path));
const targets = fs.readFileSync(review.inputs.targets.path, 'utf8').split('\n').filter(Boolean).map(JSON.parse);

test('v4 is an additive 0.16 binding migration with byte-identical original review values', () => {
  const oldRaw = fs.readFileSync('experiments/meaning-source-review-v1/review.json');
  const previousRaw = fs.readFileSync('experiments/meaning-source-review-v3/review.json');
  const oldReview = JSON.parse(oldRaw);
  const previous = JSON.parse(previousRaw);
  assert.equal(createHash('sha256').update(oldRaw).digest('hex'), review.supersedes.originalReviewSha256);
  assert.equal(createHash('sha256').update(previousRaw).digest('hex'), review.supersedes.previousReviewSha256);
  assert.equal(review.supersedes.review, 'experiments/meaning-source-review-v3/review.json');
  // v3 itself stays the frozen 0.15 migration of v1.
  assert.equal(previous.supersedes.originalReviewSha256, review.supersedes.originalReviewSha256);
  assert.equal(previous.contract.agent, 'lunum-agent/0.15');
  for (const migratedFrom of [oldReview, previous]) {
    const migrated = structuredClone(review);
    delete migrated.supersedes;
    const base = structuredClone(migratedFrom);
    delete base.supersedes;
    migrated.contract.agent = base.contract.agent;
    assert.deepEqual(migrated, base);
  }
  assert.deepEqual(review.inputs, oldReview.inputs);
  assert.deepEqual(review.review, oldReview.review);
  assert.deepEqual(review.items, oldReview.items);
  assert.equal(review.contract.agent, 'lunum-agent/0.16');
  assert.equal(review.contract.protocol, oldReview.contract.protocol);
  assert.equal(review.contract.frames, oldReview.contract.frames);
  assert.equal(review.contract.identity, oldReview.contract.identity);
  for (const historical of ['v1', 'v2', 'v3']) {
    assert.throws(() => validateSourceDispositionFiles(`experiments/meaning-source-review-${historical}/review.json`), /review_contract_binding_mismatch/, historical);
  }
});

test('all14 historical unresolved targets stay unresolved; options pass current gates without promotion', () => {
  const report = validateSourceDispositionFiles(reviewPath);
  assert.equal(report.total, 14); assert.equal(report.historicalUnresolvedRetained, 14);
  assert.deepEqual(report.dispositionCounts, { ambiguous: 2, 'representation-option-pending-native-review': 2, unsupported: 10 });
  assert.equal(report.goldPromoted, 0);
  assert.equal(report.representationOptions.length, 2);
  assert.ok(report.representationOptions.every(row => row.identityValid && !row.promoted && row.confidence === 0));
});

test('review cannot rewrite original outcomes, remove cases, invent source atoms or certify native review', () => {
  const mutations = [
    r => { r.items.pop(); },
    r => { r.items[0].originalExpectedOutcome = 'abstain'; },
    r => { r.items[0].sourceText = 'Different source'; },
    r => { r.items[0].atoms[0].span = 'nonexistent-source-evidence'; },
    r => { r.review.nativeSpeaker = true; },
    r => { r.items[0].representationOption = r.items.find(row => row.representationOption).representationOption; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(review); mutate(bad); assert.throws(() => validateSourceDispositions(bad, probes, targets)); }
});

test('removing source digit or adding protocol/nested transport violations breaks option validity', () => {
  for (const mutate of [
    option => { option.clauses[0].conditions[0].roles.value.value = 50; },
    option => { option.clauses[0].predicate = 'invented_notify'; },
    option => { option.clauses[0].conditions[0].world = 'real'; },
  ]) {
    const bad = structuredClone(review); mutate(bad.items.find(row => row.probeId === 'g05').representationOption);
    assert.throws(() => validateSourceDispositions(bad, probes, targets));
  }
});
