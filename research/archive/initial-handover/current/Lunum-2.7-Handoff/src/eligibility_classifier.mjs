import configDefault from '../config/lunum_2_7_config.json' assert { type: 'json' };
export function classifyEligibility(memory, config = configDefault) {
  const e=config.eligibility||{}, reasons=[];
  if(!memory.lunum_code)reasons.push('missing_lunum_code');
  if((memory.confidence??0)<(e.min_confidence??0.9))reasons.push('low_confidence');
  if(e.allowed_risk&&!e.allowed_risk.includes(memory.risk))reasons.push(`risk_${memory.risk}`);
  if(e.blocked_categories&&e.blocked_categories.includes(memory.category))reasons.push(`blocked_category_${memory.category}`);
  if(e.allowed_categories&&!e.allowed_categories.includes(memory.category))reasons.push(`category_not_allowed_${memory.category}`);
  const eligible=reasons.length===0;
  return {eligible,reasons,mode:eligible?'lunum':'natural'};
}
export function annotateMemories(memories, config=configDefault){return memories.map(m=>({...m,lunum_context:classifyEligibility(m,config)}));}
