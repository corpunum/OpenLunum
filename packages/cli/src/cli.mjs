#!/usr/bin/env node
import fs from 'node:fs';
import { createRecord, deriveLunumSidecar, renderSem, fingerprintSem } from '../../core/src/index.mjs';

const args = process.argv.slice(2);
const command = args.shift();
const valueAfter = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

function usage(code = 0) {
  console.log(`OpenLunum CLI

  lunum inspect --text "..."
  lunum encode --sem record.json [--text source]
  lunum fingerprint --sem record.json`);
  process.exit(code);
}

try {
  if (!command || command === '--help' || command === 'help') usage();
  if (command === 'inspect') {
    const text = valueAfter('--text');
    if (!text) usage(2);
    console.log(JSON.stringify(deriveLunumSidecar({ role:'user', content:text }), null, 2));
  } else if (command === 'encode' || command === 'fingerprint') {
    const file = valueAfter('--sem');
    if (!file) usage(2);
    const sem = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (command === 'fingerprint') console.log(fingerprintSem(sem));
    else console.log(JSON.stringify(createRecord({ sourceText:valueAfter('--text') || '', sem, category:sem.kind, risk:'low', confidence:1 }), null, 2));
  } else usage(2);
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
