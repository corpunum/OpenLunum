import crypto from 'node:crypto';
import { FP_VERSION } from './constants.js';
import { canonicalizeSem, stableStringify } from './canonicalize.js';

function boundedLength(length: number): number {
  return Math.max(16, Math.min(64, Math.trunc(length)));
}

export function fingerprintSem(sem: unknown, options: { length?: number } = {}): string {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  return `lfp:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 32))}`;
}

export function surfaceFingerprint(text: unknown, options: { length?: number } = {}): string {
  const normalized = String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return `lsf:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 24))}`;
}
