#!/usr/bin/env node
// Which packages/core/src modules does any real consumer reach?
// Consumers: OpenLunum's other packages (src/bin), scripts/, examples/, integrations/,
// and optionally an OpenUnum checkout (which vendors the core build under
// src/memory/lunum-core/). Imports through the package index are resolved by
// exported name to the defining module; then the core-internal import graph is
// followed transitively. Tests are counted separately: a module reached only by
// tests is not used by any product path.
//   node scripts/research/core-module-audit.mjs [<openunum checkout>] > report.json
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const openunum = process.argv[2] ? path.resolve(process.argv[2]) : null;
const coreSrc = path.join(root, 'packages/core/src');
const modules = fs.readdirSync(coreSrc).filter((f) => f.endsWith('.ts') && f !== 'index.ts').map((f) => f.replace(/\.ts$/u, ''));
const read = (file) => fs.readFileSync(file, 'utf8');
const lines = (name) => read(path.join(coreSrc, `${name}.ts`)).split('\n').length;

// Exported names per module, and core-internal imports per module.
const exportsOf = new Map(); const importsOf = new Map();
for (const name of modules) {
  const text = read(path.join(coreSrc, `${name}.ts`));
  exportsOf.set(name, new Set([...text.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gu)].map((m) => m[1])));
  importsOf.set(name, new Set([...text.matchAll(/from\s+['"]\.\/([^'"]+?)\.js['"]/gu)].map((m) => m[1]).filter((dep) => modules.includes(dep))));
}
const byExport = new Map();
for (const [name, names] of exportsOf) for (const symbol of names) if (!byExport.has(symbol)) byExport.set(symbol, name);

function walk(dir, out = [], skip = new Set(['node_modules', 'dist', '.git', 'lunum-core'])) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(file, out, skip); }
    else if (/\.(m?js|ts|mts)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(file);
  }
  return out;
}
const isTest = (file) => /(^|\/)(test|tests|__tests__)\//u.test(file) || /\.test\.(m?js|ts)$/u.test(file);

