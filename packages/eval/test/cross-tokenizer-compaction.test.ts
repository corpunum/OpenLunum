import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokenCount,
  compareCrossTokenizer,
  TOKENIZER_PROFILES,
  PROFILE_VERSIONS,
  type TokenizerProfile,
} from '../src/cross-tokenizer-compaction.js';

describe('cross-tokenizer-compaction', () => {
  const sampleNatural = 'The quick brown fox jumps over the lazy dog. This sentence contains multiple words for testing token estimation across different tokenizer families.';
  const sampleLunum = '{"pred":"jump","roles":{"agent":"fox","patient":"dog"}}';

  describe('estimateTokenCount', () => {
    it('returns positive number for non-empty text', () => {
      for (const profile of TOKENIZER_PROFILES) {
        const count = estimateTokenCount(sampleNatural, profile);
        assert.ok(count > 0, `Expected positive count for ${profile.family}, got ${count}`);
      }
    });

    it('returns 0 for empty text', () => {
      for (const profile of TOKENIZER_PROFILES) {
        const count = estimateTokenCount('', profile);
        assert.equal(count, 0, `Expected 0 for empty text with ${profile.family}`);
      }
    });

    it('different tokenizer profiles give different token counts for same text', () => {
      const qwen = TOKENIZER_PROFILES.find(p => p.family === 'qwen')!;
      const gemma = TOKENIZER_PROFILES.find(p => p.family === 'gemma')!;
      const qwenCount = estimateTokenCount(sampleNatural, qwen);
      const gemmaCount = estimateTokenCount(sampleNatural, gemma);
      assert.notEqual(qwenCount, gemmaCount, 'Qwen and Gemma should produce different counts');
    });
  });

  describe('compareCrossTokenizer', () => {
    it('produces results for all profiles', () => {
      const report = compareCrossTokenizer(sampleNatural, sampleLunum);
      assert.equal(report.results.length, TOKENIZER_PROFILES.length);
      for (const result of report.results) {
        assert.ok(result.profile);
        assert.ok(typeof result.naturalTokens === 'number');
        assert.ok(typeof result.lunumTokens === 'number');
        assert.ok(typeof result.compressionRatio === 'number');
        assert.ok(typeof result.savingsPercent === 'number');
      }
    });

    it('compressionRatio < 1 when lunum is shorter than natural', () => {
      const report = compareCrossTokenizer(sampleNatural, sampleLunum);
      for (const result of report.results) {
        assert.ok(
          result.compressionRatio < 1,
          `Expected compressionRatio < 1 for ${result.profile.family}, got ${result.compressionRatio}`,
        );
      }
    });

    it('bestFamily has highest savings, worstFamily has lowest', () => {
      const report = compareCrossTokenizer(sampleNatural, sampleLunum);
      const best = report.results.find(r => r.profile.family === report.bestFamily)!;
      const worst = report.results.find(r => r.profile.family === report.worstFamily)!;
      assert.ok(
        best.savingsPercent >= worst.savingsPercent,
        `Best savings (${best.savingsPercent}) should be >= worst (${worst.savingsPercent})`,
      );
    });

    it('accepts custom profiles array', () => {
      const custom: TokenizerProfile[] = [
        { family: 'generic', name: 'Custom', bytesPerToken: 4.0, vocabSize: 50000 },
      ];
      const report = compareCrossTokenizer(sampleNatural, sampleLunum, custom);
      assert.equal(report.results.length, 1);
      assert.equal(report.results[0]!.profile.name, 'Custom');
    });
  });

  describe('TOKENIZER_PROFILES', () => {
    it('has 4 entries', () => {
      assert.equal(TOKENIZER_PROFILES.length, 4);
    });
  });

  describe('PROFILE_VERSIONS', () => {
    it('has matching entries for each tokenizer profile', () => {
      assert.equal(PROFILE_VERSIONS.length, TOKENIZER_PROFILES.length);
      for (const profile of TOKENIZER_PROFILES) {
        const version = PROFILE_VERSIONS.find(v => v.family === profile.family);
        assert.ok(version, `Missing version entry for ${profile.family}`);
        assert.equal(version.profileName, profile.name);
        assert.equal(version.bytesPerToken, profile.bytesPerToken);
        assert.equal(version.version, '1.0');
        assert.ok(version.validatedAt.length > 0);
      }
    });
  });
});
