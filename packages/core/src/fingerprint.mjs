import crypto from 'node:crypto';
import { FP_VERSION } from './constants.mjs';
import { canonicalizeSem, stableStringify } from './canonicalize.mjs';

export function fingerprintSem(sem, { length = 32 } = {}) {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  return `lfp:${FP_VERSION}:sha256:${digest.slice(0, Math.max(16, Math.min(64, length)))}`;
}

export function surfaceFingerprint(text, { length = 24 } = {}) {
  const normalized = String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return `lsf:${FP_VERSION}:sha256:${digest.slice(0, Math.max(16, Math.min(64, length)))}`;
}
