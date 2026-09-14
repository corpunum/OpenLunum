import path from 'node:path';
import { buildEvidenceValidityManifest, writeEvidenceValidityManifest } from './evidence-validity.js';
import { findWorkspaceRoot } from './io.js';

export async function runEvidenceValidityCli(): Promise<void> {
  const root = await findWorkspaceRoot();
  const outputArg = process.argv[2];
  const outputFile = outputArg
    ? path.resolve(root, outputArg)
    : path.join(root, 'reports', 'evidence-validity', 'latest.json');
  const manifest = await buildEvidenceValidityManifest(root);
  await writeEvidenceValidityManifest(outputFile, manifest);
  console.log(JSON.stringify({ outputFile, totals: manifest.totals }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEvidenceValidityCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