// Direct core modules a consumer file reaches.
function directUses(file) {
  const inCore = file.startsWith(path.join(root, 'packages/core/'));
  // Inside packages/core, '../src/index.js' is the core index too.
  const text = inCore ? read(file).replace(/(['"])\.\.\/src\/index\.js\1/gu, "$1lunum-core/index.js$1") : read(file); const used = new Set();
  for (const m of text.matchAll(/(?:core\/(?:dist\/)?src|lunum-core|@corpunum\/lunum\/dist\/src)\/([a-z0-9-]+)\.js/gu)) if (modules.includes(m[1])) used.add(m[1]);
  // Core's own tests: '../src/x.js' from packages/core/test.
  if (inCore) for (const m of text.matchAll(/['"]\.\.\/(?:\.\.\/)?src\/([a-z0-9-]+)\.js['"]/gu)) if (modules.includes(m[1])) used.add(m[1]);
  // Any file that loads the core index (static, dynamic or re-export): over-approximate by
  // counting every distinctive exported name (8+ chars) that appears in the file.
  if (/(?:core\/(?:dist\/)?src|lunum-core)\/index\.js|['"]@corpunum\/lunum['"]/u.test(text)) {
    for (const [symbol, owner] of byExport) if (symbol.length >= 8 && new RegExp(`\\b${symbol.replace(/\$/gu, '\\$')}\\b`, 'u').test(text)) used.add(owner);
  }
  const viaIndex = /from\s+['"](?:@corpunum\/lunum|[^'"]*(?:packages\/core\/(?:dist\/)?src|lunum-core)\/index\.js|[^'"]*packages\/core(?:\/dist)?\/src\/index\.js)['"]/u;
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+(['"][^'"]+['"])/gu)) {
    if (!viaIndex.test(`from ${m[2]}`)) continue;
    for (const raw of m[1].split(',')) { const symbol = raw.trim().replace(/^type\s+/u, '').split(/\s+as\s+/u)[0].trim(); if (byExport.has(symbol)) used.add(byExport.get(symbol)); }
  }
  // Namespace or dynamic imports of the index: count names used as ns.X
  for (const m of text.matchAll(/import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+(['"][^'"]+['"])/gu)) {
    if (!viaIndex.test(`from ${m[2]}`)) continue;
    for (const u of text.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z0-9_$]+)`, 'gu'))) if (byExport.has(u[1])) used.add(byExport.get(u[1]));
  }
  return used;
}
function closure(seeds) {
  const seen = new Set(seeds); const stack = [...seeds];
  while (stack.length) for (const dep of importsOf.get(stack.pop()) ?? []) if (!seen.has(dep)) { seen.add(dep); stack.push(dep); }
  return seen;
}

const consumers = {
  openlunumProduct: [...['mcp', 'cli', 'api', 'eval', 'adapter-openunum'].flatMap((p) => ['src', 'bin'].flatMap((d) => walk(path.join(root, 'packages', p, d)))), ...walk(path.join(root, 'examples')), ...walk(path.join(root, 'integrations'))].filter((f) => !isTest(f)),
  openlunumScripts: walk(path.join(root, 'scripts')).filter((f) => !isTest(f)),
  openunum: openunum ? walk(openunum).filter((f) => !isTest(f) && !f.includes('/src/memory/lunum-core/')) : [],
  tests: [...walk(path.join(root, 'packages')), ...walk(path.join(root, 'scripts')), ...walk(path.join(root, 'examples'))].filter(isTest),
};
const reach = {}; const seedFiles = {};
for (const [kind, files] of Object.entries(consumers)) {
  const seeds = new Set();
  for (const file of files) for (const used of directUses(file)) { seeds.add(used); (seedFiles[`${kind}:${used}`] ??= []).push(path.relative(kind === 'openunum' ? openunum : root, file)); }
  reach[kind] = closure(seeds);
}
const rows = modules.map((name) => {
  const usedBy = ['openlunumProduct', 'openlunumScripts', 'openunum'].filter((kind) => reach[kind].has(name));
  const header = (read(path.join(coreSrc, `${name}.ts`)).match(/^\/\*\*([\s\S]*?)\*\//u)?.[1] ?? '').replace(/\s*\*\s?/gu, ' ').trim().slice(0, 220);
  return { module: name, lines: lines(name), usedBy, testOnly: usedBy.length === 0 && reach.tests.has(name), unreferenced: usedBy.length === 0 && !reach.tests.has(name),
    importedByCore: modules.filter((other) => importsOf.get(other).has(name)), header,
    directConsumers: Object.fromEntries(['openlunumProduct', 'openlunumScripts', 'openunum'].map((k) => [k, (seedFiles[`${k}:${name}`] ?? []).slice(0, 5)]).filter(([, v]) => v.length)) };
});
const used = rows.filter((r) => r.usedBy.length); const unused = rows.filter((r) => !r.usedBy.length);
console.log(JSON.stringify({
  format: 'openlunum-core-module-audit/0.1', openunumCheckout: openunum ? path.basename(openunum) : null,
  totals: { modules: rows.length, lines: rows.reduce((s, r) => s + r.lines, 0), used: used.length, usedLines: used.reduce((s, r) => s + r.lines, 0), unusedByAnyConsumer: unused.length, unusedLines: unused.reduce((s, r) => s + r.lines, 0),
    usedOnlyByOpenUnum: rows.filter((r) => r.usedBy.length === 1 && r.usedBy[0] === 'openunum').length, usedOnlyByScripts: rows.filter((r) => r.usedBy.length === 1 && r.usedBy[0] === 'openlunumScripts').length },
  rows: rows.sort((a, b) => a.usedBy.length - b.usedBy.length || b.lines - a.lines),
}, null, 2));
