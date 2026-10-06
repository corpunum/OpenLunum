// Validates a RETURNED human source-meaning review against the pending packet
// experiments/meaning-human-review-packet-v1. It checks bindings, population,
// declared competence and the absence of model/target material. It does NOT
// judge whether the reviewer's meaning description is correct or complete.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './source-only-run-gates.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const PACKET_PATH = 'experiments/meaning-human-review-packet-v1/source-only.jsonl';
export const REVIEW_FORMAT = 'openlunum-human-source-review/0.1';
const COMPETENT = new Set(['native', 'fluent']);
// A review performed by a model on the owner's explicit delegation. It is a
// supported, honestly labelled mode: it never counts as human or native
// review, a model cannot declare native/fluent competence, and the report
// says the human-review criterion is not satisfied.
export const DELEGATED_MODEL_KIND = 'delegated-model';
const MODEL_COMPETENCE = 'model';
const ITEM_STATUSES = new Set(['reviewed', 'declined']);
// Fields that would carry previous model output, proposed Sem or expected
// outcomes into what must be an independent source-meaning review.
const FORBIDDEN_KEYS = new Set(['sem', 'goldSem', 'candidateSem', 'targetSem', 'representationOption', 'expectedOutcome',
  'originalExpectedOutcome', 'disposition', 'modelOutput', 'proposedSem']);
const PRIOR_STATUSES = new Set(['pending', 'reviewed', 'declined']);

const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const isStringArray = value => Array.isArray(value) && value.every(nonEmpty);

