import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PACKET_PATH, readPacket, reviewTemplate, validateHumanSourceReview } from './validate-human-source-review.mjs';
import { sha256 } from './source-only-run-gates.mjs';

const packetRaw = fs.readFileSync(PACKET_PATH);
const packet = readPacket(packetRaw);
const now = new Date('2026-10-06T12:00:00Z');

// Synthetic fill-in used only to exercise the validator. It is not a review.
function filled() {
  const review = reviewTemplate(packetRaw);
  review.reviewer = { id: 'test-reviewer', role: 'synthetic test fixture', selfAttested: true,
    languages: [{ language: 'en', competence: 'fluent' }, { language: 'el', competence: 'native' }] };
  review.reviewedAt = '2026-10-05T10:00:00Z';
  for (const item of review.items) item.meaningAtoms = ['synthetic atom'];
  return review;
}
const rejects = (mutate, pattern) => {
  const review = filled(); mutate(review);
  assert.throws(() => validateHumanSourceReview(review, packetRaw, { now }), pattern);
};

test('pending packet is unchanged and every source hash binds its text', () => {
  assert.equal(packet.length, 14);
  assert.ok(packet.every(row => row.reviewStatus === 'pending' && sha256(Buffer.from(row.sourceText, 'utf8')) === row.sourceSha256));
});

test('template binds the packet, carries no targets and is not itself a valid review', () => {
  const template = reviewTemplate(packetRaw);
  assert.equal(template.packet.sha256, sha256(packetRaw));
  assert.deepEqual(template.items.map(row => row.id), packet.map(row => row.id));
  assert.throws(() => validateHumanSourceReview(template, packetRaw, { now }), /reviewer_identity_missing/);
});

test('complete synthetic review validates and reports per-language coverage without promoting gold', () => {
  const report = validateHumanSourceReview(filled(), packetRaw, { now });
  assert.equal(report.total, 14);
  assert.equal(report.providerCalls, 0);
  assert.equal(report.goldPromoted, 0);
  assert.equal(report.protected, false);
  assert.deepEqual(report.languageCoverageComplete, { en: true, el: true });
});

test('declined items need a reason and leave language coverage incomplete', () => {
  rejects(review => { review.items.find(row => row.language === 'el').reviewStatus = 'declined'; }, /review_decline_reason_missing/);
  const review = filled();
  const greek = review.items.find(row => row.language === 'el');
  greek.reviewStatus = 'declined'; greek.notes = 'not confident about this construction';
  assert.equal(validateHumanSourceReview(review, packetRaw, { now }).languageCoverageComplete.el, false);
});

test('Greek or English review requires declared fluent or native competence', () => {
  rejects(review => { review.reviewer.languages = [{ language: 'en', competence: 'native' }]; }, /reviewer_not_competent_for_language:g/);
  rejects(review => { review.reviewer.languages[1].competence = 'basic'; }, /reviewer_not_competent_for_language:g/);
});

test('model-assisted or non-human artifacts are not accepted as human review', () => {
  rejects(review => { review.modelAssisted = true; }, /model_assisted_review_is_not_human_review/);
  rejects(review => { delete review.modelAssisted; }, /model_assisted_review_is_not_human_review/);
  rejects(review => { review.reviewKind = 'agent'; }, /review_kind_not_human/);
});

test('model output, proposed Sem or expected outcomes are rejected anywhere in the artifact', () => {
  rejects(review => { review.items[0].goldSem = {}; }, /review_contains_model_or_target_field:\.items\[0\]\.goldSem/);
  rejects(review => { review.items[3].expectedOutcome = 'parse'; }, /review_contains_model_or_target_field/);
  rejects(review => { review.extra = { candidateSem: {} }; }, /review_contains_model_or_target_field:\.extra\.candidateSem/);
});

