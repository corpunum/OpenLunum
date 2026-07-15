import { roughTokenCount } from './derive.mjs';

function normalizeMessage(message) {
  const natural = String(message.content ?? message.source?.text ?? '');
  const recordCode = message.record?.renderings ? Object.values(message.record.renderings)[0]?.code : null;
  const code = message.lunumCode ?? message.lunum_code ?? recordCode ?? null;
  const meta = message.lunumMeta ?? message.lunum_meta ?? message.record?.policy ?? {};
  return { role: message.role || 'user', natural, code, meta };
}

export function compileContext(messages, { mode = 'mixed' } = {}) {
  const normalized = messages.map(normalizeMessage);
  const naturalMessages = normalized.map((m) => ({ role: m.role, content: m.natural }));
  const lunumMessages = normalized.map((m) => ({ role: m.role, content: m.code || m.natural }));
  const mixedMessages = normalized.map((m) => ({ role: m.role, content: m.code && m.meta?.eligible === true ? m.code : m.natural }));
  const selectedMessages = mode === 'natural' || mode === 'shadow_mixed' ? naturalMessages : mode === 'lunum' ? lunumMessages : mixedMessages;
  const sum = (rows) => rows.reduce((n, row) => n + roughTokenCount(row.content), 0);
  const naturalTokens = sum(naturalMessages);
  const lunumTokens = sum(lunumMessages);
  const mixedTokens = sum(mixedMessages);
  return {
    version: 'lunum-context/0.1-draft', mode, selectedMessages, naturalMessages, lunumMessages, mixedMessages,
    naturalTokens, lunumTokens, mixedTokens,
    ratio: naturalTokens ? (mode === 'lunum' ? lunumTokens : mixedTokens) / naturalTokens : 1,
    estimatedSavings: naturalTokens ? 1 - ((mode === 'lunum' ? lunumTokens : mixedTokens) / naturalTokens) : 0
  };
}

export function compileLunumShadowContext(messages) {
  const result = compileContext(messages, { mode: 'shadow_mixed' });
  return {
    version: result.version,
    naturalMessages: result.naturalMessages,
    mixedMessages: result.mixedMessages,
    naturalTokens: result.naturalTokens,
    mixedTokens: result.mixedTokens,
    ratio: result.naturalTokens ? result.mixedTokens / result.naturalTokens : 1,
    estimatedSavings: result.naturalTokens ? 1 - result.mixedTokens / result.naturalTokens : 0
  };
}
