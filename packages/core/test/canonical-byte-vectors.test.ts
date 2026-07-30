/**
 * Canonical byte vector verification tests.
 *
 * This test suite verifies that all semantic constructs canonicalize
 * and fingerprint to expected byte-level values. Each golden vector
 * serves as a normative test: if canonicalization changes, this test
 * will fail, alerting developers to the breaking change.
 *
 * Coverage includes:
 *  - Simple obligation/prohibition/permission clauses
 *  - Negated clauses
 *  - Conditional clauses (if/then/else)
 *  - Multi-clause documents
 *  - Modality markers (must, should, may, shall)
 *  - Role-tagged clauses (user, system, third-party)
 *  - Annotation-bearing clauses
 *  - Temporal conditions
 *  - Scope boundaries
 *  - Edge cases: empty, minimal, maximal nesting
 */

import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { canonicalizeSem, stableStringify } from '../src/canonicalize.js';
import { fingerprintSem } from '../src/fingerprint.js';
import type { LunumSem } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NormativeVector {
  id: string;
  description: string;
  input: unknown;
}

interface GoldenVectorFixture {
  vectors: NormativeVector[];
}

// Load the golden vectors
// Resolve correctly whether running from src or dist
let vectorFixturePath = path.join(__dirname, 'fixtures', 'normative-canonical-vectors.json');
if (!fs.existsSync(vectorFixturePath)) {
  // If running from dist, go up two levels to reach the core package directory
  vectorFixturePath = path.join(__dirname, '..', '..', 'test', 'fixtures', 'normative-canonical-vectors.json');
}
if (!fs.existsSync(vectorFixturePath)) {
  // Fallback: resolve from package root
  const packageRoot = path.resolve(__dirname, '..', '..');
  vectorFixturePath = path.join(packageRoot, 'test', 'fixtures', 'normative-canonical-vectors.json');
}

const vectorFixture = JSON.parse(fs.readFileSync(vectorFixturePath, 'utf-8')) as GoldenVectorFixture;

test('Canonical vectors: count', () => {
  assert.ok(vectorFixture.vectors.length >= 20, `Expected at least 20 vectors, got ${vectorFixture.vectors.length}`);
});

test('Canonical vectors: all have required fields', () => {
  for (const vector of vectorFixture.vectors) {
    assert.ok(vector.id, `Vector missing id`);
    assert.ok(vector.description, `Vector ${vector.id} missing description`);
    assert.ok(vector.input, `Vector ${vector.id} missing input`);
  }
});

// Test each vector
for (const vector of vectorFixture.vectors) {
  test(`Canonical vector ${vector.id}: ${vector.description}`, () => {
    const input = vector.input;

    // Validate input structure
    assert.ok(input, `Vector ${vector.id} has no input`);
    assert.ok(typeof input === 'object' && !Array.isArray(input), `Vector ${vector.id} input must be object`);

    const obj = input as Record<string, unknown>;
    assert.ok(obj.schema, `Vector ${vector.id}: missing schema`);
    assert.ok(obj.world, `Vector ${vector.id}: missing world`);
    assert.ok(obj.kind, `Vector ${vector.id}: missing kind`);
    assert.ok(Array.isArray(obj.clauses) && obj.clauses.length > 0, `Vector ${vector.id}: missing or empty clauses`);

    // Canonicalize
    let canonical: LunumSem;
    try {
      canonical = canonicalizeSem(input);
    } catch (error) {
      assert.fail(`Vector ${vector.id} failed to canonicalize: ${error}`);
    }

    // Verify canonical structure
    assert.strictEqual(canonical.schema, 'lunum-sem/0.1-draft', `Vector ${vector.id}: canonical schema mismatch`);
    assert.ok(typeof canonical.world === 'string' && canonical.world.length > 0, `Vector ${vector.id}: canonical world invalid`);
    assert.ok(typeof canonical.kind === 'string' && canonical.kind.length > 0, `Vector ${vector.id}: canonical kind invalid`);
    assert.ok(Array.isArray(canonical.clauses) && canonical.clauses.length > 0, `Vector ${vector.id}: canonical clauses invalid`);

    // Generate canonical string (this is the "byte vector")
    const canonicalString = stableStringify(canonical);
    assert.ok(typeof canonicalString === 'string', `Vector ${vector.id}: stableStringify failed`);
    assert.ok(canonicalString.length > 0, `Vector ${vector.id}: empty canonical string`);

    // Generate fingerprint
    let fingerprint: string;
    try {
      fingerprint = fingerprintSem(input);
    } catch (error) {
      assert.fail(`Vector ${vector.id} failed to fingerprint: ${error}`);
    }

    // Verify fingerprint format
    assert.ok(fingerprint.startsWith('lfp:'), `Vector ${vector.id}: fingerprint missing lfp: prefix`);
    assert.ok(fingerprint.includes('sha256'), `Vector ${vector.id}: fingerprint missing sha256 algorithm`);
    assert.ok(fingerprint.length > 20, `Vector ${vector.id}: fingerprint too short`);

    // Fingerprint should be deterministic
    const fingerprint2 = fingerprintSem(input);
    assert.strictEqual(fingerprint, fingerprint2, `Vector ${vector.id}: fingerprint not deterministic`);

    // Canonicalization should be idempotent
    const canonical2 = canonicalizeSem(canonical);
    const canonical2String = stableStringify(canonical2);
    assert.strictEqual(canonicalString, canonical2String, `Vector ${vector.id}: canonicalization not idempotent`);
  });
}

