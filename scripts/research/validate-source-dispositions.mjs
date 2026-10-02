// Lints source binding and representation options, NOT natural-language completeness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExtractionContract, submitCandidate } from '../../packages/core/dist/src/index.js';
import { buildExtractionSchema, validateEvaluationGold } from '../../packages/eval/dist/src/parse-experiment.js';
import { sha256 } from './source-only-run-gates.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const schema = buildExtractionSchema(JSON.parse(fs.readFileSync(path.join(root, 'schemas/lunum-sem.schema.json'))));

export function validateSourceDispositions(review, probes, targets) {
  const contract = getExtractionContract();
  const current = { agent: contract.contractVersion, protocol: contract.protocol.version, frames: contract.frames.version, identity: contract.identity.version };
  if (JSON.stringify(review.contract) !== JSON.stringify(current)) throw new Error('review_contract_binding_mismatch');
  if (review.format !== 'openlunum-source-disposition-review/0.1' || review.status !== 'post-hoc-diagnostic-not-protected'
    || review.review?.human !== false || review.review?.nativeSpeaker !== false || review.review?.independentProtectedReview !== false || review.review?.newProviderCalls !== 0) throw new Error('review_certification_mismatch');
  const unresolved = new Map(targets.filter(row => row.reviewStatus === 'unresolved').map(row => [row.probeId, row]));
  const source = new Map(probes.map(row => [row.handle, row]));
  const seen = new Set();
  const options = [];
  for (const item of review.items) {
    const old = unresolved.get(item.probeId); const probe = source.get(item.probeId);
    if (!old || !probe || seen.has(item.probeId)) throw new Error('review_population_mismatch');
    seen.add(item.probeId);
    if (item.sourceText !== probe.text || item.sourceText !== old.sourceText || item.language !== probe.language
      || item.language !== old.language || item.originalExpectedOutcome !== probe.expectedOutcome || item.originalExpectedOutcome !== old.expectedOutcome) throw new Error(`review_source_metadata_mismatch:${item.probeId}`);
    if (!item.reason?.trim() || !item.contractBasis?.length || !item.atoms?.length) throw new Error(`review_evidence_missing:${item.probeId}`);
    for (const atom of item.atoms) if (!atom.dimension?.trim() || !atom.span?.trim() || !item.sourceText.includes(atom.span)) throw new Error(`review_atom_not_source_bound:${item.probeId}`);
    if (!['unsupported', 'ambiguous', 'representation-option-pending-native-review'].includes(item.disposition)) throw new Error('unknown_review_disposition');
    if ((item.disposition === 'representation-option-pending-native-review') !== (item.representationOption !== null)) throw new Error('review_option_disposition_mismatch');
    if (item.representationOption !== null) {
      const validation = validateEvaluationGold([{ id: item.probeId, sourceText: item.sourceText, sourceLanguage: item.language,
        expectedOutcome: 'parse', goldSem: item.representationOption }], schema);
      if (validation.invalid.length || validation.identityValid !== 1) throw new Error(`invalid_review_option:${item.probeId}`);
      const submission = submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.language, candidateSem: item.representationOption,
        provenance: { extractorType: 'agent' } });
      if (!submission.candidateIdentityAvailable || !submission.literalRetention?.retained || submission.trust.promoted || submission.promotable || submission.trust.confidence !== 0) throw new Error(`unsafe_review_option:${item.probeId}`);
      options.push({ probeId: item.probeId, transportValid: submission.transportValid, structuralValid: submission.structuralValid,
        protocolCanonical: submission.protocolCanonical, frameValid: submission.frameValid, identityValid: submission.candidateIdentityAvailable,
        literalRetention: submission.literalRetention, promoted: submission.trust.promoted, confidence: submission.trust.confidence,
        identityScope: 'source-relative candidate only; not cross-language grounded identity or semantic correctness' });
    }
  }
  if (seen.size !== unresolved.size) throw new Error('review_population_mismatch');
  return { format: 'openlunum-source-disposition-validation/0.1', providerCalls: 0, total: seen.size,
    dispositionCounts: Object.fromEntries([...new Set(review.items.map(row => row.disposition))].sort().map(d => [d, review.items.filter(row => row.disposition === d).length])),
    representationOptions: options, historicalTargetsModified: 0, historicalUnresolvedRetained: unresolved.size,
    goldPromoted: 0, protected: false, humanReviewed: false, nativeSpeakerReviewed: false,
    completeness: 'NOT mechanically certified; atom spans and source hashes are bindings, not meaning judgments' };
}

export function validateSourceDispositionFiles(reviewPath) {
  const reviewRaw = fs.readFileSync(reviewPath); const review = JSON.parse(reviewRaw);
  const read = name => {
    const bound = review.inputs[name]; const raw = fs.readFileSync(path.resolve(root, bound.path));
    if (sha256(raw) !== bound.sha256) throw new Error(`review_input_hash_mismatch:${name}`);
    return name === 'probes' ? JSON.parse(raw) : raw.toString().split('\n').filter(Boolean).map(JSON.parse);
  };
  return { ...validateSourceDispositions(review, read('probes'), read('targets')), reviewSha256: sha256(reviewRaw), inputs: review.inputs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = validateSourceDispositionFiles(process.argv[2]);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
