import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReferences, groundDiscourse, groundText, InMemoryLocator, jaccard, nearDuplicateUnits, rootsFromUnits,
  TrigramIndex, trigramSet, UnumsearchLocator,
} from '../dist/index.js';

const kinds = (text) => extractReferences(text).map((r) => `${r.kind}:${r.text}`);

test('extractReferences finds paths, files, identifiers, config keys and versions with exact spans', () => {
  const text = 'Edit src/memory/recall.mjs and ~/main/scripts/x.sh, then call searchConversationText() on messages_fts; set runtime.lunumMemory.contextMode; bump v1.2.3; read package.json.';
  const refs = extractReferences(text);
  for (const r of refs) assert.equal(text.slice(r.start, r.end), r.text);
  assert.deepEqual(refs.map((r) => `${r.kind}:${r.text}`), [
    'path:src/memory/recall.mjs',
    'path:~/main/scripts/x.sh',
    'identifier:searchConversationText',
    'identifier:messages_fts',
    'config_key:runtime.lunumMemory.contextMode',
    'version:v1.2.3',
    'file:package.json',
  ]);
});

test('extractReferences skips URLs, prose, short names, domains and abbreviations', () => {
  assert.deepEqual(kinds('See https://github.com/corpunum/unumsearch/blob/main/README.md for details.'), []);
  assert.deepEqual(kinds('This is plain prose, e.g. and/or read/write, with corpunum.com and i.e. nothing.'), []);
  assert.deepEqual(kinds('call foo() and fooBr'), []);
  assert.deepEqual(kinds('Ο λογαριασμός του χρήστη ενημερώθηκε.'), []);
});

test('extractReferences v0.2 drops prose slash-lists and elided paths, and unprefixes diff paths', () => {
  assert.deepEqual(kinds('Remaining: final CI/build/browser results and schedule/readback/cancel flow.'), []);
  assert.deepEqual(kinds('Saved as `pages/alpha-kappa...html` and src/…/x.ts and .../engine/src/b.rs.'), []);
  assert.deepEqual(kinds('diff --git a/src/core/x.mjs b/src/core/x.mjs'), ['path:src/core/x.mjs', 'path:src/core/x.mjs']);
  assert.deepEqual(kinds('see packages/core/src and research/ for more'), ['path:packages/core/src', 'path:research/']);
});

test('a method call yields the callee as an identifier', () => {
  assert.deepEqual(kinds('this.memoryStore.searchConversationText({ query })'), ['identifier:searchConversationText']);
});

test('trigram sets and Jaccard are normalised and symmetric', () => {
  assert.equal(jaccard(trigramSet('Hello  World'), trigramSet('hello world')), 1);
  const a = trigramSet('The fix landed in commit 3465e355 on main.');
  const b = trigramSet('The fix landed in commit 3465e355 on main today.');
  assert.equal(jaccard(a, b), jaccard(b, a));
  assert.ok(jaccard(a, b) > 0.7);
  assert.ok(jaccard(a, trigramSet('Completely unrelated sentence about weather.')) < 0.2);
});

test('TrigramIndex returns only candidates above the bound, best first, deterministic ties', () => {
  const index = new TrigramIndex();
  index.add('a', 'The deploy finished and all 42 tests passed on main.', 'a');
  index.add('b', 'The deploy finished and all 41 tests passed on main.', 'b');
  index.add('c', 'Unrelated narrative about the weather in Athens.', 'c');
  const hits = index.candidates('The deploy finished and all 42 tests passed on main!', { minSimilarity: 0.5 });
  assert.deepEqual(hits.map((h) => h.id), ['a', 'b']);
  assert.ok(hits[0].similarity >= hits[1].similarity);
  assert.throws(() => index.add('a', 'dup', 'a'));
});

