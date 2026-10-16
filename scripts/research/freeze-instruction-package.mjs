#!/usr/bin/env node
// Freeze a new public instruction package from the previous one for a change that
// leaves the contract text unchanged (for example a tool delivery fix). Every bound
// artifact hash and the served-runtime manifest are recomputed from the current build
// with the runner's own binding code; the contract hash must not move.
//   node scripts/research/freeze-instruction-package.mjs <from-version> <to-version> "<reason>"
import fs from 'node:fs';
import path from 'node:path';
import { getExtractionContract, stableStringify } from '../../packages/core/dist/src/index.js';
import { artifactBinding, captureServedRuntimeManifest, sha256 } from './source-only-run-gates.mjs';

const [from, to, reason] = process.argv.slice(2);
if (!from || !to || !reason) { console.error('usage: freeze-instruction-package.mjs <from> <to> "<reason>"'); process.exit(2); }
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const dir = path.join(root, 'experiments/natural-development-v8/extraction');
const fromPath = path.join(dir, `public-instruction-package-v${from}.json`);
const toPath = path.join(dir, `public-instruction-package-v${to}.json`);
const manifestName = `public-served-runtime-v${to}.json`;
if (fs.existsSync(toPath) || fs.existsSync(path.join(dir, manifestName))) throw new Error('target_exists: frozen files are never overwritten');
const previous = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
const contract = getExtractionContract();
if (sha256(stableStringify(contract)) !== previous.freeze.coreContractHash) throw new Error('contract_changed: use the normal contract-change process (ADR 0025)');

fs.writeFileSync(path.join(dir, manifestName), `${JSON.stringify(captureServedRuntimeManifest(root), null, 2)}\n`);
const next = structuredClone(previous);
next.supersedes = { path: path.basename(fromPath), reason };
next.freeze.servedRuntimeManifestPath = manifestName;
const profilePath = path.resolve(dir, next.freeze.taskProfilePath);
// Recompute every hash binding from the files the runner checks.
for (const check of artifactBinding(root, toPath, profilePath, next).checks) {
  if (check.key === 'transportValidatorDependency') next.freeze[check.key] = check.actual;
  else next.freeze[check.key] = check.actual;
}
next.freeze.coreContractJsonSerializationSha256 = sha256(JSON.stringify(contract));
const verify = artifactBinding(root, toPath, profilePath, next);
if (!verify.match) throw new Error(`binding_failed:${JSON.stringify(verify.checks.filter((c) => !c.match).map((c) => c.key))}`);
fs.writeFileSync(toPath, `${JSON.stringify(next, null, 1)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.keys(next.freeze).filter((k) => JSON.stringify(next.freeze[k]) !== JSON.stringify(previous.freeze[k])).map((k) => [k, next.freeze[k]])), null, 2));
