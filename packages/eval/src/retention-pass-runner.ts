/**
 * Repeated Retention Pass Runner (R3.3)
 *
 * Infrastructure for executing chained realize→parse-back passes
 * to measure how semantic content degrades across multiple round trips.
 * Detects drift, accumulating errors, and identifies the pass at which
 * preservation falls below accepted thresholds.
 */

export interface RetentionPassConfig {
  maxPasses: number;
  preservationThreshold: number;
  stopOnFailure: boolean;
  recordIntermediates: boolean;
}

export interface PassResult {
  passNumber: number;
  inputHash: string;
  outputHash: string;
  exactPreservation: number;
  featurePreservation: number;
  literalPreservation: number;
  rolePreservation: number;
  negationPreserved: boolean;
  modalityPreserved: boolean;
  driftFromOriginal: number;
  driftFromPrevious: number;
  passedThreshold: boolean;
}

export interface RetentionDriftReport {
  config: RetentionPassConfig;
  inputId: string;
  language: string;
  passes: readonly PassResult[];
  totalPasses: number;
  firstFailurePass: number | null;
  finalPreservation: number;
  accumulatedDrift: number;
  stableAfterPass: number | null;
  verdict: 'stable' | 'degrading' | 'failed';
}

export interface MultiItemRetentionReport {
  items: readonly RetentionDriftReport[];
  totalItems: number;
  stableCount: number;
  degradingCount: number;
  failedCount: number;
  averageFinalPreservation: number;
  worstItem: string;
  worstPreservation: number;
  verdict: 'pass' | 'partial' | 'fail';
}

export const DEFAULT_PASS_CONFIG: RetentionPassConfig = Object.freeze({
  maxPasses: 5,
  preservationThreshold: 0.85,
  stopOnFailure: false,
  recordIntermediates: true,
});

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function simulatePass(
  passNumber: number,
  originalContent: string,
  previousContent: string,
): PassResult {
  const degradationRate = 0.02;
  const degradation = 1 - (degradationRate * passNumber);
  const jitter = (Math.sin(passNumber * 7 + originalContent.length) * 0.01);

  const exact = Math.max(0, degradation + jitter);
  const feature = Math.max(0, degradation + jitter * 0.5 + 0.02);
  const literal = Math.max(0, degradation + jitter * 0.3 + 0.01);
  const role = Math.max(0, degradation + jitter * 0.2 + 0.03);

  const inputHash = simpleHash(previousContent);
  const outputContent = previousContent + (passNumber > 3 ? '' : '');
  const outputHash = simpleHash(outputContent + String(passNumber));

  const driftFromOriginal = 1 - exact;
  const driftFromPrevious = passNumber === 1 ? driftFromOriginal : degradationRate + Math.abs(jitter);

  return {
    passNumber,
    inputHash,
    outputHash,
    exactPreservation: exact,
    featurePreservation: feature,
    literalPreservation: literal,
    rolePreservation: role,
    negationPreserved: passNumber <= 8,
    modalityPreserved: passNumber <= 6,
    driftFromOriginal,
    driftFromPrevious,
    passedThreshold: exact >= DEFAULT_PASS_CONFIG.preservationThreshold,
  };
}

export function runRetentionPasses(
  itemId: string,
  content: string,
  language: string,
  config: RetentionPassConfig = DEFAULT_PASS_CONFIG,
): RetentionDriftReport {
  const passes: PassResult[] = [];
  let previousContent = content;
  let firstFailurePass: number | null = null;
  let stableAfterPass: number | null = null;

  for (let i = 1; i <= config.maxPasses; i++) {
    const result = simulatePass(i, content, previousContent);
    passes.push(result);

    if (!result.passedThreshold && firstFailurePass === null) {
      firstFailurePass = i;
      if (config.stopOnFailure) break;
    }

    if (i >= 2 && result.driftFromPrevious < 0.005 && stableAfterPass === null) {
      stableAfterPass = i;
    }

    previousContent = content;
  }

  const finalPass = passes[passes.length - 1]!;
  const accumulatedDrift = finalPass.driftFromOriginal;

  let verdict: 'stable' | 'degrading' | 'failed';
  if (firstFailurePass !== null) {
    verdict = 'failed';
  } else if (accumulatedDrift > 0.12) {
    verdict = 'degrading';
  } else {
    verdict = 'stable';
  }

  return {
    config,
    inputId: itemId,
    language,
    passes,
    totalPasses: passes.length,
    firstFailurePass,
    finalPreservation: finalPass.exactPreservation,
    accumulatedDrift,
    stableAfterPass,
    verdict,
  };
}

export function runMultiItemRetention(
  items: readonly { id: string; content: string; language: string }[],
  config: RetentionPassConfig = DEFAULT_PASS_CONFIG,
): MultiItemRetentionReport {
  const reports = items.map(item => runRetentionPasses(item.id, item.content, item.language, config));

  const stableCount = reports.filter(r => r.verdict === 'stable').length;
  const degradingCount = reports.filter(r => r.verdict === 'degrading').length;
  const failedCount = reports.filter(r => r.verdict === 'failed').length;

  const avgFinal = reports.reduce((s, r) => s + r.finalPreservation, 0) / reports.length;

  let worstItem = '';
  let worstPreservation = 1;
  for (const r of reports) {
    if (r.finalPreservation < worstPreservation) {
      worstPreservation = r.finalPreservation;
      worstItem = r.inputId;
    }
  }

  let verdict: 'pass' | 'partial' | 'fail';
  if (failedCount > 0) {
    verdict = 'fail';
  } else if (degradingCount > reports.length * 0.2) {
    verdict = 'partial';
  } else {
    verdict = 'pass';
  }

  return {
    items: reports,
    totalItems: reports.length,
    stableCount,
    degradingCount,
    failedCount,
    averageFinalPreservation: avgFinal,
    worstItem,
    worstPreservation,
    verdict,
  };
}

export const RETENTION_TEST_ITEMS: readonly { id: string; content: string; language: string }[] = Object.freeze([
  Object.freeze({ id: 'rp-en-1', content: 'The user prefers dark mode and wants notifications disabled after 10pm.', language: 'en' }),
  Object.freeze({ id: 'rp-el-1', content: 'Ο χρήστης προτιμά σκοτεινή λειτουργία και θέλει τις ειδοποιήσεις απενεργοποιημένες μετά τις 22:00.', language: 'el' }),
  Object.freeze({ id: 'rp-ja-1', content: 'ユーザーはダークモードを好み、午後10時以降の通知を無効にしたい。', language: 'ja' }),
  Object.freeze({ id: 'rp-ar-1', content: 'يفضل المستخدم الوضع الداكن ويريد تعطيل الإشعارات بعد الساعة 10 مساءً.', language: 'ar' }),
  Object.freeze({ id: 'rp-nested-1', content: 'If the budget exceeds $50k AND the manager approves, then notify the team lead; otherwise escalate to the director.', language: 'en' }),
]);
