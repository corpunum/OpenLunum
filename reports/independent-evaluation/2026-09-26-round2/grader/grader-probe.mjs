import { grade } from '/home/user/OpenLunum/scripts/research/qa-grader.mjs';
import fs from 'node:fs';
const Q = new Map(fs.readFileSync('/home/user/OpenLunum/experiments/consumer-memory-qa-v1/questions.jsonl','utf8').split('\n').filter(Boolean).map(l=>{const q=JSON.parse(l);return [q.id,q]}));
const cases = [
 // [qid, answer, humanJudgedCorrect, note]
 ['q14','Rhea retries U-31 7 times.',true,'plain correct with id'],
 ['q14','7 times, on 2027-01-14',true,'correct with date'],
 ['q14','7 (the memory mentions it twice; both say 7)',true,'hedged correct'],
 ['q14','7 retries, i.e. 1 initial attempt plus 7 retries',true,'hedged correct w/ extra number'],
 ['q14','Seven times.',true,'word'],
 ['q14','7 times, not 14',true,'correct with explicit rejection of wrong'],
 ['q14','14 (7 + 7)',false,'wrong sum'],
 ['q14','Either 7 or 14',false,'ambiguous'],
 ['q14','7.0',true,'decimal'],
 ['q14','seventy',false,'word boundary'],
 ['q02','Below 20%',true,'percent sign'],
 ['q02','20 percent (not 15)',true,'hedged with reject token'],
 ['q02','below 20 percent; S-22 uses 15',true,'mentions other system'],
 ['q06','15 percent',true,''],
 ['q18','30 EUR',true,''],
 ['q18','€30',true,'symbol'],
 ['q18','30 EUR (the 45 EUR is from Q-83)',true,'hedged mentions reject token'],
 ['q18','EUR 30.00',true,'decimal'],
 ['q20','No, it does not say.',true,''],
 ['q20','No.',true,''],
 ['q20','The memory does not say.',true,'correct without literal no'],
 ['q20','Yes — to account Q-82',false,''],
 ['q20','It is not stated; no',true,''],
 ['q17','Mira may access the resource',true,''],
 ['q17','Mira is allowed to access',true,''],
 ['q17','Mira has permission to access the lab',true,''],
 ['q17','Mira is not permitted; she may never access it',false,''],
 ['q17','Mira cannot do anything; access is not granted',false,'negation after token'],
 ['q17','Nothing is known about access',false,'wrong'],
 ['q17','Access is denied',false,'wrong'],
 ['q17','Access',true,''],
 ['q17','Mira is allowed to read files (no access info)',false,'wrong'],
 ['q04','required',true,''],
 ['q04','Required (not merely permitted)',true,'hedged mentions reject'],
 ['q04','It is required, not permitted.',true,''],
 ['q05','permitted',true,''],
 ['q05','Permitted, not required',true,''],
 ['q12','A-62 (not A-61)',true,''],
 ['q13','E-62',true,''],
 ['q13','Not E-61; it is E-62',true,''],
 ['q16','U-31',true,''],
 ['q16','Unknown task, possibly U-31',false,'hedged guess'],
 ['q01','feature F-11',true,''],
 ['q01','No feature; F-11 is not mentioned',false,''],
 ['q15','2027-01-14',true,''],
 ['q15','14 January 2027',true,'ok but ignores requested format'],
];
let fp=0,fn=0; const rows=[];
for (const [id,a,h,n] of cases){ const r=grade(Q.get(id), JSON.stringify({answer:a})); const flag = r.correct===h?'':(r.correct?'FALSE-POS':'FALSE-NEG'); if(flag==='FALSE-POS')fp++; if(flag==='FALSE-NEG')fn++; rows.push({id,answer:a,human:h,grader:r.correct,reason:r.reason,flag}); }
for (const r of rows) console.log((r.flag||'ok').padEnd(9), r.id, JSON.stringify(r.answer), '->', r.grader, r.reason);
console.log({cases:rows.length,falsePositives:fp,falseNegatives:fn});
fs.writeFileSync('grader-probe-results.json', JSON.stringify({cases:rows,falsePositives:fp,falseNegatives:fn},null,1));
