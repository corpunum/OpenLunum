// Shared detector (2026-10-16). See experiments/local-extractor-pilot-v1/RESULTS.md.
// A parse is a "sentence copy" when one filler string carries most of the source sentence
// (>= 90% of its folded characters). Such a filler hashes the same on every run and in no other
// language, so it inflates run-to-run stability without representing structure.
const fold = (s) => String(s).normalize('NFKC').toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]+/gu, '');
function strings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['type', 'schema', 'world', 'kind', 'predicate', 'modality'].includes(k)) strings(x, out);
  return out;
}
export function isSentenceCopy(sourceText, sem, threshold = 0.9) {
  const src = fold(sourceText);
  if (!src || !sem?.clauses) return false;
  const roleStrings = sem.clauses.flatMap((c) => strings(c.roles ?? {}, []));
  return roleStrings.some((s) => { const f = fold(s); return f.length >= threshold * src.length && src.includes(f.slice(0, Math.max(1, Math.floor(f.length * 0.5)))); });
}
