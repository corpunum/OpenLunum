import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_MATRIX,
  detectPlatform,
  checkShellAvailability,
  getPlatformDegradations,
  generatePlatformReport,
} from '../src/platform-support.js';

describe('platform-support', () => {
  describe('PLATFORM_MATRIX', () => {
    it('has linux as primary', () => {
      const linux = PLATFORM_MATRIX.find(e => e.os === 'linux');
      assert.ok(linux);
      assert.equal(linux.tier, 'primary');
      assert.ok(linux.arch.includes('x64'));
      assert.ok(linux.arch.includes('arm64'));
    });

    it('has darwin as secondary', () => {
      const darwin = PLATFORM_MATRIX.find(e => e.os === 'darwin');
      assert.ok(darwin);
      assert.equal(darwin.tier, 'secondary');
    });

    it('has win32 as secondary', () => {
      const win32 = PLATFORM_MATRIX.find(e => e.os === 'win32');
      assert.ok(win32);
      assert.equal(win32.tier, 'secondary');
    });

    it('all entries require Node 22+', () => {
      for (const entry of PLATFORM_MATRIX) {
        assert.ok(entry.minNodeVersion >= 22, `${entry.os} requires Node ${entry.minNodeVersion}`);
      }
    });
  });

  describe('detectPlatform', () => {
    it('returns current platform info', () => {
      const result = detectPlatform();
      assert.ok(result.platform);
      assert.ok(result.arch);
      assert.ok(result.nodeVersion.startsWith('v'));
      assert.ok(result.nodeMajor >= 18);
      assert.ok(['primary', 'secondary', 'unsupported'].includes(result.tier));
      assert.equal(typeof result.supported, 'boolean');
    });

    it('detects Node version correctly', () => {
      const result = detectPlatform();
      const expected = parseInt(process.version.slice(1), 10);
      assert.equal(result.nodeMajor, expected);
    });
  });

  describe('checkShellAvailability', () => {
    it('reports shell as available', () => {
      const result = checkShellAvailability();
      assert.ok(result.shell);
      assert.equal(result.available, true);
    });
  });

  describe('getPlatformDegradations', () => {
    it('returns degradations for win32', () => {
      const degradations = getPlatformDegradations('win32');
      assert.ok(degradations.length > 0);
    });

    it('returns degradations for darwin', () => {
      const degradations = getPlatformDegradations('darwin');
      assert.ok(degradations.length > 0);
    });

    it('returns no degradations for linux', () => {
      const degradations = getPlatformDegradations('linux');
      assert.equal(degradations.length, 0);
    });
  });

  describe('generatePlatformReport', () => {
    it('produces a non-empty report', () => {
      const report = generatePlatformReport();
      assert.ok(report.length > 0);
      assert.ok(report.includes('Platform:'));
      assert.ok(report.includes('Node.js:'));
      assert.ok(report.includes('Support tier:'));
    });
  });
});
