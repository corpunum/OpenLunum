#!/usr/bin/env node
// lunum-handoff-variant: deterministic handoff Lunum variant, zero model tokens. Extract-only, never invents.
//   node scripts/lunum-handoff-variant.mjs --dir D --session NAME --transcript T.jsonl [--pilot N] [--redact-file LIST]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const APPENDIX = fileURLToPath(new URL('./lunum-handoff-appendix.mjs', import.meta.url));
const MAX_PATHS = 40;
const STOP = new Set(['ref', 'refs', 'id', 'session', 'see', 'peer', 'to', 'from', 'with']);
const EXT = '(?:sh|py|mjs|js|json|md|toml)';
const PATH_RE = new RegExp(String.raw`(?<![\w./~-])(?:~/|/)?(?:[\w.-]+/)+[\w.-]*|(?<![\w./~-])[\w.-]+\.${EXT}(?![\w-])`, 'g');
const REF_RE = /(?:([A-Za-z][\w-]*)\s+)?\[([0-9a-f]{6})\]/g;
// Secret checks (names only, values never printed).
export const SECRET_CHECKS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
    /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}/,
    /\b(?:api[_-]?key|token|secret|passw(?:or)?d)\s*[=:]\s*[^\s\[]{6,}/i,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/i,
];
export function scanSecrets(text) {
    const lines = [];
    text.split('\n').forEach((l, i) => { if (SECRET_CHECKS.some((re) => re.test(l))) lines.push(i + 1); });
    return lines;
}
const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

export function splitSections(md) {
    const lines = md.split('\n');
    let i = 0;
    if (lines[0]?.startsWith('# ')) i = 1;
    return lines.slice(i).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
}

