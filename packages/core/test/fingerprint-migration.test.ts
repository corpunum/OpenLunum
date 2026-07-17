import { test } from 'node:test';
import assert from 'node:assert';
import { fingerprintSem } from '../src/fingerprint.js';
import { canonicalizeSem } from '../src/canonicalize.js';

test('fingerprintSem generates consistent fingerprints for same semantic content', () => {
  const sem1 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const sem2 = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const fingerprint1 = fingerprintSem(sem1);
  const fingerprint2 = fingerprintSem(sem2);

  // Same semantic content should produce same fingerprint
  assert.strictEqual(fingerprint1, fingerprint2);
});

test('fingerprintSem versioning consistency', () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'test',
    kind: 'example',
    clauses: [
      {
        predicate: 'test',
        roles: {
          subject: 'test'
        }
      }
    ]
  };

  const fingerprint = fingerprintSem(sem);
  
  // Should start with version prefix
  assert.ok(fingerprint.startsWith('lfp:0.1:'));
});