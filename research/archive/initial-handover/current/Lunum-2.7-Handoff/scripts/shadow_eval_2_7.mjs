#!/usr/bin/env node
import fs from 'node:fs';
function arg(name, fallback=null) { const i=process.argv.indexOf(`--${name}`); return (i>=0&&i+1<process.argv.length)?process.argv[i+1]:fallback; }
const server=arg('server',null), memoriesPath=arg('memories','corpus/sample_memories_2_7.jsonl'), queriesPath=arg('queries','corpus/sample_queries_2_7.jsonl'), configPath=arg('config','config/lunum_2_7_config.json'), outPath=arg('out','reports/shadow_eval_2_7.json');
function readJsonl(path){return fs.readFileSync(path,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);}
function roughTokens(text){return (String(text).match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)||[]).length;}
function eligible(m,cfg){const e=cfg.eligibility;return !!m.lunum_code&&(m.confidence??0)>=e.min_confidence&&e.allowed_risk.includes(m.risk)&&!e.blocked_categories.includes(m.category)&&e.allowed_categories.includes(m.category);}
function compile(memories,mode,cfg){return `Memory:\n${memories.map(m=>mode==='natural'?`- ${m.text}`:mode==='lunum'?`- ${m.lunum_code}`:`- ${eligible(m,cfg)?m.lunum_code:m.text}`).join('\n')}`;}
async function tokenize(text){if(!server)return{count:roughTokens(text),kind:'rough'};const res=await fetch(`${server.replace(/\/$/,'')}/tokenize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text,add_special:false,parse_special:false,with_pieces:false})});if(!res.ok)throw new Error(`tokenize failed ${res.status}: ${await res.text()}`);const data=await res.json();return{count:(data.tokens||[]).length,kind:'server'};}
const memories=readJsonl(memoriesPath), queries=readJsonl(queriesPath), cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
const contexts={natural:compile(memories,'natural',cfg),lunum:compile(memories,'lunum',cfg),mixed:compile(memories,'mixed',cfg)};
const tokens={};for(const [k,v] of Object.entries(contexts))tokens[k]=await tokenize(v);
const report={generated_at:new Date().toISOString(),version:'2.7',server,memory_count:memories.length,query_count:queries.length,context_tokens:Object.fromEntries(Object.entries(tokens).map(([k,v])=>[k,v.count])),token_kind:tokens.natural.kind,context_ratios:{lunum:tokens.lunum.count/tokens.natural.count,mixed:tokens.mixed.count/tokens.natural.count},gates_static:{mixed_ratio_ok:(tokens.mixed.count/tokens.natural.count)<=cfg.gates.mixed_context_ratio_lte},note:server?'Only tokenized contexts. Add model answer loop in product harness.':'No server provided; rough token counts only.'};
fs.mkdirSync(outPath.split('/').slice(0,-1).join('/')||'.',{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.context_ratios,null,2));
