#!/usr/bin/env node

/**
 * Derive a new, review-pending corpus from natural-development-v2.
 *
 * V2 is immutable diagnostic evidence. The only semantic correction here is
 * restoring the source-visible audience role for the publication examples;
 * all approvals must therefore be freshly bound to V3 packets.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const inputRoot = path.resolve(process.argv[2] ?? 'experiments/natural-development-v2');
const outputRoot = path.resolve(process.argv[3] ?? 'experiments/natural-development-v3');
const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const datasetFile = path.join(inputRoot, 'dataset.jsonl');
const inputBytes = fs.readFileSync(datasetFile);
const inputHash = sha256(inputBytes);
const rows = readJsonl(datasetFile);
const correctedIds = [];
const correctedCandidates = [];

const outputRows = rows.map((row) => {
  if (!row.source.semanticGroup.includes('publish') && !row.source.semanticGroup.includes('withhold')) return {
    ...row,
    provenance: { ...row.provenance, sourceKind: 'agent-authored-development', generatorVersion: 'natural-development-v3' },
    review: { ...row.review, reviewers: ['fresh-review-pending'] }
  };
  const corrected = {
    ...row,
    target: {
      ...row.target,
      ir: {
        ...row.target.ir,
        roles: {
          ...row.target.ir.roles,
          audience: { handle: 'public-audience', type: 'actor' }
        }
      }
    },
    provenance: { ...row.provenance, sourceKind: 'agent-authored-development', generatorVersion: 'natural-development-v3', annotationMethod: 'source-visible-publication-correction' },
    review: { ...row.review, reviewers: ['fresh-review-pending'] }
  };
  correctedIds.push(row.id);
  correctedCandidates.push({
    sourceRowId: row.id,
    baseDatasetSha256: inputHash,
    baseCandidateSha256: sha256(Buffer.from(JSON.stringify(row.target))),
    correctedCandidateSha256: sha256(Buffer.from(JSON.stringify(corrected.target))),
    correctionReason: 'The source explicitly expresses a publication audience; V2 target omitted the optional audience role.',
    correctionAuthor: 'codex-parent-session',
    correctionAuthorType: 'agent',
    reviewerRequired: true
  });
  return corrected;
});

fs.mkdirSync(path.join(outputRoot, 'review'), { recursive: true });
const datasetText = `${outputRows.map(JSON.stringify).join('\n')}\n`;
const outputDataset = path.join(outputRoot, 'dataset.jsonl');
fs.writeFileSync(outputDataset, datasetText, { flag: 'wx' });
const outputHash = sha256(Buffer.from(datasetText));
fs.writeFileSync(path.join(outputRoot, 'publication-corrections.json'), `${JSON.stringify({
  format: 'openlunum-natural-development-correction/0.1',
  baseDatasetSha256: inputHash,
  correctedDatasetSha256: outputHash,
  sourceDataset: path.relative(process.cwd(), datasetFile),
  correctedRows: correctedIds.length,
  corrections: correctedCandidates
}, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
  format: 'openlunum-natural-development/0.2',
  status: 'awaiting-fresh-independent-review',
  datasetSha256: outputHash,
  derivedFrom: { datasetSha256: inputHash, path: path.relative(process.cwd(), datasetFile) },
  rows: outputRows.length,
  semanticGroups: new Set(outputRows.map((row) => row.source.semanticGroup)).size,
  languages: [...new Set(outputRows.map((row) => row.source.language))].sort(),
  sourceKind: 'agent-authored-development',
  humanAuthorshipEstablished: false,
  reviewPolicy: 'all V3 packets require fresh source-level review; V2 approvals do not transfer across dataset or packet hashes',
  correctedRows: correctedIds
}, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ inputHash, outputHash, rows: outputRows.length, correctedRows: correctedIds.length }, null, 2));
