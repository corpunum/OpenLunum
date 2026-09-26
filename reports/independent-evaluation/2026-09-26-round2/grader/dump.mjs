import fs from 'node:fs'; import {grade} from '/home/user/OpenLunum/scripts/research/qa-grader.mjs';
const Q=new Map(fs.readFileSync('/home/user/OpenLunum/experiments/consumer-memory-qa-v1/questions.jsonl','utf8').split('\n').filter(Boolean).map(l=>{const q=JSON.parse(l);return[q.id,q]}));
const wrong={}, distinct={};
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f,'utf8').split('\n').filter(Boolean)) { const c=JSON.parse(l); if(c.text==null) continue; const r=grade(Q.get(c.questionId),c.text); const a=String(r.answer).slice(0,140);
 if(!r.correct && c.condition.startsWith('lunum-0.1')){ const k=c.questionId+' | '+a+' | '+r.reason; wrong[k]=(wrong[k]||0)+1; }
 if(r.correct){ const k=c.questionId+' | '+a; distinct[k]=(distinct[k]||0)+1; } }
console.log('=== WRONG (excluding lunum-0.1)'); for(const[k,v]of Object.entries(wrong))console.log(v,k);
console.log('=== distinct CORRECT answers for q01,q14,q17,q20,q02,q18,q04,q05'); for(const[k,v]of Object.entries(distinct)) if(/^q(01|14|17|20|02|18|04|05|12|13) /.test(k)) console.log(v,k);
