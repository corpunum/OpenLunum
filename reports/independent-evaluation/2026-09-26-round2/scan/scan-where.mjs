import fs from 'node:fs'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const [oldIdx,newIdx,root]=process.argv.slice(2); const O=await import(oldIdx),N=await import(newIdx);
const fp=(M,sem)=>{try{return M.submitCandidate({sourceText:'',candidateSem:sem,provenance:{extractorType:'other'}}).semanticFingerprint}catch{return null}};
const gained=[]; let file;
function visit(v){ if(!v||typeof v!=='object')return; if(Array.isArray(v))return v.forEach(visit);
 if(typeof v.schema==='string'&&v.schema.startsWith('lunum-sem')&&Array.isArray(v.clauses)){const a=fp(O,v),b=fp(N,v); if(!a&&b) gained.push({file, preds:v.clauses.map(c=>c.predicate+'('+Object.keys(c.roles??{}).join(',')+')').join('; ')});}
 for(const x of Object.values(v))visit(x);}
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()){if(!['node_modules','dist','.git'].includes(e.name))walk(p)} else if(/\.jsonl?$/.test(e.name)){file=path.relative(root,p);const t=fs.readFileSync(p,'utf8');for(const l of(e.name.endsWith('.jsonl')?t.split('\n').filter(Boolean):[t])){try{visit(JSON.parse(l))}catch{}}}}}
for(const d of['datasets','experiments','test-fixtures','protected-eval','reports'])walk(path.join(root,d));
const byFile={}; for(const g of gained){(byFile[g.file]??={n:0,preds:new Set()}).n++; byFile[g.file].preds.add(g.preds)}
for(const [f,v] of Object.entries(byFile)){ const first=execFileSync('git',['log','--diff-filter=A','--format=%h %ad','--date=iso','--',f],{cwd:root,encoding:'utf8'}).trim().split('\n').pop(); console.log(v.n, f, '| added', first); for(const p of v.preds) console.log('    ',p); }
