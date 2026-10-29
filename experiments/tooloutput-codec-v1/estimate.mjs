#!/usr/bin/env node
// Aggregate-only dry estimate of preregistered transforms against frozen stage-1 discourse views.
// Transform 9 rule: detect an earlier message as a file read only when its content has an
// explicit read_file/file_read tool call with a path argument, or a shell cat command with
// an explicit path. The conversation schema has role/content only, so implicit tool metadata
// is not available; ambiguous/non-explicit reads remain unchanged. No private text is emitted.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { segmentDiscourse } from '../../packages/core/dist/src/index.js'
import { verifyCompaction, expandCompaction, sha256Text } from '../../packages/eval/dist/src/guarded-codec.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(HERE, '../..')
const dir = path.join(os.homedir(), 'lunum-runs/codec-s1/private/stage1/views')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('-discourse.json')).sort()
if (files.length !== 12) throw new Error(`Expected 12 frozen views; found ${files.length}`)
const tokenCount = (s) => (s.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || []).length
const hash = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const language = (s) => /[Ͱ-Ͽἀ-῿]/u.test(s) ? 'el' : 'en'
const transforms = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, touched: 0, savedTokens: 0, expandedExact: true, invariantViolations: 0 }))
const pointers = new Map()
function pointerFor(src) {
  const digest = hash(src), ref = `sha256:${digest}`
  pointers.set(ref, src)
  return { ref, sha256: digest }
}
function candidate(source, view, id) {
  // The compact rendering is an omitted source unit backed by its exact local pointer;
  // keep it separately for token estimation while the verifier checks pointer integrity.
  const unit = { id, source, view: null, pointer: pointerFor(source) }
  return unit
}
function applyUnit(src, replacement, transform, id) {
  if (replacement === src) return null
  const unit = candidate(src, replacement, `${transform}:${id}`)
  const verify = verifyCompaction([unit], language(src))
  if (!verify.ok) { transforms[transform - 1].invariantViolations += verify.violations.length; return null }
  const back = expandCompaction([unit], (ref) => pointers.get(ref))[0]
  const exact = Buffer.from(back, 'utf8').equals(Buffer.from(src, 'utf8'))
  transforms[transform - 1].touched++
  transforms[transform - 1].savedTokens += tokenCount(src) - tokenCount(replacement)
  transforms[transform - 1].expandedExact &&= exact
  return replacement
}
function contentUnits(text) {
  return segmentDiscourse(text).map((u) => ({ start: u.start, end: u.end, text: text.slice(u.start, u.end), kind: u.kind }))
}
function lineRuns(text) {
  const lines = text.split('\n'), spans = []
  let at = 0
  for (const line of lines) { spans.push({ line, start: at, end: at + line.length }); at += line.length + 1 }
  return spans
}
function transformMessages(messages, point) {
  const baseline = messages.map((m) => String(m.content || '')).join('\n')
  let current = messages.map((m) => ({ ...m, content: String(m.content || '') }))
  const execute = (n, fn) => { current = fn(current, n) }
  // 1. Repeated identical lines within a contiguous log block; preserve order/count marker.
  execute(1, (ms, n) => ms.map((m, mi) => { let text=m.content; const ls=lineRuns(text); for(let i=0;i<ls.length;){ if(!/^\s*(?:\d{4}-\d\d-\d\d[T ]|\[(?:DEBUG|INFO|WARN|ERROR|TRACE)\]|(?:DEBUG|INFO|WARN|ERROR)\s)/u.test(ls[i].line)){i++;continue} let j=i+1;while(j<ls.length&&ls[j].line===ls[i].line)j++;if(j-i>1){const replacement=`${ls[i].line} [repeated ${j-i} times]`;const r=applyUnit(ls[i].line.repeat(j-i),replacement,n,`${mi}:${i}`);if(r!==null){text=text.slice(0,ls[i].start)+r+text.slice(ls[j-1].end);return {...m,content:text}}}i=j}return m }))
  // 2. Trace >=6 frames: first/last two plus count; trace must be recognizable.
  execute(2, (ms,n)=>ms.map((m,mi)=>{const lines=m.content.split('\n');let out=m.content;const frame=/^(?:\s+at\s+.+|\s*File ".+", line \d+)/u;for(let i=0;i<lines.length;){if(!frame.test(lines[i])){i++;continue}let j=i;while(j<lines.length&&frame.test(lines[j]))j++;if(j-i>=6){const block=lines.slice(i,j).join('\n'), repl=[...lines.slice(i,i+2),`[${j-i-4} frames omitted]`,...lines.slice(j-2,j)].join('\n');const r=applyUnit(block,repl,n,`${mi}:${i}`);if(r!==null){out=out.replace(block,r);break}}i=j}return {...m,content:out}}))
  // 3. JSON >1,000 UTF-8 bytes: deterministic shape summary, only mechanically referenced keys.
  execute(3,(ms,n)=>ms.map((m,mi)=>{let text=m.content;for(const u of contentUnits(text)){if(Buffer.byteLength(u.text,'utf8')<=1000)continue;let parsed;try{parsed=JSON.parse(u.text)}catch{continue}const later=ms.slice(mi+1).map(x=>String(x.content||'')).join('\n');const refs=[...new Set([...later.matchAll(/["'`]([A-Za-z_$][\w$.-]*)["'`]/gu)].map(x=>x[1]))];let shape;if(Array.isArray(parsed))shape=`array(${parsed.length})`;else if(parsed&&typeof parsed==='object')shape=`object { ${Object.keys(parsed).sort().map(k=>`${k}:${Array.isArray(parsed[k])?'array':parsed[k]===null?'null':typeof parsed[k]}`).join(', ')} }`;else continue;const fields=refs.filter(k=>parsed&&Object.hasOwn(parsed,k)).sort().map(k=>`${k}=${JSON.stringify(parsed[k])}`).join('\n');const repl=`JSON ${shape}${fields?`\nReferenced fields:\n${fields}`:''}`;const r=applyUnit(u.text,repl,n,`${mi}:${u.start}`);if(r!==null){text=text.slice(0,u.start)+r+text.slice(u.end);break}}return {...m,content:text}}))
  // 4. Exact duplicate paths in a contiguous path-listing block.
  execute(4,(ms,n)=>ms.map((m,mi)=>{const lines=m.content.split('\n');let out=m.content;for(let i=0;i<lines.length;){if(!/^\s*(?:\/|\.\.?\/|[\w.-]+\/)[^\s]*\s*$/u.test(lines[i])){i++;continue}let j=i;const seen=new Set(),kept=[];while(j<lines.length&&/^\s*(?:\/|\.\.?\/|[\w.-]+\/)[^\s]*\s*$/u.test(lines[j])){if(!seen.has(lines[j])){seen.add(lines[j]);kept.push(lines[j])}j++}if(j-i>kept.length){const block=lines.slice(i,j).join('\n'),counts=new Map();for(const x of lines.slice(i,j))counts.set(x,(counts.get(x)||0)+1);const repl=[...counts].map(([x,c])=>c>1?`${x} [count ${c}]`:x).join('\n');const r=applyUnit(block,repl,n,`${mi}:${i}`);if(r!==null){out=out.replace(block,r);break}}i=j}return {...m,content:out}}))
  // 5. Exact repeated diff hunks, retaining first hunk plus count/pointer.
  execute(5,(ms,n)=>ms.map((m,mi)=>{const lines=m.content.split('\n');let out=m.content;for(let i=0;i<lines.length;){if(!/^@@ .* @@/u.test(lines[i])){i++;continue}let j=i+1;while(j<lines.length&&!/^@@ .* @@/u.test(lines[j])&&!/^diff --git /u.test(lines[j]))j++;const h=lines.slice(i,j).join('\n');let k=j;while(k<lines.length&&lines.slice(k,k+h.split('\n').length).join('\n')===h)k+=h.split('\n').length;if(k>j){const repl=`${h}\n[hunk repeated ${1+(k-j)/h.split('\n').length} times]`;const r=applyUnit(h.repeat(1+(k-j)/h.split('\n').length),repl,n,`${mi}:${i}`);if(r!==null){out=out.replace(h.repeat(1+(k-j)/h.split('\n').length),r);break}}i=j}return {...m,content:out}}))
  // 6. Long shell-output units >2,000 UTF-8 bytes, safe UTF-8 prefix/suffix boundaries.
  execute(6,(ms,n)=>ms.map((m,mi)=>{for(const u of contentUnits(m.content)){if(Buffer.byteLength(u.text,'utf8')<=2000||!/(?:stdout|stderr|exit code|\$ |❯ |PS [^>]*>)/iu.test(u.text))continue;const b=Buffer.from(u.text,'utf8'), head=b.subarray(0,1000).toString('utf8'),tail=b.subarray(b.length-1000).toString('utf8');if(Buffer.byteLength(head)<1000||Buffer.byteLength(tail)<1000)continue;const omitted=b.length-Buffer.byteLength(head)-Buffer.byteLength(tail);const repl=`${head}\n[${omitted} bytes omitted; sha256:${hash(u.text)}]\n${tail}`;const r=applyUnit(u.text,repl,n,`${mi}:${u.start}`);if(r!==null)return {...m,content:m.content.slice(0,u.start)+r+m.content.slice(u.end)}}return m}))
  // 7. Exact whole-block duplicate elimination only inside a message; duplicates kept explicit.
  execute(7,(ms,n)=>ms.map((m,mi)=>{const units=contentUnits(m.content).filter(x=>x.kind==='code'),seen=new Set();let text=m.content;for(const u of units){if(seen.has(u.text)){const repl=`[duplicate block; sha256:${hash(u.text)}]`;const r=applyUnit(u.text,repl,n,`${mi}:${u.start}`);if(r!==null){text=text.slice(0,u.start)+r+text.slice(u.end)}}else seen.add(u.text)}return {...m,content:text}}))
  // 8. Identical code block >=400 bytes already seen in an earlier message.
  execute(8,(ms,n)=>{const seen=new Map();return ms.map((m,mi)=>{let text=m.content;for(const u of contentUnits(text).filter(x=>x.kind==='code'&&Buffer.byteLength(x.text,'utf8')>=400)){if(seen.has(u.text)){const first=seen.get(u.text),repl=`[code pointer sha256:${hash(u.text)} first message ${first.message}; ${u.text.split('\n').length} lines]`;const r=applyUnit(u.text,repl,n,`${mi}:${u.start}`);if(r!==null)text=text.slice(0,u.start)+r+text.slice(u.end)}else seen.set(u.text,{message:mi})}return {...m,content:text}})})
  // 9. Explicit repeated file reads; earlier read is pointerized only once >4 messages behind latest.
  execute(9,(ms,n)=>{const reads=new Map();const re=/(?:read_file|file_read)\s*\([^)]*(?:path|file)\s*[:=]\s*["']([^"']+)["']|\bcat\s+(["']?)(\/(?:[^\s"']+)|\.?\.?\/[^\s"']+|[\w.-]+\.[\w]+)\2/gu;ms.forEach((m,mi)=>{let paths=[];for(const x of String(m.content||'').matchAll(re))paths.push(x[1]||x[3]);for(const p of paths){if(!reads.has(p))reads.set(p,[]);reads.get(p).push(mi)}});return ms.map((m,mi)=>{let text=m.content;for(const [p,idxs] of reads){const latest=idxs.at(-1);if(latest<=mi||latest-mi<=4)continue;if(!idxs.includes(mi))continue;const replacement=`[file read ${p} superseded by read at message ${latest}]`;const candidates=contentUnits(text).filter(u=>u.text.includes(p));if(candidates.length){const u=candidates[0],r=applyUnit(u.text,replacement,n,`${mi}:${u.start}`);if(r!==null)text=text.slice(0,u.start)+r+text.slice(u.end)}}return {...m,content:text}})})
  return { baseline, messages: current }
}
const report=[]
for(const file of files){const doc=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));if(!Array.isArray(doc.messages))throw new Error(`Invalid view ${file}`);const result=transformMessages(doc.messages,doc.key);const final=result.messages.map(m=>String(m.content||'')).join('\n');report.push({key:doc.key,baselineTokens:tokenCount(result.baseline),finalTokens:tokenCount(final)})}
const baseTokens=report.reduce((n,x)=>n+x.baselineTokens,0),finalTokens=report.reduce((n,x)=>n+x.finalTokens,0)
const output={source:'12 frozen stage-1 discourse views; aggregates only',views:files.length,tokenMethod:'same deterministic Unicode word/punctuation estimator as measure.mjs; estimate, not Haiku tokens',tokenBaseline:baseTokens,tokenEstimated:finalTokens,estimatedTokensSaved:baseTokens-finalTokens,estimatedSavingsPct:+(100*(baseTokens-finalTokens)/(baseTokens||1)).toFixed(4),transforms:transforms.map(x=>({...x,savingsPctOfBaseline:+(100*x.savedTokens/(baseTokens||1)).toFixed(4)})),exactExpansion:transforms.every(x=>x.expandedExact),invariantViolations:transforms.reduce((n,x)=>n+x.invariantViolations,0)}
fs.writeFileSync(path.join(HERE,'estimate-results.json'),JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output,null,2))
