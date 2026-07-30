import { readFileSync } from 'node:fs';

export const RETENTION_AUDIT_VERSION = '0.1.0' as const;

export interface RetentionAuditReport {
  version: typeof RETENTION_AUDIT_VERSION;
  datasetPath: string;
  totalRecords: number;
  uniqueLanguages: string[];
  languageCount: number;
  semanticCategories: string[];
  categoryCount: number;
  nestingLevelsFound: number[];
  maxNestingLevel: number;
  nestingLevelCount: number;
  passed: boolean;
  checks: {
    totalRecordsPass: boolean;
    languageCountPass: boolean;
    categoryCountPass: boolean;
    nestingLevelsPass: boolean;
  };
}

export function computeClauseDepth(clause: unknown): number {
  if (!clause || typeof clause !== 'object') return 0;
  const c = clause as Record<string, unknown>;
  const children: unknown[] = [];
  if (Array.isArray(c.conditions)) children.push(...c.conditions);
  if (Array.isArray(c.consequences)) children.push(...c.consequences);
  if (Array.isArray(c.clauses)) children.push(...c.clauses);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map(computeClauseDepth));
}

export function computeSemDepth(expectedSem: unknown): number {
  if (!expectedSem || typeof expectedSem !== 'object') return 0;
  const sem = expectedSem as Record<string, unknown>;
  if (!Array.isArray(sem.clauses) || sem.clauses.length === 0) return 0;
  return Math.max(...sem.clauses.map(computeClauseDepth));
}

export function auditRetentionDataset(datasetPath: string): RetentionAuditReport {
  const content = readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(content);

  if (!Array.isArray(dataset)) {
    throw new Error(`Invalid retention dataset at ${datasetPath}: expected JSON array`);
  }

  const totalRecords = dataset.length;
  const languagesSet = new Set<string>();
  const categoriesSet = new Set<string>();
  const nestingLevelsSet = new Set<number>();

  for (const record of dataset) {
    if (record.sourceLanguage && typeof record.sourceLanguage === 'string') {
      languagesSet.add(record.sourceLanguage.toLowerCase());
    }

    if (record.expectedSem?.kind && typeof record.expectedSem.kind === 'string') {
      categoriesSet.add(record.expectedSem.kind);
    }
    if (record.expectedRetention?.category && typeof record.expectedRetention.category === 'string') {
      categoriesSet.add(record.expectedRetention.category);
    }
    if (record.semanticCategory && typeof record.semanticCategory === 'string') {
      categoriesSet.add(record.semanticCategory);
    }
    if (record.semanticGroup && typeof record.semanticGroup === 'string') {
      categoriesSet.add(record.semanticGroup);
    }

    const calculatedDepth = computeSemDepth(record.expectedSem);
    if (calculatedDepth > 0) {
      nestingLevelsSet.add(calculatedDepth);
    }
    if (typeof record.expectedRetention?.nestingLevel === 'number') {
      nestingLevelsSet.add(record.expectedRetention.nestingLevel);
    }
  }

  const uniqueLanguages = Array.from(languagesSet).sort();
  const languageCount = uniqueLanguages.length;

  const semanticCategories = Array.from(categoriesSet).sort();
  const categoryCount = semanticCategories.length;

  const nestingLevelsFound = Array.from(nestingLevelsSet).sort((a, b) => a - b);
  const maxNestingLevel = nestingLevelsFound.length > 0 ? Math.max(...nestingLevelsFound) : 0;
  const nestingLevelCount = nestingLevelsFound.length;

  const totalRecordsPass = totalRecords >= 200;
  const languageCountPass = languageCount >= 8;
  const categoryCountPass = categoryCount >= 10;
  const nestingLevelsPass = nestingLevelCount >= 3;

  const passed = totalRecordsPass && languageCountPass && categoryCountPass && nestingLevelsPass;

  return {
    version: RETENTION_AUDIT_VERSION,
    datasetPath,
    totalRecords,
    uniqueLanguages,
    languageCount,
    semanticCategories,
    categoryCount,
    nestingLevelsFound,
    maxNestingLevel,
    nestingLevelCount,
    passed,
    checks: {
      totalRecordsPass,
      languageCountPass,
      categoryCountPass,
      nestingLevelsPass,
    },
  };
}
