import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDataset } from './audit-training-pilot.mjs';

const row = (group, language, concept = 'concept-a') => ({
  id: `${group}-${language}`, split: 'train',
  source: { text: `The operator enables ${concept}.`, language, semanticGroup: group, templateFamily: `template-${group}`, difficultyLevel: 1, conceptIds: [concept], entityIds: ['operator'] },
  target: { outcome: 'parse', ir: { world: 'real', kind: 'instruction', predicate: 'enable', roles: { agent: { handle: `operator-${group}`, type: 'actor' }, theme: { handle: `${concept}-${group}`, type: 'concept' } }, grounding: { status: 'unresolved', handles: [concept] } }, criticalNegativePairIds: ['pair-1'] },
  provenance: { sourceKind: 'synthetic', annotationMethod: 'deterministic-template-v1', license: 'CC0-1.0', createdAt: '2026-09-06T00:00:00Z', generatorVersion: 'test/1' },
  review: { status: 'accepted', reviewers: ['deterministic-template-validator'] }
});

test('audit distinguishes deterministic validity from independent certification', () => {
  const languages = ['de', 'el', 'en', 'es', 'fr', 'id'];
  const report = auditDataset(languages.map((language) => row('group-a', language)));
  assert.equal(report.certification.deterministicContractValid, true);
  assert.equal(report.certification.independentSemanticReview, 'not-established');
  assert.equal(report.certification.trainingGoldEligible, false);
  assert.equal(report.independentReview.pendingIndependentReviewRows, 6);
});

test('audit rejects multilingual shape drift and negative-pair shape drift', () => {
  const languages = ['de', 'el', 'en', 'es', 'fr', 'id'];
  const rows = languages.map((language) => row('group-a', language));
  rows[0].target.ir.predicate = 'delete';
  const other = languages.map((language) => row('group-b', language, 'concept-b'));
  other[0].target.ir.predicate = 'delete';
  const report = auditDataset([...rows, ...other]);
  assert.equal(report.multilingualGroups.valid, 0);
  assert.equal(report.criticalNegativePairs.valid, 0);
});
