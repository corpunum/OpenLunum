#!/usr/bin/env node
// Freeze instruction package v28 (contract lunum-agent/0.22, decisions/0031) from the BUILT dist of the current commit.
// No model call. Copies v27, rebinds every artifact hash, the served contract and a new served-runtime manifest, and
// updates the imperative convention that 0.22 changes. v27 (contract 0.21, the A3 run) stays as a historical binding.
//   pnpm build && node experiments/coverage-a3-v2/freeze-v28.mjs
import fs from 'node:fs';
import path from 'node:path';
import { getExtractionContract, stableStringify } from '../../packages/core/dist/src/index.js';
import { artifactBinding, captureServedRuntimeManifest, checkServedContract, sha256 } from '../../scripts/research/source-only-run-gates.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = path.join(root, 'experiments/natural-development-v8/extraction');
const v27 = JSON.parse(fs.readFileSync(path.join(dir, 'public-instruction-package-v27.json'), 'utf8'));
const pkg = structuredClone(v27);
const manifestName = 'public-served-runtime-v28.json';
fs.writeFileSync(path.join(dir, manifestName), JSON.stringify(captureServedRuntimeManifest(root), null, 2) + '\n');

const contract = getExtractionContract();
const f = pkg.freeze;
Object.assign(f, {
  coreContractVersion: contract.contractVersion,
  coreContractHash: sha256(stableStringify(contract)),
  coreContractJsonSerializationSha256: sha256(JSON.stringify(contract)),
  instructionVersion: contract.instructions.version,
  instructionHash: contract.instructions.hash,
  schemaHash: contract.transport.schemaHash,
  frameRegistryVersion: contract.frames.version,
  frameRegistryHash: contract.frames.registryHash,
  protocolVersion: contract.protocol.version,
  protocolRegistryHash: contract.protocol.registryHash,
  servedRuntimeManifestPath: manifestName,
});
const packagePath = path.join(dir, 'public-instruction-package-v28.json');
const profilePath = path.resolve(dir, f.taskProfilePath);
for (const check of artifactBinding(root, packagePath, profilePath, pkg).checks) {
  if (check.key === 'transportValidatorDependency') f.transportValidatorDependency = check.actual;
  else f[check.key] = check.actual;
}
pkg.supersedes = { path: 'public-instruction-package-v27.json', reason: 'contract lunum-agent/0.22 (decisions/0031): an imperative is a general frame with kind instruction, the subject left out, action the imperative verb alone and what it governs whole in object; the renderer gains generic-en-pivot/0.3 (mood). Protocol 0.7, frames 0.9 and lfp:2.1 are unchanged' };
const roles = pkg.conventions.roles;
const imperative = roles.findIndex((r) => r.startsWith('imperatives:'));
if (imperative < 0) throw new Error('imperative_convention_missing');
roles[imperative] = 'imperatives: the addressee is the implicit agent; leave agent out (deploy, rotate, restart, enable, delete), never fill it with you or the reader; deploy takes theme (what is deployed) and/or destination. In a general frame an imperative has kind instruction and no subject (the kind carries the addressee); action is the imperative verb alone with its particle (Stop, Get off) and what it governs stays whole in object ("Stop looking at me." is assert(action: Stop, object: looking at me)); Don\'t is negated, not a modality. Otherwise, in a general frame, I, you and we as written are valid fillers';
const binding = artifactBinding(root, packagePath, profilePath, pkg);
const served = checkServedContract(contract, pkg);
if (!binding.match || !served.match) throw new Error(`freeze_not_bound:${JSON.stringify({ binding: binding.checks.filter((c) => !c.match).map((c) => c.key), served: served.mismatches })}`);
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log({ package: path.relative(root, packagePath), contractVersion: f.coreContractVersion, contractHash: f.coreContractHash, protocol: f.protocolVersion, frames: f.frameRegistryVersion });
