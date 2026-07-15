const ELIGIBLE = new Set(['preference','simple_fact','tool_event','project_state','retrieval_rule','system_fact','benchmark_result']);
const NATURAL_ONLY = new Set(['conditional_instruction','safety_constraint','safety_event','exact_quote','code','command','file_path','url','legal_text','medical_text','social_nuance','ambiguous','complex_modality']);
const EXACT_RE = /```|https?:\/\/|(?:^|\s)(?:[A-Za-z]:\\|\/)[^\s]+|\b(?:rm|sudo|curl|wget|git|npm|pnpm|python|node)\s+-?[^\n]*/u;

export function classifyEligibility({ category = 'unknown', risk = 'unknown', confidence = 0, sourceText = '', semantic = true } = {}) {
  const reasons = [];
  if (!semantic) reasons.push('no_validated_semantics');
  if (confidence < 0.9) reasons.push('confidence_below_0.90');
  if (risk !== 'low') reasons.push(`risk_${risk}`);
  if (!ELIGIBLE.has(category)) reasons.push(NATURAL_ONLY.has(category) ? `natural_only_category_${category}` : `category_not_allowlisted_${category}`);
  if (EXACT_RE.test(String(sourceText || ''))) reasons.push('exact_or_executable_text_detected');
  return { eligible: reasons.length === 0, category, risk, confidence, reasons };
}