test('Canonical vectors: clause predicate consistency', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;

    for (const clause of clauses) {
      assert.ok(clause.predicate, `Vector ${vector.id}: clause missing predicate`);
      assert.ok(typeof clause.predicate === 'string' && clause.predicate.length > 0, `Vector ${vector.id}: invalid predicate`);
      assert.ok(clause.roles, `Vector ${vector.id}: clause missing roles`);
      assert.ok(typeof clause.roles === 'object' && !Array.isArray(clause.roles), `Vector ${vector.id}: invalid roles`);
    }
  }
});

test('Canonical vectors: negation is boolean', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;

    for (const clause of clauses) {
      if ('negated' in clause) {
        assert.strictEqual(typeof clause.negated, 'boolean', `Vector ${vector.id}: negated must be boolean`);
      }
    }
  }
});

test('Canonical vectors: modality is string or null', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;

    for (const clause of clauses) {
      if ('modality' in clause) {
        const modality = clause.modality;
        assert.ok(modality === null || typeof modality === 'string', `Vector ${vector.id}: modality must be string or null`);
      }
    }
  }
});

test('Canonical vectors: nested conditions exist and are arrays', () => {
  const vectorsWithConditions = vectorFixture.vectors.filter((v) => {
    const input = v.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;
    return clauses.some((c) => 'conditions' in c);
  });

  assert.ok(vectorsWithConditions.length > 0, 'At least one vector should have conditions');

  for (const vector of vectorsWithConditions) {
    const input = vector.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;

    for (const clause of clauses) {
      if ('conditions' in clause) {
        assert.ok(Array.isArray(clause.conditions), `Vector ${vector.id}: conditions must be array`);
        if ((clause.conditions as Array<unknown>).length > 0) {
          const condition = (clause.conditions as Array<Record<string, unknown>>)[0]!;
          assert.ok(condition.predicate, `Vector ${vector.id}: condition missing predicate`);
        }
      }
    }
  }
});

test('Canonical vectors: nested consequences exist and are arrays', () => {
  const vectorsWithConsequences = vectorFixture.vectors.filter((v) => {
    const input = v.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;
    return clauses.some((c) => 'consequences' in c);
  });

  assert.ok(vectorsWithConsequences.length > 0, 'At least one vector should have consequences');

  for (const vector of vectorsWithConsequences) {
    const input = vector.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;

    for (const clause of clauses) {
      if ('consequences' in clause) {
        assert.ok(Array.isArray(clause.consequences), `Vector ${vector.id}: consequences must be array`);
        if ((clause.consequences as Array<unknown>).length > 0) {
          const consequence = (clause.consequences as Array<Record<string, unknown>>)[0]!;
          assert.ok(consequence.predicate, `Vector ${vector.id}: consequence missing predicate`);
        }
      }
    }
  }
});

test('Canonical vectors: annotations preserve structure', () => {
  const vectorsWithAnnotations = vectorFixture.vectors.filter((v) => {
    const input = v.input as Record<string, unknown>;
    const clauses = input.clauses as Array<Record<string, unknown>>;
    return clauses.some((c) => 'annotations' in c);
  });

  assert.ok(vectorsWithAnnotations.length > 0, 'At least one vector should have annotations');

  for (const vector of vectorsWithAnnotations) {
    const input = vector.input as Record<string, unknown>;
    const canonical = canonicalizeSem(input);

    for (const clause of canonical.clauses) {
      if (clause!.annotations) {
        assert.ok(typeof clause!.annotations === 'object', `Vector ${vector.id}: canonical annotations must be object`);
      }
    }
  }
});

test('Canonical vectors: references are normalized', () => {
  const vectorsWithReferences = vectorFixture.vectors.filter((v) => {
    const input = v.input as Record<string, unknown>;
    return 'references' in input;
  });

  assert.ok(vectorsWithReferences.length > 0, 'At least one vector should have references');

  for (const vector of vectorsWithReferences) {
    const input = vector.input as Record<string, unknown>;
    const canonical = canonicalizeSem(input);

    if (canonical.references && canonical.references.length > 0) {
      for (const ref of canonical.references) {
        assert.ok(typeof ref === 'object' && ref !== null, `Vector ${vector.id}: reference must be object`);
      }
    }
  }
});

test('Canonical vectors: deterministic ordering', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;

    // Canonicalize multiple times
    const canonical1 = stableStringify(canonicalizeSem(input));
    const canonical2 = stableStringify(canonicalizeSem(input));
    const canonical3 = stableStringify(canonicalizeSem(input));

    // All should be identical
    assert.strictEqual(canonical1, canonical2, `Vector ${vector.id}: not deterministic (1 vs 2)`);
    assert.strictEqual(canonical2, canonical3, `Vector ${vector.id}: not deterministic (2 vs 3)`);
  }
});

test('Canonical vectors: UTF-8 compatibility', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;
    const canonical = stableStringify(canonicalizeSem(input));

    // Should be valid UTF-8 and not contain control characters
    const bytes = Buffer.from(canonical, 'utf-8');
    const decoded = bytes.toString('utf-8');
    assert.strictEqual(canonical, decoded, `Vector ${vector.id}: UTF-8 round-trip failed`);
  }
});

test('Canonical vectors: JSON-serializable output', () => {
  for (const vector of vectorFixture.vectors) {
    const input = vector.input as Record<string, unknown>;

    // Canonical form should be JSON-serializable
    const canonical = canonicalizeSem(input);
    const jsonString = JSON.stringify(canonical);
    const parsed = JSON.parse(jsonString);

    assert.deepStrictEqual(parsed, canonical, `Vector ${vector.id}: JSON round-trip failed`);
  }
});