test('InMemoryLocator grounds by filename and literal and flags the rest as unverified', async () => {
  const locator = new InMemoryLocator([
    { id: 'repo/src/memory/recall.mjs', text: 'export function searchConversationText() {}\nconst messages_fts = 1;' },
    { id: 'repo/config.json', text: '{"runtime": {"lunumMemory": {"contextMode": "natural"}}}' },
  ]);
  const report = await groundText('searchConversationText in src/memory/recall.mjs; also inventedHelperName() and src/memory/ghost.mjs', locator);
  const byText = Object.fromEntries(report.references.map((r) => [r.text, r]));
  assert.equal(byText['searchConversationText'].status, 'grounded');
  assert.deepEqual(byText['searchConversationText'].locations[0], { file: 'repo/src/memory/recall.mjs', line: 1, text: 'export function searchConversationText() {}' });
  assert.equal(byText['src/memory/recall.mjs'].status, 'grounded');
  assert.equal(byText['inventedHelperName'].status, 'unverified');
  assert.equal(byText['src/memory/ghost.mjs'].status, 'unverified');
  assert.deepEqual(report.counts, { grounded: 2, unverified: 2, out_of_scope: 0, unavailable: 0 });
  assert.equal(report.version, 'lunum-source-grounding/0.1');
});

test('groundDiscourse attaches unit indexes and source offsets', async () => {
  const locator = new InMemoryLocator([{ id: 'a/b.ts', text: 'const knownSymbol = 1;' }]);
  const source = '# Report\n\n- Uses knownSymbol from a/b.ts\n- Mentions missingSymbol';
  const report = await groundDiscourse(source, locator);
  for (const r of report.references) assert.equal(source.slice(r.start, r.end), r.text);
  const missing = report.references.find((r) => r.text === 'missingSymbol');
  assert.equal(missing.status, 'unverified');
  assert.equal(typeof missing.unit, 'number');
});

test('a throwing locator makes references unavailable, never unverified', async () => {
  const broken = {
    name: 'broken',
    exists: async () => { throw new Error('down'); },
    locate: async () => [],
    nearDuplicates: async () => [],
  };
  const report = await groundText('see inventedHelperName()', broken);
  assert.deepEqual(report.counts, { grounded: 0, unverified: 0, out_of_scope: 0, unavailable: 1 });
});

test('nearDuplicateUnits pairs near-verbatim units across messages and applies the literal gate', () => {
  const unit = 'The memory search fallback uses an FTS5 trigram table and returns the newest five messages first.';
  const pairs = nearDuplicateUnits([
    { id: 'm1', content: unit },
    { id: 'm2', content: unit.replace('newest five', 'newest 5') },
    { id: 'm3', content: unit },
    { id: 'm4', content: 'Completely different statement about deploying the website to the AWS VM over Tailscale today.' },
  ]);
  const ids = pairs.map((p) => `${p.a.messageId}->${p.b.messageId}`);
  assert.ok(ids.includes('m1->m2'));
  // m3 repeats m1 exactly: same surface key, left to the core.
  assert.ok(!ids.includes('m1->m3'));
  assert.ok(!ids.some((id) => id.includes('m4')));
  const m1m2 = pairs.find((p) => p.a.messageId === 'm1' && p.b.messageId === 'm2');
  assert.equal(m1m2.literalsCovered, true);
  // 'five' and '5' are the same number literal (contract 0.16); the older unit's 'six' is not in the newer one.
  const changed = nearDuplicateUnits([{ id: 'x', content: unit.replace('five', 'six') }, { id: 'y', content: unit }]);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].literalsCovered, false);
});

