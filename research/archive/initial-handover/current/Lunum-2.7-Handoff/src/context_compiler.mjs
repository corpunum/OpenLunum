import { classifyEligibility } from './eligibility_classifier.mjs';
import { roughTokens } from './lunum_utils.mjs';

export function renderMemoryLine(memory, mode = 'mixed', config = null) {
  if (mode === 'natural') return `- ${memory.text}`;
  if (mode === 'lunum') return `- ${memory.lunum_code}`;
  const decision = classifyEligibility(memory, config ?? undefined);
  return `- ${decision.eligible ? memory.lunum_code : memory.text}`;
}

export function compileContext(memories, options = {}) {
  const mode = options.mode || 'mixed';
  const maxMemories = options.maxMemories ?? memories.length;
  const selected = memories.slice(0, maxMemories);
  const lines = selected.map(m => renderMemoryLine(m, mode, options.config));
  const text = `Memory:\n${lines.join('\n')}`;
  return {mode,memory_count:selected.length,text,rough_tokens:roughTokens(text)};
}

export function compileAllContexts(memories, options = {}) {
  const natural=compileContext(memories,{...options,mode:'natural'}), lunum=compileContext(memories,{...options,mode:'lunum'}), mixed=compileContext(memories,{...options,mode:'mixed'});
  return {natural,lunum,mixed,ratios:{lunum:lunum.rough_tokens/Math.max(1,natural.rough_tokens),mixed:mixed.rough_tokens/Math.max(1,natural.rough_tokens)}};
}
