import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATION_PATHS,
  COMPATIBILITY_DIMENSIONS,
  simulateMigrationTest,
  runProfileCompatibilityMigrationSuite,
} from '../src/profile-compatibility-migration.js';

describe('profile-compatibility-migration', () => {
  describe('constants', () => {
    it('has 6 migration paths', () => {
      assert.equal(MIGRATION_PATHS.length, 6);
    });

    it('has 5 compatibility dimensions', () => {
      assert.equal(COMPATIBILITY_DIMENSIONS.length, 5);
    });

    it('path names are unique', () => {
      const names = MIGRATION_PATHS.map(p => p.name);
      assert.equal(new Set(names).size, names.length);
    });

    it('includes both same-family and cross-family paths', () => {
      assert.ok(MIGRATION_PATHS.some(p => p.crossFamily));
      assert.ok(MIGRATION_PATHS.some(p => !p.crossFamily));
    });
  });

  describe('simulateMigrationTest', () => {
    it('returns valid result', () => {
      const r = simulateMigrationTest(MIGRATION_PATHS[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      assert.equal(typeof r.score, 'number');
      assert.ok(r.score >= 0 && r.score <= 1);
      assert.equal(typeof r.passed, 'boolean');
      assert.equal(typeof r.semanticsPreserved, 'boolean');
      assert.equal(typeof r.rollbackSafe, 'boolean');
    });

    it('is deterministic', () => {
      const a = simulateMigrationTest(MIGRATION_PATHS[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      const b = simulateMigrationTest(MIGRATION_PATHS[0]!, COMPATIBILITY_DIMENSIONS[0]!);
      assert.deepEqual(a, b);
    });

    it('always preserves semantics', () => {
      for (const path of MIGRATION_PATHS) {
        for (const dim of COMPATIBILITY_DIMENSIONS) {
          const r = simulateMigrationTest(path, dim);
          assert.equal(r.semanticsPreserved, true);
        }
      }
    });

    it('always supports rollback', () => {
      for (const path of MIGRATION_PATHS) {
        for (const dim of COMPATIBILITY_DIMENSIONS) {
          const r = simulateMigrationTest(path, dim);
          assert.equal(r.rollbackSafe, true);
        }
      }
    });
  });

  describe('runProfileCompatibilityMigrationSuite', () => {
    it('produces correct total tests', () => {
      const report = runProfileCompatibilityMigrationSuite();
      assert.equal(report.totalTests, 6 * 5);
    });

    it('has 6 path summaries', () => {
      const report = runProfileCompatibilityMigrationSuite();
      assert.equal(report.pathSummaries.length, 6);
    });

    it('all semantics preserved', () => {
      const report = runProfileCompatibilityMigrationSuite();
      assert.equal(report.allSemanticsPreserved, true);
    });

    it('all rollback safe', () => {
      const report = runProfileCompatibilityMigrationSuite();
      assert.equal(report.allRollbackSafe, true);
    });

    it('verdict is safe or cautious', () => {
      const report = runProfileCompatibilityMigrationSuite();
      assert.ok(report.verdict === 'safe' || report.verdict === 'cautious');
    });

    it('accepts custom inputs', () => {
      const report = runProfileCompatibilityMigrationSuite(
        MIGRATION_PATHS.slice(0, 2),
        COMPATIBILITY_DIMENSIONS.slice(0, 3),
      );
      assert.equal(report.totalTests, 2 * 3);
    });
  });
});
