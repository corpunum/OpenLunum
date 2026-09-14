#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.argv[2] ?? '.');
const v7Root = path.join(repoRoot, 'experiments/natural-development-v7');
const v8Root = path.join(repoRoot, 'experiments/natural-development-v8');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJsonl = (file) => fs.readFileSync(file, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
const writeNew = (file, value) => fs.writeFileSync(file, value, { flag: 'wx' });

if (fs.existsSync(v8Root)) throw new Error(`refusing_to_overwrite:${v8Root}`);
fs.mkdirSync(path.join(v8Root, 'extraction'), { recursive: true });
fs.mkdirSync(path.join(v8Root, 'review'), { recursive: true });

const v7Rows = readJsonl(path.join(v7Root, 'certified-subset.jsonl'));
const reviewedGreek = new Map([
  ['v7-g1-el', 'Όταν η μπαταρία B-11 πέσει κάτω από 20%, το σύστημα S-11 πρέπει να ενεργοποιήσει τη λειτουργία F-11 και να στείλει την ειδοποίηση N-11 στον χειριστή O-11.'],
  ['v7-g2-el', 'Αν η μπαταρία B-22 είναι κάτω από 15%, επιτρέπεται στο σύστημα S-22 να ενεργοποιήσει τη λειτουργία F-22 και να στείλει την ειδοποίηση N-22 στον χειριστή O-22.'],
  ['v7-g3-el', 'Ο Ari στέλνει το έγγραφο P-41 στον ταχυμεταφορέα C-41.'],
  ['v7-g4-el', 'Ο συντάκτης E-61 δημοσιεύει την αναφορά R-61 στο κοινό A-61.'],
  ['v7-g5-el', 'Ο συντάκτης E-62 δημοσιεύει την αναφορά R-62 για το κοινό A-62.'],
  ['v7-g6-el', 'Στις 14 Ιανουαρίου 2027, η Rhea προσπαθεί ξανά να εκτελέσει την εργασία U-31 ακριβώς επτά φορές.'],
  ['v7-abstain-missing-el', 'Η Dana επιτρέπει στη Mira να έχει πρόσβαση.'],
  ['v7-abstain-missing-el-2', 'Η Dana επιτρέπει στη Mira να αποκτήσει πρόσβαση.'],
  ['v7-abstain-unsupported-el', 'Η Dana μεταφέρει 30 EUR από τον λογαριασμό Q-82.']
]);

const rows = v7Rows.map((row) => {
  const sourceText = reviewedGreek.get(row.id)
    ?? (row.id === 'v7-g3-en-a' ? 'Ari sends document P-41 to courier C-41.' : row.source.text);
  const id = row.id.replace(/^v7-/u, 'v8-');
  return {
    ...row,
    id,
    source: { ...row.source, text: sourceText },
    provenance: {
      sourceKind: 'human-authored-development',
      annotationMethod: 'contract-first-successor-from-v7',
      englishSemanticReview: 'unavailable',
      greekLanguageReview: reviewedGreek.has(row.id) ? 'human-self-attested-native-greek-language-only' : 'not-applicable'
    },
    review: {
      targetSem: 'independent-validation-required',
      english: 'fresh-human-native-review-unavailable',
      greek: reviewedGreek.has(row.id) ? 'exact-wording-bound-to-human-review-record' : 'not-applicable'
    }
  };
});

const taskContract = JSON.parse(fs.readFileSync(path.join(v7Root, 'task-contract.json'), 'utf8'));
taskContract.version = 'v8';
taskContract.status = 'frozen-development-contract';
taskContract.purpose = 'Small source-relative extraction task with exact human-reviewed Greek wording and contract-derived document typing.';
taskContract.termTypePolicy = {
  ...taskContract.termTypePolicy,
  document: 'document',
  object: 'object',
  parcel: 'not used in V8; if encountered outside this task, do not infer document without source evidence'
};
taskContract.sourceLexicalTypePolicy = {
  'file': 'document',
  'report': 'document',
  'notice': 'document',
  'document': 'document',
  'parcel': 'not mapped to document; use object or abstain when exact type is required'
};
taskContract.reviewBoundary = 'Greek wording review is bound separately and does not certify target Sem, English semantics, protected evaluation, or training eligibility.';

const sourceOnlyContractRaw = fs.readFileSync(path.join(v7Root, 'extraction/source-only-contract.json'), 'utf8');
const sourceOnlyContract = JSON.parse(sourceOnlyContractRaw);
const contractHash = hash(JSON.stringify(sourceOnlyContract));
const datasetRaw = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const taskContractRaw = `${JSON.stringify(taskContract, null, 2)}\n`;
const datasetHash = hash(datasetRaw);
const taskContractHash = hash(taskContractRaw);
const sourceOnlyContractHash = hash(sourceOnlyContractRaw);

const requests = rows.map((row) => {
  const handle = `extract-${hash(`v8:${row.id}`).slice(0, 16)}`;
  return { handle, sourceLanguage: row.source.language, sourceText: row.source.text, sourceSha256: hash(row.source.text), contractVersion: sourceOnlyContract.contractVersion, contractHash };
});
const requestRaw = `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`;
const privateMap = Object.fromEntries(rows.map((row, index) => [requests[index].handle, { sourceRowId: row.id }]));
const privateMapRaw = `${JSON.stringify(privateMap, null, 2)}\n`;
const reviewedGreekRaw = `${JSON.stringify({
  format: 'openlunum-human-greek-language-review/0.1',
  source: 'GitHub issue #685 newest human review comment',
  commentUrl: 'https://github.com/corpunum/OpenLunum/issues/685#issuecomment-5665946739',
  reviewedAt: '2026-09-14T14:54:40Z',
  reviewer: { type: 'human', handle: 'corpunum', nativeLanguage: 'el', selfAttested: true },
  scope: 'language-review-only',
  limitations: ['does not certify target Sem', 'does not review English', 'does not certify protected or training readiness'],
  wordingChangesRequireFreshReview: true,
  decisions: [...reviewedGreek].map(([sourceId, text]) => ({ sourceId: sourceId.replace(/^v7-/u, 'v8-'), text, sha256: hash(text), decision: 'accepted-exactly' }))
}, null, 2)}\n`;

writeNew(path.join(v8Root, 'certified-subset.jsonl'), datasetRaw);
writeNew(path.join(v8Root, 'task-contract.json'), taskContractRaw);
writeNew(path.join(v8Root, 'extraction/source-only-contract.json'), sourceOnlyContractRaw);
writeNew(path.join(v8Root, 'extraction/source-only-request.jsonl'), requestRaw);
writeNew(path.join(v8Root, 'extraction/source-only-private-map.json'), privateMapRaw);
writeNew(path.join(v8Root, 'review/human-greek-language-review.json'), reviewedGreekRaw);

const freezeManifest = {
  format: 'openlunum-natural-development-freeze/0.1',
  version: 'v8',
  status: 'frozen-awaiting-extraction',
  protected: false,
  trainingGoldEligible: false,
  englishReview: { status: 'unavailable', humanNativeCertification: false },
  greekReview: { status: 'wording-only', file: 'review/human-greek-language-review.json', reviewerSelfAttestedNative: true },
  dataset: 'certified-subset.jsonl', datasetSha256: datasetHash,
  taskContract: 'task-contract.json', taskContractSha256: taskContractHash,
  sourceOnlyContract: 'extraction/source-only-contract.json', sourceOnlyContractSha256: sourceOnlyContractHash, canonicalContractHash: contractHash,
  sourceOnlyRequest: 'extraction/source-only-request.jsonl', sourceOnlyRequestSha256: hash(requestRaw),
  privateMap: 'extraction/source-only-private-map.json', privateMapSha256: hash(privateMapRaw),
  humanGreekReviewSha256: hash(reviewedGreekRaw),
  rows: rows.length,
  languages: [...new Set(rows.map((row) => row.source.language))].sort(),
  parseRows: rows.filter((row) => row.target.outcome === 'parse').length,
  abstentionRows: rows.filter((row) => row.target.outcome === 'abstain').length,
  attemptPolicy: { firstPassOnly: true, retries: 0, deterministicRepair: false, postHocSemanticNormalization: false },
  extractorVisibility: ['opaque handle', 'source text', 'source language', 'frozen public extraction contract'],
  extractorForbidden: ['gold target', 'semantic group', 'critical contrast', 'review files', 'private map', 'V7/V8 candidates', 'generator files'],
  targetSemValidation: 'required-before-extraction-and-independent-review',
  identityPolicy: taskContract.identityPolicy
};
writeNew(path.join(v8Root, 'freeze-manifest.json'), `${JSON.stringify(freezeManifest, null, 2)}\n`);
writeNew(path.join(v8Root, 'README.md'), '# Natural development v8\n\nThis is a new immutable, development-only successor to v7. It is frozen before source-only extraction. Human review is limited to the exact Greek wording recorded in `review/human-greek-language-review.json`; it does not certify target Sem or English. English native review is unavailable.\n\nThe V8 freeze replaces the ambiguous English parcel/document pairing with an explicit document source, following the general term-type contract.\n');
console.log(JSON.stringify({ v8Root, rows: rows.length, datasetHash, taskContractHash, sourceOnlyContractHash, contractHash, requestHash: hash(requestRaw), privateMapHash: hash(privateMapRaw), humanGreekReviewHash: hash(reviewedGreekRaw) }, null, 2));
