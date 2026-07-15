export function roughTokens(text){return (String(text).match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)||[]).length;}
export function readJsonl(text){return String(text).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
export function normalize(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
export function scoreAnswer(answer,acceptable=[]){const a=normalize(answer);if(!a)return 0;for(const ok of acceptable){const n=normalize(ok);if(a.includes(n)||n.includes(a))return 1;}return 0;}
