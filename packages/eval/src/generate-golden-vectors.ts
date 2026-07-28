#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { generateGoldenVectors } from './independent-verifier.js';

const outDir = resolve(process.cwd(), 'eval-results/golden-vectors');

async function main(): Promise<void> {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch { /* ok */ }

  const bundle = generateGoldenVectors(commit);
  await writeFile(
    resolve(outDir, 'golden-vectors.json'),
    JSON.stringify(bundle, null, 2) + '\n',
    'utf-8',
  );

  console.log(`Generated ${bundle.vectors.length} golden vectors at commit ${commit}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
