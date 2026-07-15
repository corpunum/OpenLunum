import fs from 'node:fs';
const ledger = JSON.parse(fs.readFileSync(new URL('../historical-results.json', import.meta.url), 'utf8'));
for (const row of ledger.results) console.log(`${row.line}\t${row.metric}\t${row.status}`);
