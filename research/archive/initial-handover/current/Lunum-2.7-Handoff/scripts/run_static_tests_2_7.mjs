#!/usr/bin/env node
import fs from 'node:fs';
import child_process from 'node:child_process';
function run(cmd) { return child_process.execSync(cmd, { encoding: 'utf8' }); }
fs.mkdirSync('reports', { recursive: true });
const compileOut = run('node scripts/compile_context_2_7.mjs --out reports/context_compile_2_7.json');
const shadowOut = run('node scripts/shadow_eval_2_7.mjs --out reports/shadow_eval_2_7.static.json');
const compile = JSON.parse(fs.readFileSync('reports/context_compile_2_7.json','utf8'));
const assertions = [
  { name:'mixed ratio <= 0.90', pass:compile.ratios.mixed <= 0.90, value:compile.ratios.mixed },
  { name:'lunum ratio <= 0.85', pass:compile.ratios.lunum <= 0.85, value:compile.ratios.lunum },
  { name:'at least one natural fallback in mixed', pass:compile.eligibility.some(x => !x.eligible), value:compile.eligibility.filter(x => !x.eligible).length },
  { name:'at least one Lunum eligible memory', pass:compile.eligibility.some(x => x.eligible), value:compile.eligibility.filter(x => x.eligible).length }
];
const report = {generated_at:new Date().toISOString(),compile_stdout:compileOut,shadow_stdout:shadowOut,assertions,pass:assertions.every(a=>a.pass)};
fs.writeFileSync('reports/static_tests_2_7.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, assertions }, null, 2));
process.exit(report.pass ? 0 : 1);
