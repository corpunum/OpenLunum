import fs from 'node:fs';
const N=await import('/home/user/OpenLunum/packages/core/dist/src/index.js');
const fp=s=>{try{return N.submitCandidate({sourceText:'',candidateSem:s,provenance:{extractorType:'other'}}).semanticFingerprint??null}catch(e){return 'ERR '+e.message}};
const E=new Map(fs.readFileSync(process.argv[3],'utf8').split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return[r.handle,r.frame]}));
const out={};
for(const l of fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean)){const r=JSON.parse(l); if(r.candidateSem) out[E.get(r.handle)]=fp(r.candidateSem);}
console.log(JSON.stringify(out,null,0));
const base={schema:'lunum-sem/0.1-draft',world:'real',kind:'instruction',clauses:[{predicate:'approve',negated:true,roles:{agent:{type:'actor',id:'interns'},theme:{type:'document',id:'purchase_orders'}}}]};
const ob=structuredClone(base); ob.clauses[0].modality='obligation'; const pm=structuredClone(base); pm.clauses[0].modality='permission';
console.log('prohibition as obligation+NOT', fp(ob)); console.log('prohibition as permission+NOT', fp(pm));
