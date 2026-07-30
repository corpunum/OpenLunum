import fs from 'node:fs';

export const COVERAGE_VERSION = '0.1.0';

export interface CoverageReport {
  languageCounts: Record<string, number>;
  totalItems: number;
  missingLanguages: string[];
  verdict: 'pass' | 'fail';
}

const REQUIRED_LANGUAGES = [
  'en',
  'el',
  'es',
  'id',
  'ja',
  'ko',
  'zh',
  'ar',
  'pt',
  'fr',
  'de',
  'ru',
] as const;

export function auditLanguageCoverage(datasetPath: string): CoverageReport {
  const content = fs.readFileSync(datasetPath, 'utf8');
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);

  const languageCounts: Record<string, number> = {};
  let totalItems = 0;

  for (const line of lines) {
    const item = JSON.parse(line) as {
      language?: string;
      sourceLanguage?: string;
      tags?: string[];
    };
    totalItems++;
    const rawLang =
      item.language ??
      item.sourceLanguage ??
      (Array.isArray(item.tags) ? item.tags[1] : undefined);
    if (rawLang && typeof rawLang === 'string') {
      const lang = rawLang.toLowerCase();
      languageCounts[lang] = (languageCounts[lang] ?? 0) + 1;
    }
  }

  const missingLanguages: string[] = [];
  for (const reqLang of REQUIRED_LANGUAGES) {
    const count = languageCounts[reqLang] ?? 0;
    if (count < 8) {
      missingLanguages.push(reqLang);
    }
  }

  const hasAllLanguages = missingLanguages.length === 0;
  const hasMinTotal = totalItems >= 96;
  const hasMinLangCount = Object.keys(languageCounts).length >= 12;

  const verdict: 'pass' | 'fail' =
    hasAllLanguages && hasMinTotal && hasMinLangCount ? 'pass' : 'fail';

  return {
    languageCounts,
    totalItems,
    missingLanguages,
    verdict,
  };
}