export function readPacket(raw) {
  return raw.toString('utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

function forbiddenKeyPath(value, trail = '') {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) { const hit = forbiddenKeyPath(entry, `${trail}[${index}]`); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${trail}.${key}`;
      const hit = forbiddenKeyPath(entry, `${trail}.${key}`); if (hit) return hit;
    }
  }
  return null;
}

/** Blank artifact pre-bound to the packet; a reviewer fills it in. */
export function reviewTemplate(packetRaw) {
  const packet = readPacket(packetRaw);
  return {
    format: REVIEW_FORMAT,
    packet: { path: PACKET_PATH, sha256: sha256(packetRaw) },
    reviewKind: 'human',
    modelAssisted: false,
    reviewer: { id: '', role: '', selfAttested: true, languages: [{ language: 'en', competence: '' }, { language: 'el', competence: '' }] },
    reviewedAt: '',
    items: packet.map(row => ({ id: row.id, language: row.language, sourceText: row.sourceText, sourceSha256: row.sourceSha256,
      reviewStatus: 'reviewed', meaningAtoms: [], ambiguities: [], explicitNamesAndLiterals: [], notes: '' })),
  };
}

export function validateHumanSourceReview(review, packetRaw, { now = new Date() } = {}) {
  const packet = readPacket(packetRaw);
  if (!packet.every(row => PRIOR_STATUSES.has(row.reviewStatus) && sha256(Buffer.from(row.sourceText, 'utf8')) === row.sourceSha256)) throw new Error('packet_source_hash_mismatch');
  if (review?.format !== REVIEW_FORMAT) throw new Error('review_format_mismatch');
  if (review.packet?.path !== PACKET_PATH || review.packet?.sha256 !== sha256(packetRaw)) throw new Error('review_packet_binding_mismatch');
  const delegated = review.reviewKind === DELEGATED_MODEL_KIND;
  if (review.reviewKind !== 'human' && !delegated) throw new Error('review_kind_not_human');
  if (!delegated && review.modelAssisted !== false) throw new Error('model_assisted_review_is_not_human_review');
  if (delegated && review.modelAssisted !== true) throw new Error('delegated_model_review_must_declare_model');
  const reviewer = review.reviewer;
  if (!nonEmpty(reviewer?.id) || !nonEmpty(reviewer?.role) || typeof reviewer?.selfAttested !== 'boolean' || !Array.isArray(reviewer?.languages)) throw new Error('reviewer_identity_missing');
  const competence = new Map();
  for (const entry of reviewer.languages) {
    if (!nonEmpty(entry?.language) || !nonEmpty(entry?.competence) || competence.has(entry.language)) throw new Error('reviewer_language_competence_invalid');
    competence.set(entry.language, entry.competence);
  }
  const reviewedAt = new Date(review.reviewedAt);
  if (!nonEmpty(review.reviewedAt) || Number.isNaN(reviewedAt.getTime()) || reviewedAt > now) throw new Error('reviewed_at_invalid');
  let delegation = null;
  if (delegated) {
    if (!nonEmpty(reviewer.model)) throw new Error('delegated_model_reviewer_model_missing');
    if (reviewer.selfAttested !== false) throw new Error('delegated_model_reviewer_cannot_self_attest');
    if ([...competence.values()].some(value => value !== MODEL_COMPETENCE)) throw new Error('delegated_model_reviewer_cannot_claim_human_competence');
    const d = review.delegation;
    const authorizedAt = new Date(d?.authorizedAt);
    if (!nonEmpty(d?.authorizedBy) || !nonEmpty(d?.authorization) || !nonEmpty(d?.scope) || !nonEmpty(d?.authorizedAt)
      || Number.isNaN(authorizedAt.getTime()) || authorizedAt > reviewedAt) throw new Error('delegation_record_invalid');
    delegation = { authorizedBy: d.authorizedBy, authorizedAt: d.authorizedAt, scope: d.scope };
  } else if (review.delegation !== undefined) throw new Error('human_review_must_not_carry_delegation');
  const forbidden = forbiddenKeyPath(review);
  if (forbidden) throw new Error(`review_contains_model_or_target_field:${forbidden}`);
  if (!Array.isArray(review.items)) throw new Error('review_population_mismatch');

  const bySource = new Map(packet.map(row => [row.id, row]));
  const seen = new Set();
  const languages = {};
  for (const item of review.items) {
    const source = bySource.get(item?.id);
    if (!source || seen.has(item.id)) throw new Error('review_population_mismatch');
    seen.add(item.id);
    if (item.language !== source.language || item.sourceSha256 !== source.sourceSha256) throw new Error(`review_source_binding_mismatch:${item.id}`);
    if (item.sourceText !== undefined && item.sourceText !== source.sourceText) throw new Error(`review_source_text_changed:${item.id}`);
    if (!ITEM_STATUSES.has(item.reviewStatus)) throw new Error(`review_item_status_invalid:${item.id}`);
    if (!isStringArray(item.meaningAtoms) || !isStringArray(item.ambiguities) || !isStringArray(item.explicitNamesAndLiterals) || typeof item.notes !== 'string') throw new Error(`review_item_shape_invalid:${item.id}`);
    const tally = languages[item.language] ??= { total: 0, reviewed: 0, declined: 0 };
    tally.total += 1;
    if (item.reviewStatus === 'declined') {
      if (!nonEmpty(item.notes)) throw new Error(`review_decline_reason_missing:${item.id}`);
      tally.declined += 1;
      continue;
    }
    if (delegated ? competence.get(item.language) !== MODEL_COMPETENCE : !COMPETENT.has(competence.get(item.language))) throw new Error(`reviewer_not_competent_for_language:${item.id}:${item.language}`);
    if (item.meaningAtoms.length === 0) throw new Error(`review_meaning_missing:${item.id}`);
    for (const literal of item.explicitNamesAndLiterals) {
      if (!source.sourceText.includes(literal)) throw new Error(`review_literal_not_in_source:${item.id}`);
    }
    tally.reviewed += 1;
  }
  if (seen.size !== bySource.size) throw new Error('review_population_mismatch');
  const languageCoverageComplete = Object.fromEntries(Object.entries(languages).map(([language, t]) => [language, t.reviewed === t.total]));
  return {
    format: 'openlunum-human-source-review-validation/0.1',
    providerCalls: 0,
    total: seen.size,
    languages,
    languageCoverageComplete,
    reviewKind: review.reviewKind,
    reviewer: { id: reviewer.id, role: reviewer.role, ...(delegated ? { model: reviewer.model } : {}), selfAttested: reviewer.selfAttested, languages: Object.fromEntries(competence) },
    reviewedAt: review.reviewedAt,
    humanReviewDeclared: !delegated,
    ...(delegated ? { delegation } : {}),
    humanReviewCriterionSatisfied: !delegated && Object.values(languageCoverageComplete).every(Boolean),
    goldPromoted: 0,
    historicalTargetsModified: 0,
    protected: false,
    completeness: 'NOT mechanically certified; bindings, competence declarations and literal presence are checked, not meaning correctness',
  };
}

export function validateHumanSourceReviewFile(reviewPath, options) {
  const reviewRaw = fs.readFileSync(reviewPath);
  const packetRaw = fs.readFileSync(path.join(root, PACKET_PATH));
  return { ...validateHumanSourceReview(JSON.parse(reviewRaw), packetRaw, options), reviewSha256: sha256(reviewRaw) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--template') {
    console.log(JSON.stringify(reviewTemplate(fs.readFileSync(path.join(root, PACKET_PATH))), null, 2));
  } else if (process.argv[2]) {
    const report = validateHumanSourceReviewFile(process.argv[2]);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error('usage: validate-human-source-review.mjs --template | <review.json> [report.json]');
    process.exit(2);
  }
}
