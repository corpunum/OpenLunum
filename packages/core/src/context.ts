import { roughTokenCount } from './derive.js';
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

export function compileContext(messages: ContextMessage[], options: { mode?: ContextMode } = {}) {
  const mode = options.mode ?? 'mixed';
  const normalized = messages.map(normalizeMessage);
  const naturalMessages = normalized.map((message) => ({ role: message.role, content: message.natural }));
  const lunumMessages = normalized.map((message) => ({ role: message.role, content: message.code ?? message.natural }));
  const mixedMessages = normalized.map((message) => ({ role: message.role, content: message.code && message.meta.eligible === true ? message.code : message.natural }));
  const selectedMessages = mode === 'natural' || mode === 'shadow_mixed' ? naturalMessages : mode === 'lunum' ? lunumMessages : mixedMessages;
  const sum = (rows: Array<{ content: string }>) => rows.reduce((total, row) => total + roughTokenCount(row.content), 0);
  const naturalTokens = sum(naturalMessages);
  const lunumTokens = sum(lunumMessages);
  const mixedTokens = sum(mixedMessages);
  const selectedTokens = mode === 'lunum' ? lunumTokens : mode === 'natural' ? naturalTokens : mixedTokens;
  return {
    version: 'lunum-context/0.1-draft', mode, tokenCounter: 'estimate/char4', selectedMessages, naturalMessages, lunumMessages, mixedMessages,
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
