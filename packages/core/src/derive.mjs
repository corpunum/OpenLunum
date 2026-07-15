import { SEM_SCHEMA, RECORD_SCHEMA, DEFAULT_RENDERER } from './constants.mjs';
import { canonicalizeSem } from './canonicalize.mjs';
import { fingerprintSem, surfaceFingerprint } from './fingerprint.mjs';
import { renderSem } from './render.mjs';
import { classifyEligibility } from './policy.mjs';

const EN_STOP = new Set('the a an is are was were be been being to of and or for in on at with from by this that these those it its as do does did have has had'.split(' '));

export function roughTokenCount(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

export function surfaceTelegraph(text) {
  const tokens = String(text ?? '').normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}_-]+/gu) || [];
  return tokens.filter((token) => !EN_STOP.has(token)).join(' ');
}

export function createRecord({ sourceText, sourceLanguage = null, role = null, sourceRef = null, sem, category, risk = 'unknown', confidence = 0, renderer = DEFAULT_RENDERER } = {}) {
  const canonical = canonicalizeSem(sem);
  const rendering = renderSem(canonical, { profile: renderer });
  const policy = classifyEligibility({ category: category || canonical.kind, risk, confidence, sourceText, semantic: true });
  return {
    recordVersion: RECORD_SCHEMA,
    source: { text: String(sourceText ?? ''), language: sourceLanguage, role, ref: sourceRef },
    sem: canonical,
    fingerprint: fingerprintSem(canonical),
    renderings: { [renderer]: { code: rendering.code, profile: renderer, tokens: null } },
    policy,
    meta: { generatedAt: new Date().toISOString(), semantic: true }
  };
}

export function deriveSurfaceSidecar({ role, content, category = 'unknown', risk = 'unknown', confidence = 0.5 } = {}) {
  const text = String(content ?? '').trim();
  if (!text) return { lunumCode: null, lunumSem: null, lunumFp: null, lunumMeta: { eligible: false, reasons: ['empty'] } };
  const code = surfaceTelegraph(text);
  const policy = classifyEligibility({ category, risk, confidence, sourceText: text, semantic: false });
  return {
    lunumCode: code || null,
    lunumSem: {
      schema: SEM_SCHEMA,
      kind: 'surface_telegraph',
      world: role === 'system' ? 'tool' : 'real',
      clauses: [{ predicate: 'surface', roles: { text: { type: 'text', value: text } }, negated: false }],
      annotations: { semantic: false, warning: 'Heuristic surface record; not language-independent canonical semantics.' }
    },
    lunumFp: surfaceFingerprint(text),
    lunumMeta: { ...policy, semantic: false, renderer: 'surface-telegraph/0.1', sourceChars: text.length, codeChars: code.length }
  };
}

export function deriveLunumSidecar({ role, content, sem = null, category = null, risk = 'unknown', confidence = null } = {}) {
  if (!sem) return deriveSurfaceSidecar({ role, content, category: category || 'unknown', risk, confidence: confidence ?? 0.5 });
  const record = createRecord({ sourceText: content, role, sem, category: category || sem.kind, risk, confidence: confidence ?? 1 });
  const rendering = Object.values(record.renderings)[0];
  return {
    lunumCode: rendering.code,
    lunumSem: record.sem,
    lunumFp: record.fingerprint,
    lunumMeta: { ...record.policy, semantic: true, renderer: rendering.profile, recordVersion: record.recordVersion }
  };
}
