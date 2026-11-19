#!/usr/bin/env node
// Headless: file in, file out, one stats JSON line on stdout. Exit 0 ok, 1 on any error. No prompts, no network.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { buildAppendix, parseTranscript } from '../src/handoff-appendix.js';

function fail(msg: string): never {
  process.stderr.write(`lunum-handoff-appendix: ${msg}\n`);
  process.exit(1);
}

let values: { in?: string; out?: string; 'max-tokens'?: string };
try {
  values = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string' }, 'max-tokens': { type: 'string' } }, strict: true }).values;
} catch (e) {
  fail(`${(e as Error).message}\nusage: lunum-handoff-appendix --in <transcript.jsonl|messages.json> --out <appendix.md> [--max-tokens 3500]`);
}
if (!values.in || !values.out) fail('usage: lunum-handoff-appendix --in <transcript.jsonl|messages.json> --out <appendix.md> [--max-tokens 3500]');
const maxTokens = values['max-tokens'] === undefined ? 3500 : Number(values['max-tokens']);
if (!Number.isInteger(maxTokens) || maxTokens < 200) fail('--max-tokens must be an integer >= 200');

try {
  const messages = parseTranscript(readFileSync(values.in, 'utf8'));
  if (messages.length === 0) fail('no user/assistant messages found in input');
  const { text, stats } = buildAppendix(messages, { source: basename(values.in), maxTokens });
  writeFileSync(values.out, text);
  process.stdout.write(JSON.stringify({ ok: true, out: values.out, ...stats }) + '\n');
} catch (e) {
  fail((e as Error).message);
}