test('population, source bindings and packet binding are exact', () => {
  rejects(review => { review.items.pop(); }, /review_population_mismatch/);
  rejects(review => { review.items.push(structuredClone(review.items[0])); }, /review_population_mismatch/);
  rejects(review => { review.items[0].sourceSha256 = '0'.repeat(64); }, /review_source_binding_mismatch/);
  rejects(review => { review.items[0].language = 'el'; }, /review_source_binding_mismatch/);
  rejects(review => { review.items[0].sourceText += ' '; }, /review_source_text_changed/);
  rejects(review => { review.packet.sha256 = '0'.repeat(64); }, /review_packet_binding_mismatch/);
  assert.throws(() => validateHumanSourceReview(filled(), Buffer.concat([packetRaw, Buffer.from('\n')]), { now }), /review_packet_binding_mismatch/);
});

test('reviewed items need meaning, source-present literals and a past timestamp', () => {
  rejects(review => { review.items[0].meaningAtoms = []; }, /review_meaning_missing/);
  rejects(review => { review.items[0].meaningAtoms = ['  ']; }, /review_item_shape_invalid/);
  rejects(review => { review.items[0].explicitNamesAndLiterals = ['NotInSource-999']; }, /review_literal_not_in_source/);
  rejects(review => { review.reviewedAt = '2027-01-01T00:00:00Z'; }, /reviewed_at_invalid/);
  rejects(review => { review.reviewedAt = 'yesterday'; }, /reviewed_at_invalid/);
  const review = filled();
  review.items[0].explicitNamesAndLiterals = ['Priya', '30 November 2026'];
  assert.equal(validateHumanSourceReview(review, packetRaw, { now }).total, 14);
});

// Owner-delegated model review: supported, but never reported as human review.
function delegatedFilled() {
  const review = filled();
  review.reviewKind = 'delegated-model';
  review.modelAssisted = true;
  review.reviewer = { id: 'synthetic-model', role: 'synthetic delegated reviewer', model: 'synthetic-model-1', selfAttested: false,
    languages: [{ language: 'en', competence: 'model' }, { language: 'el', competence: 'model' }] };
  review.delegation = { authorizedBy: 'synthetic-owner', authorizedAt: '2026-10-05T09:00:00Z',
    authorization: 'synthetic delegation text', scope: 'synthetic scope' };
  return review;
}
const rejectsDelegated = (mutate, pattern) => {
  const review = delegatedFilled(); mutate(review);
  assert.throws(() => validateHumanSourceReview(review, packetRaw, { now }), pattern);
};

test('delegated model review validates but is never reported as human review', () => {
  const report = validateHumanSourceReview(delegatedFilled(), packetRaw, { now });
  assert.equal(report.reviewKind, 'delegated-model');
  assert.equal(report.humanReviewDeclared, false);
  assert.equal(report.humanReviewCriterionSatisfied, false);
  assert.equal(report.reviewer.model, 'synthetic-model-1');
  assert.deepEqual(report.languageCoverageComplete, { en: true, el: true });
  assert.equal(report.delegation.authorizedBy, 'synthetic-owner');
  assert.equal(validateHumanSourceReview(filled(), packetRaw, { now }).humanReviewCriterionSatisfied, true);
});

test('delegated model review must declare the model, the delegation and no human competence', () => {
  rejectsDelegated(review => { review.modelAssisted = false; }, /delegated_model_review_must_declare_model/);
  rejectsDelegated(review => { delete review.reviewer.model; }, /delegated_model_reviewer_model_missing/);
  rejectsDelegated(review => { review.reviewer.selfAttested = true; }, /delegated_model_reviewer_cannot_self_attest/);
  rejectsDelegated(review => { review.reviewer.languages[1].competence = 'native'; }, /delegated_model_reviewer_cannot_claim_human_competence/);
  rejectsDelegated(review => { delete review.delegation; }, /delegation_record_invalid/);
  rejectsDelegated(review => { review.delegation.authorizedAt = '2026-10-05T11:00:00Z'; }, /delegation_record_invalid/);
  rejectsDelegated(review => { review.delegation.authorization = ''; }, /delegation_record_invalid/);
  rejects(review => { review.delegation = { authorizedBy: 'x' }; }, /human_review_must_not_carry_delegation/);
});
