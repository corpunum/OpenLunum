import fs from 'node:fs';
const N=await import(process.argv[2]), O=await import(process.argv[3]);
const fp=(M,s)=>{try{return M.submitCandidate({sourceText:'',candidateSem:s,provenance:{extractorType:'other'}}).semanticFingerprint??null}catch{return null}};
const out={};
for(const f of ['datasets/adversarial/critical-semantic-differences-v1.jsonl','datasets/adversarial/safety-critical-suites-v1.jsonl']){
 let pairs=0,both=0,bothOld=0,collide=0,sameExpected=0; const col=[];
 for(const l of fs.readFileSync(f,'utf8').split('\n').filter(Boolean)){const r=JSON.parse(l); if(!r.semA||!r.semB)continue; pairs++;
  const a=fp(N,r.semA),b=fp(N,r.semB); if(fp(O,r.semA)&&fp(O,r.semB))bothOld++;
  if(a&&b){both++; if(r.expectedCaught===false){sameExpected++; continue;} if(a===b){collide++;col.push(r.id)}}}
 out[f]={pairs,bothIdentityNew:both,bothIdentityOld:bothOld,expectedCaughtFalse:sameExpected,collisions:collide,col};}
console.log(JSON.stringify(out,null,1));
