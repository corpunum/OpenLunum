import { ROUGH_TOKEN_COUNTER, type TokenCounter } from './derive.js';
import type { ContextMessage, EligibilityDecision } from './types.js';

export type ContextMode = 'natural' | 'lunum' | 'mixed' | 'shadow_mixed';

function normalizeMessage(message: ContextMessage): { role: string; natural: string; code: string | null; meta: Partial<EligibilityDecision> } {
  const natural = String(message.content ?? message.source?.text ?? '');
  const recordCode = message.record?.renderings ? Object.values(message.record.renderings)[0]?.code : null;
  return {
    role: message.role ?? 'user',
    natural,
    code: message.lunumCode ?? message.lunum_code ?? recordCode ?? null,
    meta: message.lunumMeta ?? message.lunum_meta ?? message.record?.policy ?? {}
  };
}

function canServeSemanticCode(message: ReturnType<typeof normalizeMessage>, original: ContextMessage): boolean {
  if (!message.code || message.meta.eligible !== true) return false;
  // A record carrying semantic content must prove promotion.  The legacy
  // message-only shape has no trust envelope and remains compatible with the
  // existing caller contract, but cannot be mistaken for a durable record.
  if (original.record?.meta && original.record.meta.semantic === true) {
    return original.record.meta.semanticPromoted === true
      && original.record.policy?.eligible === true;
  }
  return true;
}

export function compileContext(messages: ContextMessage[], options: { mode?: ContextMode; tokenCounter?: TokenCounter } = {}) {
  const mode = options.mode ?? 'mixed';
  const counter = options.tokenCounter ?? ROUGH_TOKEN_COUNTER;
  const counterLabel = options.tokenCounter ? 'exact' : 'estimate/char4';
  const normalized = messages.map((message) => ({ value: normalizeMessage(message), original: message }));
  const naturalMessages = normalized.map(({ value: message }) => ({ role: message.role, content: message.natural }));
  const lunumMessages = normalized.map(({ value: message, original }) => ({ role: message.role, content: canServeSemanticCode(message, original) ? message.code! : message.natural }));
  const mixedMessages = normalized.map(({ value: message, original }) => ({ role: message.role, content: canServeSemanticCode(message, original) ? message.code! : message.natural }));
  const selectedMessages = mode === 'natural' || mode === 'shadow_mixed' ? naturalMessages : mode === 'lunum' ? lunumMessages : mixedMessages;
  const sum = (rows: Array<{ content: string }>) => rows.reduce((total, row) => total + counter(row.content), 0);
  const naturalTokens = sum(naturalMessages);
  const lunumTokens = sum(lunumMessages);
  const mixedTokens = sum(mixedMessages);
  const selectedTokens = mode === 'lunum' ? lunumTokens : mode === 'natural' ? naturalTokens : mixedTokens;
  return {
    version: 'lunum-context/0.1-draft', mode, tokenCounter: counterLabel, selectedMessages, naturalMessages, lunumMessages, mixedMessages,
    naturalTokens, lunumTokens, mixedTokens,
    ratio: naturalTokens ? selectedTokens / naturalTokens : 1,
    estimatedSavings: naturalTokens ? 1 - selectedTokens / naturalTokens : 0
  };
}

export function compileLunumShadowContext(messages: ContextMessage[]) {
  const result = compileContext(messages, { mode: 'shadow_mixed' });
  return {
    version: result.version, naturalMessages: result.naturalMessages, mixedMessages: result.mixedMessages,
    naturalTokens: result.naturalTokens, mixedTokens: result.mixedTokens,
    ratio: result.naturalTokens ? result.mixedTokens / result.naturalTokens : 1,
    estimatedSavings: result.naturalTokens ? 1 - result.mixedTokens / result.naturalTokens : 0
  };
}
