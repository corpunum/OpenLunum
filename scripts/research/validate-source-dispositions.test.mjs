import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSourceDispositions, validateSourceDispositionFiles } from './validate-source-dispositions.mjs';

const reviewPath = 'experiments/meaning-source-review-v1/review.json';
const review = JSON.parse(fs.readFileSync(reviewPath));
const probes = JSON.parse(fs.readFileSync(review.inputs.probes.path));
const targets = fs.readFileSync(review.inputs.targets.path, 'utf8').split('\n').filter(Boolean).map(JSON.parse);

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