export function extractPaths(texts, repoRoot) {
    const seen = new Map();
    for (const t of texts) {
        for (const raw of t.match(PATH_RE) ?? []) {
            const p = raw.replace(/[.,;:)`'"]+$/, '');
            if (!p || seen.has(p)) continue;
            const isFile = new RegExp(String.raw`\.${EXT}$`).test(p);
            const isAbs = p.startsWith('/') || p.startsWith('~');
            if (!isFile && !isAbs && !p.endsWith('/')) continue; // bare relative dirs are too ambiguous
            if (!isFile && p.length < 4) continue;
            if (/^\/\//.test(p) || p === '/' ) continue;
            if (/^\/(?:usr|proc|dev)\//.test(p) || /site-packages|node_modules/.test(p)) continue; // system noise
            let ok = false;
            if (isAbs) { try { statSync(expand(p)); ok = true; } catch { /* absent */ } }
            else if (repoRoot) { try { statSync(resolve(repoRoot, p)); ok = true; } catch { /* absent */ } }
            else ok = null; // relative path, no repo to resolve against
            seen.set(p, ok);
        }
    }
    // Cap: existing first, then unresolved, then absent; output keeps source order (INDEX, topics, appendix).
    const all = [...seen.entries()];
    const rank = (e) => (e === true ? 0 : e === null ? 1 : 2);
    const keep = new Set([...all].sort((a, b) => rank(a[1]) - rank(b[1])).slice(0, MAX_PATHS).map(([p]) => p));
    return all.filter(([p]) => keep.has(p));
}

export function extractRefs(texts) {
    const refs = new Map(); // key "name [hex]" or "[hex]"
    const byName = new Map();
    for (const t of texts) {
        for (const m of t.matchAll(REF_RE)) {
            const name = STOP.has((m[1] || '').toLowerCase()) ? '' : m[1] || '';
            const key = name ? `${name} [${m[2]}]` : `[${m[2]}]`;
            refs.set(key, true);
            if (name) { if (!byName.has(name)) byName.set(name, new Set()); byName.get(name).add(m[2]); }
        }
    }
    const dups = [...byName].filter(([, s]) => s.size >= 2).map(([n]) => n);
    return { refs: [...refs.keys()], dups, byName };
}

// INDEX already carries the section verbatim: never generate our own; append only extras missing from it.
function buildWithIndexSection({ session, pilot, index, topics, appendix, repoHandover, HEAD, hm }) {
    const rest = index.slice(hm.index + hm[0].length);
    const nx = rest.search(/^## /m);
    const section = nx < 0 ? rest : rest.slice(0, nx);
    const texts = [...topics, appendix];
    const paths = extractPaths(texts, repoHandover?.root).filter(([p]) => !section.includes(p));
    const { refs } = extractRefs(texts);
    const extraRefs = refs.filter((r) => !section.includes(r.slice(r.lastIndexOf('[') + 1, -1)));
    const out = [`# Handoff ${session} (Lunum variant, pilot #${pilot})`, '',
        'At the end of your first report write: `pilot: reasks=N rereads=N`.', '', splitSections(index), ''];
    if (paths.length || extraRefs.length) {
        out.push(`${HEAD} (extra, extracted)`, '');
        out.push(...paths.map(([p, e]) => `- ${p} (${e === null ? 'relative, unresolved' : e ? 'exists' : 'not found on disk'})`));
        out.push(...extraRefs.map((r) => `- ${r}`), '');
    }
    out.push(appendix.replace(/\s+$/, ''), '');
    return out.join('\n');
}

export function build({ session, pilot, index, topics, appendix, repoHandover }) {
    const HEAD = '## Working files and peers';
    const hm = index.match(/^## Working files and peers[ \t]*$/m);
    if (hm) return buildWithIndexSection({ session, pilot, index, topics, appendix, repoHandover, HEAD, hm });
    const texts = [index, ...topics, appendix];
    const paths = extractPaths(texts, repoHandover?.root);
    const { refs, dups, byName } = extractRefs(texts);
    const out = [];
    out.push(`# Handoff ${session} (Lunum variant, pilot #${pilot})`, '',
        'At the end of your first report write: `pilot: reasks=N rereads=N`.', '', splitSections(index), '',
        '## Working files and peers', '', '### Files and paths (extracted, max 40)');
    const lines = paths.map(([p, e]) => `- ${p} (${e === null ? 'relative, unresolved' : e ? 'exists' : 'not found on disk'})`);
    if (repoHandover) lines.push(`- ${repoHandover.path} (HANDOVER.md of the named repo; ${repoHandover.exists ? 'exists' : 'not found on disk'})`);
    out.push(...(lines.length ? lines : ['- none found']), '', '### Peer and session refs (extracted)');
    const rl = refs.map((r) => {
        const name = r.includes(' [') ? r.slice(0, r.indexOf(' [')) : '';
        return `- ${r}${name && dups.includes(name) ? ' (duplicate name: use the ref)' : ''}`;
    });
    for (const n of dups) rl.push(`- ${n}: ${[...byName.get(n)].map((h) => `[${h}]`).join(', ')} (duplicate name: use the ref)`);
    out.push(...(rl.length ? rl : ['- none found']), '', appendix.replace(/\s+$/, ''), '');
    return out.join('\n');
}

function repoHandoverOf(index) {
    const m = index.match(/\brepo\b[^\n~/]*?(~\/[\w./-]+|\/[\w./-]+)/i);
    if (!m) return null;
    const root = m[1].replace(/[.,;:)]+$/, '');
    const path = root.replace(/\/$/, '') + '/HANDOVER.md';
    return { root: expand(root), path, exists: existsSync(expand(path)) };
}

function main() {
    const { values: v } = parseArgs({ options: { dir: { type: 'string' }, session: { type: 'string' }, transcript: { type: 'string' }, pilot: { type: 'string', default: '1' }, 'redact-file': { type: 'string' } } });
    if (!v.dir || !v.session || !v.transcript) { console.error('usage: lunum-handoff-variant.mjs --dir D --session NAME --transcript T.jsonl [--pilot N] [--redact-file LIST]'); process.exit(2); }
    const D = resolve(v.dir);
    const indexPath = join(D, 'INDEX.md');
    const r = spawnSync(process.execPath, [APPENDIX, '--in', v.transcript, '--out', join(D, 'appendix.md'), '--index', indexPath], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`appendix failed: ${r.stderr}`); process.exit(1); }
    const index = readFileSync(indexPath, 'utf8');
    const td = join(D, 'topics');
    const topics = existsSync(td) ? readdirSync(td).filter((f) => f.endsWith('.md')).sort().map((f) => readFileSync(join(td, f), 'utf8')) : [];
    const appendix = readFileSync(join(D, 'appendix.md'), 'utf8');
    let text = build({ session: v.session, pilot: v.pilot, index, topics, appendix, repoHandover: repoHandoverOf(index) });
    if (v['redact-file']) {
        const lits = readFileSync(v['redact-file'], 'utf8').split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean).sort((a, b) => b.length - a.length);
        for (const l of lits) text = text.split(l).join('[REDACTED]');
    }
    const bad = scanSecrets(text);
    if (bad.length) { console.error(`secret-like patterns at variant lines: ${bad.join(', ')} (variant not written)`); process.exit(3); }
    mkdirSync(join(D, 'lunum'), { recursive: true });
    writeFileSync(join(D, 'lunum', 'INDEX.md'), text);
    console.log(JSON.stringify({ out: join(D, 'lunum', 'INDEX.md'), bytes: Buffer.byteLength(text) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
