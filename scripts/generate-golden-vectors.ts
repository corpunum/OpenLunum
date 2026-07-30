/**
 * Generate normative canonical byte vectors from the semantic implementation.
 *
 * This script produces canonical vectors from the implementation, creating
 * a golden reference that can be used for conformance testing. If the
 * canonicalization or fingerprinting algorithms change, this script should
 * be re-run to generate updated golden vectors.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-golden-vectors.ts
 *
 * Output:
 *   packages/core/test/fixtures/normative-canonical-vectors.json
 *   packages/core/test/fixtures/normative-canonical-vectors.golden.json (with computed values)
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { canonicalizeSem, stableStringify } from '../packages/core/src/canonicalize.js';
import { fingerprintSem } from '../packages/core/src/fingerprint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

interface NormativeVector {
  id: string;
  description: string;
  input: unknown;
}

interface GoldenVectorFixture {
  vectors: NormativeVector[];
}

interface ComputedVector extends NormativeVector {
  canonical: string;
  canonicalLength: number;
  fingerprint: string;
  fingerprintComponents: {
    prefix: string;
    version: string;
    algorithm: string;
    digest: string;
  };
}

interface GoldenVectorOutput {
  generated: string;
  version: string;
  vectorCount: number;
  vectors: ComputedVector[];
}

async function main() {
  // Load the normative vectors fixture
  const fixturePath = path.join(WORKSPACE_ROOT, 'packages/core/test/fixtures/normative-canonical-vectors.json');

  if (!fs.existsSync(fixturePath)) {
    console.error(`Vector fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as GoldenVectorFixture;

  if (!Array.isArray(fixtureData.vectors) || fixtureData.vectors.length === 0) {
    console.error('Vector fixture has no vectors');
    process.exit(1);
  }

  console.log(`Processing ${fixtureData.vectors.length} vectors...`);

  const computedVectors: ComputedVector[] = [];

  for (const vector of fixtureData.vectors) {
    try {
      // Canonicalize
      const canonical = canonicalizeSem(vector.input);
      const canonicalString = stableStringify(canonical);

      // Fingerprint
      const fingerprint = fingerprintSem(vector.input);

      // Parse fingerprint components
      const fpParts = fingerprint.split(':');
      if (fpParts.length < 4) {
        throw new Error(`Invalid fingerprint format: ${fingerprint}`);
      }

      const computed: ComputedVector = {
        id: vector.id,
        description: vector.description,
        input: vector.input,
        canonical: canonicalString,
        canonicalLength: canonicalString.length,
        fingerprint: fingerprint,
        fingerprintComponents: {
          prefix: fpParts[0]!,
          version: fpParts[1]!,
          algorithm: fpParts[2]!,
          digest: fpParts[3]!
        }
      };

      computedVectors.push(computed);
      console.log(`✓ ${vector.id}: ${canonicalString.length} bytes, fingerprint ${fingerprint.slice(0, 40)}...`);
    } catch (error) {
      console.error(`✗ ${vector.id}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Generate output
  const output: GoldenVectorOutput = {
    generated: new Date().toISOString(),
    version: '1.0',
    vectorCount: computedVectors.length,
    vectors: computedVectors
  };

  // Write golden vectors with computed values
  const outputPath = path.join(WORKSPACE_ROOT, 'packages/core/test/fixtures/normative-canonical-vectors.golden.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nGenerated ${computedVectors.length} golden vectors to ${outputPath}`);

  // Generate a summary
  console.log('\nSummary:');
  console.log(`  Total vectors: ${computedVectors.length}`);

  const totalBytes = computedVectors.reduce((sum, v) => sum + v.canonicalLength, 0);
  const avgBytes = Math.round(totalBytes / computedVectors.length);
  console.log(`  Total canonical bytes: ${totalBytes}`);
  console.log(`  Average canonical size: ${avgBytes} bytes`);

  const fingerprintLengths = computedVectors.map(v => v.fingerprint.length);
  const minFpLen = Math.min(...fingerprintLengths);
  const maxFpLen = Math.max(...fingerprintLengths);
  console.log(`  Fingerprint lengths: ${minFpLen}-${maxFpLen} chars`);

  // Verify idempotence
  console.log('\nVerifying idempotence...');
  let idempotenceErrors = 0;
  for (const vector of computedVectors) {
    const canonical2 = stableStringify(canonicalizeSem(vector.input));
    if (canonical2 !== vector.canonical) {
      console.error(`✗ ${vector.id}: canonicalization not idempotent`);
      idempotenceErrors++;
    }
  }

  if (idempotenceErrors === 0) {
    console.log('✓ All vectors pass idempotence check');
  } else {
    console.error(`✗ ${idempotenceErrors} vector(s) failed idempotence check`);
    process.exit(1);
  }

  console.log('\nGeneration complete!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