function fakeDaemon(files, { fresh = true, splitRoots = ['/w'] } = {}) {
  const units = ['/repo', '/other', '/w/a', '/w/b'];
  const unitOf = (path) => units.find((u) => path === u || path.startsWith(`${u}/`));
  const cover = (root) => units.includes(root) || splitRoots.includes(root) || Boolean(unitOf(root));
  const inRoot = (root) => Object.keys(files).filter((f) => f.startsWith(`${root}/`));
  return async (path, params) => {
    if (path === '/status') return { ok: true, units: units.map((p) => ({ path: p })) };
    const root = params.root ?? '/repo';
    if (!cover(root)) return { ok: true, result: { backend: 'none', covered: false, fresh: false, files: [], matches: [] } };
    if (path === '/files') {
      const glob = params.glob ?? '';
      const base = glob.replace(/^\*\*\//u, '').replace(/\/\*\*$/u, '');
      const list = inRoot(root).filter((f) => !glob || (glob.endsWith('/**') ? f.includes(`/${base}/`) : f.endsWith(`/${base}`)));
      return { ok: true, result: { backend: 'index', covered: true, fresh, truncated: false, files: list.slice(0, Number(params.max_files ?? 200)) } };
    }
    const matches = [];
    for (const f of inRoot(root)) {
      files[f].split('\n').forEach((line, i) => {
        const hit = params.ci === '1' ? line.toLowerCase().includes(String(params.pattern).toLowerCase()) : line.includes(String(params.pattern));
        if (hit) matches.push({ path: f, line: i + 1, text: line });
      });
    }
    return { ok: true, result: { backend: 'index', covered: true, fresh, truncated: false, files: [...new Set(matches.map((m) => m.path))], matches } };
  };
}

test('rootsFromUnits keeps single units and collapses only confirmed split roots', async () => {
  const roots = await rootsFromUnits(['/home/u/main', '/home/u/lib', '/home/u/w/a', '/home/u/w/b'], async (p) => p === '/home/u/w');
  assert.deepEqual(roots, ['/home/u/lib', '/home/u/main', '/home/u/w']);
});

test('UnumsearchLocator: found, not_found, out_of_scope, segments and file:line provenance', async () => {
  const locator = new UnumsearchLocator({
    homeDir: '/home/u',
    transport: fakeDaemon({
      '/repo/src/memory/recall.mjs': 'export function searchConversationText() {}\n',
      '/repo/src/config.mjs': 'runtime: {\n  lunumMemory: {\n    contextMode: "natural"\n  }\n}',
      '/w/b/docs/notes.md': 'see helperInWorktree here',
    }),
  });
  assert.deepEqual(await locator.searchRoots(), ['/other', '/repo', '/w']);
  const id = await locator.exists('searchConversationText', 'identifier');
  assert.equal(id.status, 'found');
  assert.deepEqual(id.locations[0], { file: '/repo/src/memory/recall.mjs', line: 1, text: 'export function searchConversationText() {}' });
  assert.equal((await locator.exists('helperInWorktree', 'identifier')).status, 'found');
  assert.equal((await locator.exists('inventedHelperName', 'identifier')).status, 'not_found');
  assert.equal((await locator.exists('src/memory/recall.mjs', 'path')).status, 'found');
  assert.equal((await locator.exists('/repo/src/memory/recall.mjs', 'path')).status, 'found');
  assert.equal((await locator.exists('/repo/src/memory/ghost.mjs', 'path')).status, 'not_found');
  assert.equal((await locator.exists('/etc/hosts', 'path')).status, 'out_of_scope');
  assert.equal((await locator.exists('~/elsewhere/x.txt', 'path')).status, 'out_of_scope');
  const key = await locator.exists('runtime.lunumMemory.contextMode', 'config_key');
  assert.equal(key.status, 'found');
  assert.deepEqual(key.evidence, ['segments']);
  assert.equal((await locator.exists('runtime.lunumMemory.inventedKey', 'config_key')).status, 'not_found');
  const spans = await locator.locate('Use searchConversationText, not inventedHelperName.');
  assert.deepEqual(spans.map((s) => s.text), ['searchConversationText']);
});

test('UnumsearchLocator: a stale index or a dead daemon is unavailable, never not_found', async () => {
  const stale = new UnumsearchLocator({ transport: fakeDaemon({}, { fresh: false }) });
  assert.equal((await stale.exists('inventedHelperName', 'identifier')).status, 'unavailable');
  const dead = new UnumsearchLocator({ transport: async () => null });
  assert.equal((await dead.exists('inventedHelperName', 'identifier')).status, 'unavailable');
  const report = await groundText('inventedHelperName() and src/x/y.ts', dead);
  assert.equal(report.counts.unverified, 0);
});

test('UnumsearchLocator.pathExists grounds an unindexed absolute path inside a root', async () => {
  const locator = new UnumsearchLocator({ transport: fakeDaemon({}), pathExists: (p) => p === '/repo/dist/out.js' });
  const r = await locator.exists('/repo/dist/out.js', 'path');
  assert.equal(r.status, 'found');
  assert.deepEqual(r.evidence, ['disk']);
});

test('UnumsearchLocator.nearDuplicates scores matched lines by trigram overlap', async () => {
  const locator = new UnumsearchLocator({
    transport: fakeDaemon({ '/repo/README.md': 'Intro\nBM25-ranked messages matching any meaningful word of the query.\nOther' }),
  });
  const hits = await locator.nearDuplicates('BM25-ranked messages matching any meaningful word of `query`');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, '/repo/README.md');
  assert.equal(hits[0].line, 2);
  assert.ok(hits[0].similarity > 0.8);
});
