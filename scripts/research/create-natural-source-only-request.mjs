#!/usr/bin/env node

/** Create a source-only extraction request from a certified development subset. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const subsetFile = path.resolve(process.argv[2] ?? 'experiments/natural-development-v4/certified-subset.jsonl');
const outputDir = path.resolve(process.argv[3] ?? path.dirname(subsetFile));
const contractFile = path.resolve(process.argv[4] ?? '/tmp/lunum-agent-contract.json');
const rows = fs.readFileSync(subsetFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
const request = rows.map((row, index) => {
  const handle = `extract-${String(index + 1).padStart(3, '0')}-${crypto.createHash('sha256').update(`openlunum-source-only\0${row.id}`).digest('hex').slice(0, 12)}`;
  return { handle, sourceLanguage: row.source.language, sourceText: row.source.text, sourceSha256: crypto.createHash('sha256').update(row.source.text).digest('hex'), contractVersion: contract.contractVersion, contractHash: crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex') };
});
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'source-only-request.jsonl'), `${request.map(JSON.stringify).join('\n')}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'source-only-contract.json'), `${JSON.stringify(contract, null, 2)}\n`, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'source-only-private-map.json'), `${JSON.stringify(Object.fromEntries(request.map((item, index) => [item.handle, { sourceRowId: rows[index].id }])), null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ rows: request.length, contractVersion: contract.contractVersion, contractHash: request[0]?.contractHash, requestFile: path.join(outputDir, 'source-only-request.jsonl') }, null, 2));
