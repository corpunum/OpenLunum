#!/usr/bin/env node
// Aggregate-only measurement of non-prose lines in frozen stage-1 discourse views.
// Reads ~/lunum-runs/codec-s1/private/stage1/views/*-discourse.json; never emits content.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir = path.join(os.homedir(), 'lunum-runs/codec-s1/private/stage1/views')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('-discourse.json')).sort()
if (!files.length) throw new Error(`No stage-1 discourse views in private path: ${dir}`)
const kinds = ['log', 'stack_trace', 'json', 'file_listing', 'diff', 'shell_output', 'code', 'other']
const totals = Object.fromEntries(kinds.map((k) => [k, { lines: 0, chars: 0, tokens: 0 }]))
const tokenCount = (s) => (s.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || []).length
function classify(line) {
  const s = line.trim()
  if (!s) return null
  if (/^(?:at\s+.+(?:\(.+\)|:\d+(?::\d+)?)|File ".+", line \d+)/u.test(s)) return 'stack_trace'
  if (/^(?:diff --git |index [0-9a-f]{6,}|--- .+|\+\+\+ .+|@@ .* @@)/u.test(s)) return 'diff'
  if (/^(?:\$ |❯ |PS [^>]*>|# )/u.test(s) || /^(?:stdout|stderr|exit code):/iu.test(s)) return 'shell_output'
  if (/^(?:\{|\[|"[^"\n]+"\s*:|\}\s*,?$|\]\s*,?$)/u.test(s)) return 'json'
  if (/^(?:\d{4}-\d\d-\d\d[T ]|\[(?:DEBUG|INFO|WARN|ERROR|TRACE)\]|(?:DEBUG|INFO|WARN|ERROR)\s)/u.test(s)) return 'log'
  if (/^(?:\s*\/|\.\.?\/|[\w.-]+\/)[^\s]*\s*$/.test(s)) return 'file_listing'
  if (/^(?:```|#!|import\s|export\s|const\s|let\s|function\s|class\s|(?:async\s+)?def\s|(?:pub\s+)?(?:fn|struct|impl)\s|package\s|return\b|if\s*\(|for\s*\()/u.test(s) || /[{};]=?|=>/.test(s)) return 'code'
  // Compact command-result/data lines, but avoid classifying ordinary sentences as tool output.
  if (/^(?:\s*(?:\[\d{4}-|\w+:\s*(?:true|false|null|\d+|\{|\[)|\w+\s*=\s*\S)|\s*(?:PASS|FAIL|Error:|warning:|error:))/u.test(s)) return 'other'
  return null
}
for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  for (const msg of doc.messages || []) for (const line of (typeof msg.content === 'string' ? msg.content : '').split('\n')) {
    const kind = classify(line)
    if (!kind) continue
    const t = totals[kind]; t.lines++; t.chars += line.length; t.tokens += tokenCount(line)
  }
}
const chars = kinds.reduce((n, k) => n + totals[k].chars, 0), tokens = kinds.reduce((n, k) => n + totals[k].tokens, 0)
for (const k of kinds) {
  const t = totals[k]
  t.charSharePct = +(100 * t.chars / (chars || 1)).toFixed(2)
  t.tokenSharePct = +(100 * t.tokens / (tokens || 1)).toFixed(2)
  delete t.chars; delete t.tokens
}
console.log(JSON.stringify({ source: 'stage1 discourse views; aggregate only', views: files.length, classifiedLines: kinds.reduce((n,k)=>n+totals[k].lines,0), tokenMethod: 'deterministic Unicode word/punctuation estimate; not Haiku tokenizer', classification: 'signature-based; unmatched/prose lines excluded', byType: totals }, null, 2))
