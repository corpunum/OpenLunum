#!/usr/bin/env node
// Freeze instruction package v34: a MAINTENANCE freeze on the same contract lunum-agent/0.22 (decisions/0031).
// No model call and no contract change. It rebinds the served runtime after the 2026-11-27 further input-handling hardening
// in agent-state retention and release provenance.
// v33 stays as a historical binding: only those two modules and the served-runtime manifest drift.
//   pnpm build && node scripts/research/freeze-v34.mjs
import fs from 'node:fs';
import path from 'node:path';
import { getExtractionContract } from '../../packages/core/dist/src/index.js';
import { artifactBinding, captureServedRuntimeManifest, checkServedContract } from './source-only-run-gates.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = path.join(root, 'experiments/natural-development-v8/extraction');
const v33 = JSON.parse(fs.readFileSync(path.join(dir, 'public-instruction-package-v33.json'), 'utf8'));
const pkg = structuredClone(v33);
const manifestName = 'public-served-runtime-v34.json';
fs.writeFileSync(path.join(dir, manifestName), JSON.stringify(captureServedRuntimeManifest(root), null, 2) + '\n');

const contract = getExtractionContract();
const f = pkg.freeze;
if (f.coreContractVersion !== contract.contractVersion) throw new Error(`maintenance_freeze_contract_changed:${f.coreContractVersion}->${contract.contractVersion}`);
f.servedRuntimeManifestPath = manifestName;
const packagePath = path.join(dir, 'public-instruction-package-v34.json');
const profilePath = path.resolve(dir, f.taskProfilePath);
for (const check of artifactBinding(root, packagePath, profilePath, pkg).checks) f[check.key] = check.actual;
pkg.supersedes = { path: 'public-instruction-package-v33.json', reason: 'further input-handling hardening in agent-state retention and release provenance; contract lunum-agent/0.22 unchanged' };
const binding = artifactBinding(root, packagePath, profilePath, pkg);
const served = checkServedContract(contract, pkg);
if (!binding.match || !served.match) throw new Error(`freeze_not_bound:${JSON.stringify({ binding: binding.checks.filter((c) => !c.match).map((c) => c.key), served: served.mismatches })}`);
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
const changed = Object.keys(f).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(v33.freeze[k]));
console.log({ package: path.relative(root, packagePath), contractVersion: f.coreContractVersion, changed });
