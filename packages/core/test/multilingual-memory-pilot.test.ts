import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MULTILINGUAL_PROBES,
  detectNormalizationForm,
  simulateMemoryOperation,
  runMultilingualPilot,
  type MultilingualProbe,
} from '../src/multilingual-memory-pilot.js';

describe('multilingual-memory-pilot', () => {
  describe('MULTILINGUAL_PROBES', () => {
    it('has 11 probes', () => {
      assert.equal(MULTILINGUAL_PROBES.length, 11);
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(MULTILINGUAL_PROBES));
    });

    it('includes RTL probe', () => {
      const rtl = MULTILINGUAL_PROBES.filter(p => p.isRTL);
      assert.ok(rtl.length >= 1);
    });

    it('includes CJK probes', () => {
      const cjk = MULTILINGUAL_PROBES.filter(p => p.scriptFamily === 'cjk');
      assert.ok(cjk.length >= 2);
    });

    it('includes mixed-script probe', () => {
      const mixed = MULTILINGUAL_PROBES.filter(p => p.scriptFamily === 'mixed');
      assert.ok(mixed.length >= 1);
    });
  });

  describe('detectNormalizationForm', () => {
    it('detects NFC', () => {
      const nfc = 'é'; // é precomposed
      assert.equal(detectNormalizationForm(nfc), 'NFC');
    });

    it('detects NFD', () => {
      const nfd = 'é'; // e + combining acute
      assert.equal(detectNormalizationForm(nfd), 'NFD');
    });

    it('returns unknown for simple ASCII', () => {
      const result = detectNormalizationForm('hello');
      assert.ok(['NFC', 'NFKC', 'unknown'].includes(result));
    });
  });

  describe('simulateMemoryOperation', () => {
    const probe: MultilingualProbe = {
      id: 'test-probe',
      language: 'el',
      scriptFamily: 'greek',
      isRTL: false,
      content: 'Ελληνικά κείμενο',
      hasCombiningMarks: false,
      hasEmoji: false,
    };

    it('preserves content on store', () => {
      const result = simulateMemoryOperation(probe, 'store');
      assert.ok(result.preserved);
      assert.ok(result.byteLengthMatch);
    });

    it('preserves content on retrieve', () => {
      const result = simulateMemoryOperation(probe, 'retrieve');
      assert.ok(result.preserved);
    });

    it('preserves content on round-trip', () => {
      const result = simulateMemoryOperation(probe, 'round-trip');
      assert.ok(result.preserved);
    });

    it('handles update operation', () => {
      const result = simulateMemoryOperation(probe, 'update');
      assert.ok(result.preserved);
      assert.ok(result.outputContent.includes('[updated]'));
    });

    it('notes RTL text', () => {
      const rtlProbe: MultilingualProbe = {
        ...probe,
        isRTL: true,
        content: 'نص عربي',
        scriptFamily: 'arabic',
        language: 'ar',
        hasCombiningMarks: true,
      };
      const result = simulateMemoryOperation(rtlProbe, 'store');
      assert.ok(result.notes.includes('RTL'));
      assert.ok(result.notes.includes('combining marks'));
    });
  });

  describe('runMultilingualPilot', () => {
    it('runs all probes through all operations', () => {
      const report = runMultilingualPilot();
      assert.equal(report.results.length, 11 * 4); // 11 probes * 4 operations
    });

    it('has 100% preservation rate for simulation', () => {
      const report = runMultilingualPilot();
      assert.equal(report.overallPreservationRate, 1);
    });

    it('produces pass verdict', () => {
      const report = runMultilingualPilot();
      assert.equal(report.verdict, 'pass');
    });

    it('breaks down by script family', () => {
      const report = runMultilingualPilot();
      assert.ok('latin' in report.byScriptFamily);
      assert.ok('cjk' in report.byScriptFamily);
      assert.ok('arabic' in report.byScriptFamily);
      assert.ok('greek' in report.byScriptFamily);
    });

    it('breaks down by operation', () => {
      const report = runMultilingualPilot();
      assert.ok('store' in report.byOperation);
      assert.ok('retrieve' in report.byOperation);
      assert.ok('update' in report.byOperation);
      assert.ok('round-trip' in report.byOperation);
    });

    it('reports RTL preservation rate', () => {
      const report = runMultilingualPilot();
      assert.equal(report.rtlPreservationRate, 1);
    });

    it('accepts custom probes', () => {
      const customProbes: MultilingualProbe[] = [
        {
          id: 'custom-1',
          language: 'en',
          scriptFamily: 'latin',
          isRTL: false,
          content: 'Custom test',
          hasCombiningMarks: false,
          hasEmoji: false,
        },
      ];
      const report = runMultilingualPilot(customProbes);
      assert.equal(report.results.length, 4);
    });
  });
});
