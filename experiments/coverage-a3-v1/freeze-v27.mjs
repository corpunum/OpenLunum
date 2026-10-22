#!/usr/bin/env node
// Freeze instruction package v27 (contract lunum-agent/0.21, A3) from the BUILT dist of the current commit. No model call.
// Copies v25's public package, rebinds every artifact hash, the served contract and a new served-runtime manifest, and
// updates the conventions that 0.21 changes (questions; I / you / we in general frames). v26 stays reserved for ADR 0029.
//   pnpm build && node experiments/coverage-a3-v1/freeze-v27.mjs
import fs from 'node:fs';
import path from 'node:path';
import { getExtractionContract, stableStringify } from '../../packages/core/dist/src/index.js';
import { artifactBinding, captureServedRuntimeManifest, checkServedContract, sha256 } from '../../scripts/research/source-only-run-gates.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = path.join(root, 'experiments/natural-development-v8/extraction');
const v25 = JSON.parse(fs.readFileSync(path.join(dir, 'public-instruction-package-v25.json'), 'utf8'));
const pkg = structuredClone(v25);
const manifestName = 'public-served-runtime-v27.json';
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
const packagePath = path.join(dir, 'public-instruction-package-v27.json');
const profilePath = path.resolve(dir, f.taskProfilePath);
for (const check of artifactBinding(root, packagePath, profilePath, pkg).checks) {
  if (check.key === 'transportValidatorDependency') f.transportValidatorDependency = check.actual;
  else f[check.key] = check.actual;
}
pkg.supersedes = { path: 'public-instruction-package-v25.json', reason: 'contract lunum-agent/0.21 (A3, experiments/coverage-a3-v1): bare-string assert.action is a text term; questions take a general frame with kind question (protocol 0.7, frames 0.9); I / you / we are valid general-frame fillers. v26 is reserved for decisions/0029' };
const roles = pkg.conventions.roles;
const imperative = roles.findIndex((r) => r.startsWith('imperatives:'));
if (imperative < 0) throw new Error('imperative_convention_missing');
roles[imperative] = 'imperatives: the addressee is the implicit agent; leave agent out (deploy, rotate, restart, enable, delete), never fill it with you or the reader; deploy takes theme (what is deployed) and/or destination. This is for operational frames only: in a general frame, I, you and we as written are valid fillers';
roles.push('questions: a whole question takes the general frame its words have with kind question; the question word goes as written in the role it asks about; topic is only for headings and labels');
const binding = artifactBinding(root, packagePath, profilePath, pkg);
const served = checkServedContract(contract, pkg);
if (!binding.match || !served.match) throw new Error(`freeze_not_bound:${JSON.stringify({ binding: binding.checks.filter((c) => !c.match).map((c) => c.key), served: served.mismatches })}`);
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log({ package: path.relative(root, packagePath), contractVersion: f.coreContractVersion, contractHash: f.coreContractHash, protocol: f.protocolVersion, frames: f.frameRegistryVersion });
